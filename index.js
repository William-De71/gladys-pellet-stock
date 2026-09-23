// -----------------------------------------------------------------------------
// Entry point of the Pellet Stock external integration.
//
// No hardware, no cloud: the integration keeps a ledger of pellet bag
// movements (deliveries, consumption, counted stock) and derives the stock,
// the daily consumption and the autonomy from it. Four ways in, one ledger:
//   - the dashboard widget (SDK 0.14 `widgets`): "−1 bag", "+1 bag",
//     "Pallet delivered", "Undo" buttons, relayed to onWidgetAction;
//   - the manifest actions of the Configuration screen: correct the stock,
//     record a delivery or a consumption of any size, undo;
//   - the `consume_bags` scene action: a Zigbee button next to the stove can
//     decrement the stock through a scene;
//   - and out: a virtual "Pellet stock" device (stock + autonomy), for the
//     history charts and the scenes on the stock level.
//
// The ledger is stored through setConfig() under a key outside the
// config_schema (see constants.js): it lives in the Gladys database, so it is
// part of the Gladys backups.
//
// Environment variables provided by the Gladys supervisor:
//   GLADYS_HOST_API_URL / GLADYS_INTEGRATION_TOKEN / GLADYS_INTEGRATION_SELECTOR
// The SDK reads them automatically: `new GladysIntegration()` is enough.
// -----------------------------------------------------------------------------

import { GladysIntegration, logger } from '@gladysassistant/integration-sdk';
import { normalizeConfig } from './src/config.js';
import {
  MOVEMENT_TYPES,
  REFRESH_INTERVAL_MS,
  WIDGET_ACTIONS,
  WIDGET_KEY,
} from './src/constants.js';
import { buildDevice } from './src/device.js';
import { message, translate } from './src/i18n.js';
import { StockError } from './src/ledger.js';
import { createStockStore } from './src/store.js';
import { buildWidgetContent } from './src/widget.js';

const gladys = new GladysIntegration();

let config = normalizeConfig();
let loaded = false;
let refreshTimer = null;

const store = createStockStore({ gladys, logger, getConfig: () => config });

// The result message of each movement type.
const RESULT_KEYS = {
  [MOVEMENT_TYPES.DELIVERY]: 'delivery_recorded',
  [MOVEMENT_TYPES.CONSUMPTION]: 'consumption_recorded',
  [MOVEMENT_TYPES.INVENTORY]: 'inventory_recorded',
};

/**
 * @description Record a movement and build the message shown to the user. A
 * refused operation (not enough stock, nothing to undo…) is not a failure of
 * the integration: its explanation is RETURNED, so the manifest action shows
 * it under the button and the widget shows it as a toast, translated.
 * @param {Function} operation - Runs the store operation, resolves the movement.
 * @param {Function} resultKey - Picks the success message key from the movement.
 * @returns {Promise<{en: string, fr: string}>} The multi-language message.
 * @example
 * await runOperation(() => store.undo(), () => 'undo_done');
 */
async function runOperation(operation, resultKey) {
  try {
    const movement = await operation();
    return message(resultKey(movement), { bags: movement.bags, stock: store.getStats().stock });
  } catch (error) {
    if (error instanceof StockError) {
      return message(error.code, error.params);
    }
    throw error;
  }
}

/**
 * @description Record a movement from a user action.
 * @param {string} type - The movement type.
 * @param {unknown} bags - The bag count.
 * @returns {Promise<{en: string, fr: string}>} The message shown to the user.
 * @example
 * await recordFromUser(MOVEMENT_TYPES.DELIVERY, 66);
 */
function recordFromUser(type, bags) {
  return runOperation(
    () => store.record({ type, bags }),
    () => RESULT_KEYS[type],
  );
}

// --- Discovery: the single virtual device --------------------------------

gladys.onScanRequest(async () => {
  await gladys.publishDiscoveredDevices([buildDevice(gladys)]);
});

gladys.onDeviceCreated(async () => {
  // The device may be added long after the last movement: publish its
  // states now instead of waiting for the next change.
  await store.publishStates({ force: true });
});

gladys.onSetValue(async () => {
  throw new Error('The pellet stock features are read-only: use the widget or the actions.');
});

// --- Manifest actions (Configuration screen) -------------------------------

gladys.onAction('set_stock', (fields) => recordFromUser(MOVEMENT_TYPES.INVENTORY, fields.bags));
gladys.onAction('add_delivery', (fields) => recordFromUser(MOVEMENT_TYPES.DELIVERY, fields.bags));
gladys.onAction('consume', (fields) => recordFromUser(MOVEMENT_TYPES.CONSUMPTION, fields.bags));
gladys.onAction('undo', () =>
  runOperation(
    () => store.undo(),
    () => 'undo_done',
  ),
);

// --- Scene action ------------------------------------------------------------

gladys.onSceneAction('consume_bags', async (fields) => {
  try {
    await store.record({ type: MOVEMENT_TYPES.CONSUMPTION, bags: fields.bags });
  } catch (error) {
    // A scene action fails by throwing: the scene logs it and goes on.
    if (error instanceof StockError) {
      throw new Error(translate('en', error.code, error.params), { cause: error });
    }
    throw error;
  }
  const stats = store.getStats();
  return {
    stock: stats.stock,
    ...(stats.autonomyDays !== null && { autonomy_days: stats.autonomyDays }),
  };
});

// --- Dashboard widget ----------------------------------------------------------

gladys.onWidgetGet(WIDGET_KEY, async ({ settings, language }) => {
  await store.settled();
  return buildWidgetContent({
    ledger: store.getLedger(),
    stats: store.getStats(),
    config,
    settings,
    language,
    now: new Date(),
  });
});

gladys.onWidgetAction(WIDGET_KEY, (actionKey, params) => {
  switch (actionKey) {
    case WIDGET_ACTIONS.CONSUME:
      return recordFromUser(MOVEMENT_TYPES.CONSUMPTION, params.bags);
    case WIDGET_ACTIONS.ADD_BAG:
    case WIDGET_ACTIONS.DELIVERY:
      return recordFromUser(MOVEMENT_TYPES.DELIVERY, params.bags);
    case WIDGET_ACTIONS.UNDO:
      return runOperation(
        () => store.undo(),
        () => 'undo_done',
      );
    default:
      throw new Error(`Unknown widget action: ${actionKey}`);
  }
});

// --- Config & lifecycle ----------------------------------------------------------

gladys.onConfigUpdated(async (newConfig) => {
  config = normalizeConfig(newConfig);
  // The window and the threshold change the autonomy and the widget colors.
  await store.notifyChange();
});

gladys.on('connected', async () => {
  config = normalizeConfig(gladys.config);
  try {
    if (!loaded) {
      await store.load();
      loaded = true;
    }
    await store.publishStates({ force: true });
  } catch (error) {
    logger.error('Could not load the pellet stock', error);
  }
});

// The autonomy drifts with time even without any movement (the consumption
// window slides): republish it when it changed. The widget follows through
// its own TTL.
refreshTimer = setInterval(() => {
  if (loaded && gladys.connected) {
    store.publishStates().catch((error) => logger.debug('Hourly refresh failed', error));
  }
}, REFRESH_INTERVAL_MS);

gladys.handleShutdown(() => {
  clearInterval(refreshTimer);
});

logger.info('Starting the Pellet Stock integration...');
await gladys.connect();
