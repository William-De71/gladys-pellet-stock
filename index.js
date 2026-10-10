// -----------------------------------------------------------------------------
// Entry point of the Pellet Stock external integration.
//
// No hardware, no cloud: the integration keeps a ledger of pellet bag
// movements (deliveries, consumption, counted stock) and derives the stock,
// the daily consumption and the autonomy from it. One ledger per stock — a
// default one, plus one per house (see src/stocks.js) — and four ways in:
//   - the dashboard widget (SDK 0.14 `widgets`): "Remove bag(s)", "Add
//     bag(s)", "Pallet delivered", "Undo" buttons, relayed to onWidgetAction;
//   - the manifest actions of the Configuration screen: correct the stock,
//     record a delivery or a consumption of any size, undo, analyze the cost
//     of a period, and manage the stocks (houses, settings);
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
import { REFRESH_INTERVAL_MS } from './src/constants.js';
import { registerHandlers } from './src/handlers.js';
import { createStocks } from './src/stocks.js';

const gladys = new GladysIntegration();

let config = normalizeConfig();
let refreshTimer = null;

const stocks = createStocks({ gladys, logger, getConfig: () => config });

const { publishDevices } = registerHandlers({ gladys, stocks });

// --- Config & lifecycle ----------------------------------------------------------

gladys.onConfigUpdated(async (newConfig) => {
  config = normalizeConfig(newConfig);
  // The defaults of every stock: the window and the threshold change the
  // autonomy and the widget colors.
  await stocks.notifyChange();
});

gladys.on('connected', async () => {
  config = normalizeConfig(gladys.config);
  try {
    // Loads once; after a failed load, the next reconnection (or the first
    // user operation) tries again.
    await stocks.ready();
    await stocks.publishStates({ force: true });
  } catch {
    // Already logged by ready().
  }
  await stocks.refreshHouses();
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
// A renamed house follows on the same beat.
refreshTimer = setInterval(async () => {
  if (!stocks.isLoaded() || !gladys.connected) {
    return;
  }
  try {
    if (await stocks.refreshHouses()) {
      await stocks.notifyChange();
    } else {
      await stocks.publishStates();
    }
  } catch (error) {
    logger.debug('Hourly refresh failed', error);
  }
}, REFRESH_INTERVAL_MS);

gladys.handleShutdown(() => {
  clearInterval(refreshTimer);
});

logger.info('Starting the Pellet Stock integration...');
await gladys.connect();
