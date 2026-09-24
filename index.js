// -----------------------------------------------------------------------------
// Entry point of the Pellet Stock external integration.
//
// No hardware, no cloud: the integration keeps a ledger of pellet bag
// movements (deliveries, consumption, counted stock) and derives the stock,
// the daily consumption and the autonomy from it. One ledger per stock — a
// default one, plus one per other house (see src/stocks.js) — and four ways in:
//   - the dashboard widget (SDK 0.14 `widgets`): "−1 bag", "+1 bag",
//     "Pallet delivered", "Undo" buttons, relayed to onWidgetAction;
//   - the manifest actions of the Configuration screen: correct the stock,
//     record a delivery or a consumption of any size, undo;
//   - the scene actions: use, add or count bags (a Zigbee button next to the
//     stove can decrement the stock), or read the figures for a message;
//   - and out: a virtual "Pellet stock" device per stock (stock + autonomy),
//     for the history charts and the scenes on the stock level.
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
import { message, translate } from './src/i18n.js';
import { StockError } from './src/ledger.js';
import { buildSceneOutputs } from './src/scene.js';
import { createStocks } from './src/stocks.js';
import { buildWidgetContent, buildUnknownStockContent } from './src/widget.js';

const gladys = new GladysIntegration();

let config = normalizeConfig();
let loaded = false;
let refreshTimer = null;

const stocks = createStocks({ gladys, logger, getConfig: () => config });

// The result message of each movement type.
const RESULT_KEYS = {
  [MOVEMENT_TYPES.DELIVERY]: 'delivery_recorded',
  [MOVEMENT_TYPES.CONSUMPTION]: 'consumption_recorded',
  [MOVEMENT_TYPES.INVENTORY]: 'inventory_recorded',
};

/**
 * @description Run a user operation and build the message shown to the user.
 * A refused operation (not enough stock, nothing to undo, unknown stock…) is
 * not a failure of the integration: its explanation is RETURNED, so the
 * manifest action shows it under the button and the widget shows it as a
 * toast, translated.
 * @param {Function} operation - Runs the operation, resolves the message.
 * @returns {Promise<{en: string, fr: string}>} The multi-language message.
 * @example
 * await runOperation(async () => message('undo_done'));
 */
async function runOperation(operation) {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof StockError) {
      return message(error.code, error.params);
    }
    throw error;
  }
}

/**
 * @description Record a movement from a user action.
 * @param {string} [stock] - The external id of the stock's device; none means the default stock.
 * @param {string} type - The movement type.
 * @param {unknown} bags - The bag count.
 * @returns {Promise<{en: string, fr: string}>} The message shown to the user.
 * @example
 * await recordFromUser(undefined, MOVEMENT_TYPES.DELIVERY, 66);
 */
function recordFromUser(stock, type, bags) {
  return runOperation(async () => {
    const store = stocks.storeOf(stock);
    const movement = await store.record({ type, bags });
    return message(RESULT_KEYS[type], { bags: movement.bags, stock: store.getStats().stock });
  });
}

/**
 * @description Undo the last movement of a stock.
 * @param {string} [stock] - The external id of the stock's device; none means the default stock.
 * @returns {Promise<{en: string, fr: string}>} The message shown to the user.
 * @example
 * await undoFromUser();
 */
function undoFromUser(stock) {
  return runOperation(async () => {
    const store = stocks.storeOf(stock);
    await store.undo();
    return message('undo_done', { stock: store.getStats().stock });
  });
}

// --- Discovery: one virtual device per stock ------------------------------

/**
 * @description Offer the device of every stock on the Discovery screen.
 * @returns {Promise<void>} Resolves once published.
 * @example
 * await publishDevices();
 */
function publishDevices() {
  return gladys.publishDiscoveredDevices(stocks.devices());
}

gladys.onScanRequest(publishDevices);

gladys.onDeviceCreated(async () => {
  // The device may be added long after the last movement: publish its
  // states now instead of waiting for the next change.
  await stocks.publishStates({ force: true });
});

gladys.onSetValue(async () => {
  throw new Error('The pellet stock features are read-only: use the widget or the actions.');
});

// --- Manifest actions (Configuration screen) -------------------------------

gladys.onAction('set_stock', (fields) =>
  recordFromUser(fields.stock, MOVEMENT_TYPES.INVENTORY, fields.bags),
);
gladys.onAction('add_delivery', (fields) =>
  recordFromUser(fields.stock, MOVEMENT_TYPES.DELIVERY, fields.bags),
);
gladys.onAction('consume', (fields) =>
  recordFromUser(fields.stock, MOVEMENT_TYPES.CONSUMPTION, fields.bags),
);
gladys.onAction('undo', (fields) => undoFromUser(fields.stock));

gladys.onAction('add_stock', (fields) =>
  runOperation(async () => {
    const stock = await stocks.add(fields.name);
    await publishDevices();
    return message('stock_added', { name: stock.name });
  }),
);
gladys.onAction('remove_stock', (fields) =>
  runOperation(async () => {
    const stock = await stocks.remove(fields.stock);
    await publishDevices();
    return message('stock_removed', { name: stock.name });
  }),
);

// --- Scene action ------------------------------------------------------------

/**
 * @description Run a scene action on the stock it picked, and return the
 * stock figures to the next actions of the scene.
 * @param {object} fields - The fields of the scene action.
 * @param {Function} [operation] - `(store) => Promise`, the change to make; none only reads.
 * @returns {Promise<object>} The outputs (see src/scene.js).
 * @example
 * await runSceneAction(fields, (store) => store.undo());
 */
async function runSceneAction(fields, operation) {
  let store;
  try {
    store = stocks.storeOf(fields.stock);
    if (operation) {
      await operation(store);
    }
  } catch (error) {
    // A scene action fails by throwing: the scene logs it and goes on.
    if (error instanceof StockError) {
      throw new Error(translate('en', error.code, error.params), { cause: error });
    }
    throw error;
  }
  await store.settled();
  return buildSceneOutputs(store.getStats(), config, new Date());
}

gladys.onSceneAction('consume_bags', (fields) =>
  runSceneAction(fields, (store) =>
    store.record({ type: MOVEMENT_TYPES.CONSUMPTION, bags: fields.bags }, { fromScene: true }),
  ),
);
gladys.onSceneAction('add_bags', (fields) =>
  runSceneAction(fields, (store) =>
    store.record({ type: MOVEMENT_TYPES.DELIVERY, bags: fields.bags }, { fromScene: true }),
  ),
);
gladys.onSceneAction('set_stock', (fields) =>
  runSceneAction(fields, (store) =>
    store.record({ type: MOVEMENT_TYPES.INVENTORY, bags: fields.bags }, { fromScene: true }),
  ),
);
gladys.onSceneAction('read_stock', (fields) => runSceneAction(fields));

// --- Dashboard widget ----------------------------------------------------------

gladys.onWidgetGet(WIDGET_KEY, async ({ settings = {}, language }) => {
  await stocks.settled();
  const stock = stocks.find(settings.stock);
  if (!stock) {
    return buildUnknownStockContent(language);
  }
  const store = stocks.storeOf(settings.stock);
  return buildWidgetContent({
    ledger: store.getLedger(),
    stats: store.getStats(),
    config,
    settings,
    language,
    stockName: stock.name,
    now: new Date(),
  });
});

gladys.onWidgetAction(WIDGET_KEY, (actionKey, params, { settings = {} } = {}) => {
  switch (actionKey) {
    case WIDGET_ACTIONS.CONSUME:
      return recordFromUser(settings.stock, MOVEMENT_TYPES.CONSUMPTION, params.bags);
    case WIDGET_ACTIONS.ADD_BAG:
    case WIDGET_ACTIONS.DELIVERY:
      return recordFromUser(settings.stock, MOVEMENT_TYPES.DELIVERY, params.bags);
    case WIDGET_ACTIONS.UNDO:
      return undoFromUser(settings.stock);
    default:
      throw new Error(`Unknown widget action: ${actionKey}`);
  }
});

// --- Config & lifecycle ----------------------------------------------------------

gladys.onConfigUpdated(async (newConfig) => {
  config = normalizeConfig(newConfig);
  // The window and the threshold change the autonomy and the widget colors.
  await stocks.notifyChange();
});

gladys.on('connected', async () => {
  config = normalizeConfig(gladys.config);
  try {
    if (!loaded) {
      await stocks.load();
      loaded = true;
    }
    await stocks.publishStates({ force: true });
  } catch (error) {
    logger.error('Could not load the pellet stock', error);
  }
  // Nothing to scan for a virtual device: offer it from the start, so the
  // Discovery screen is never empty before a first scan.
  try {
    await publishDevices();
  } catch (error) {
    logger.error('Could not publish the pellet stock device', error);
  }
});

// The autonomy drifts with time even without any movement (the consumption
// window slides): republish it when it changed. The widget follows through
// its own TTL.
refreshTimer = setInterval(() => {
  if (loaded && gladys.connected) {
    stocks.publishStates().catch((error) => logger.debug('Hourly refresh failed', error));
  }
}, REFRESH_INTERVAL_MS);

gladys.handleShutdown(() => {
  clearInterval(refreshTimer);
});

logger.info('Starting the Pellet Stock integration...');
await gladys.connect();
