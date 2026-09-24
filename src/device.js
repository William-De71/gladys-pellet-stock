// -----------------------------------------------------------------------------
// The "Pellet stock" device.
//
// The widget does not need it (it is computed inline from the ledger), but a
// device brings what only the core offers: the history of the stock in the
// standard chart box, and scenes on its value ("stock below 10 bags → send me
// a message"). Each stock is a virtual device, offered on the Discovery
// screen, where the user puts it in a room — hence in a house.
//
// Both features are read-only sensors: the stock changes through movements
// (actions, widget buttons, scene actions), never by setting a value.
// -----------------------------------------------------------------------------

import {
  DEVICE_FEATURE_CATEGORIES,
  DEVICE_FEATURE_TYPES,
  DEVICE_FEATURE_UNITS,
} from '@gladysassistant/integration-sdk';
import { DEVICE_ID, DEVICE_TYPE, FEATURE_KEYS, LIMITS } from './constants.js';
import { translate } from './i18n.js';

// Upper bound of the autonomy feature: ten years, far beyond any real stock.
const MAX_AUTONOMY_DAYS = 3650;

/**
 * @description The external id of a stock's device.
 * @param {object} gladys - The GladysIntegration instance.
 * @param {string} [stockId] - The stock id, the default one when omitted.
 * @returns {string} The device external id.
 * @example
 * deviceExternalId(gladys, 'stock'); // -> 'ext:pellet-stock:pellet:stock'
 */
function deviceExternalId(gladys, stockId = DEVICE_ID) {
  return gladys.externalIds(DEVICE_TYPE, stockId).device;
}

/**
 * @description Build the device of a stock, offered on the Discovery screen.
 * @param {object} gladys - The GladysIntegration instance (for the external ids).
 * @param {string} [language] - Language of the default names.
 * @param {{id: string, name: string|null}} [stock] - The stock, the default one when omitted.
 * @returns {object} The discovered device.
 * @example
 * await gladys.publishDiscoveredDevices([buildDevice(gladys, 'fr', { id: 'a1b2c3d4', name: 'Chalet' })]);
 */
function buildDevice(gladys, language = 'en', { id = DEVICE_ID, name = null } = {}) {
  const ids = gladys.externalIds(DEVICE_TYPE, id);
  const deviceName = translate(language, 'device_name');
  return {
    name: name ? `${deviceName} – ${name}` : deviceName,
    external_id: ids.device,
    should_poll: false,
    features: [
      {
        name: translate(language, 'feature_stock'),
        external_id: ids.feature(FEATURE_KEYS.STOCK),
        category: DEVICE_FEATURE_CATEGORIES.COUNTER_SENSOR,
        type: DEVICE_FEATURE_TYPES.SENSOR.INTEGER,
        min: LIMITS.stockBags.min,
        max: LIMITS.stockBags.max,
        read_only: true,
        has_feedback: false,
        keep_history: true,
      },
      {
        name: translate(language, 'feature_autonomy'),
        external_id: ids.feature(FEATURE_KEYS.AUTONOMY),
        category: DEVICE_FEATURE_CATEGORIES.DURATION,
        type: DEVICE_FEATURE_TYPES.DURATION.INTEGER,
        unit: DEVICE_FEATURE_UNITS.DAYS,
        min: 0,
        max: MAX_AUTONOMY_DAYS,
        read_only: true,
        has_feedback: false,
        keep_history: true,
      },
    ],
  };
}

/**
 * @description The states to publish for the current figures. An unknown
 * autonomy (no consumption yet, or less than one day of history) is omitted,
 * never published as 0 — a 0 would read as "empty" and fire the scenes.
 * @param {object} gladys - The GladysIntegration instance (for the external ids).
 * @param {{stock: number, autonomyDays: number|null}} stats - The stock figures.
 * @param {string} [stockId] - The stock id, the default one when omitted.
 * @returns {Array<{device_feature_external_id: string, state: number}>} The states.
 * @example
 * await gladys.publishStates(buildStates(gladys, stats));
 */
function buildStates(gladys, stats, stockId = DEVICE_ID) {
  const ids = gladys.externalIds(DEVICE_TYPE, stockId);
  const states = [
    { device_feature_external_id: ids.feature(FEATURE_KEYS.STOCK), state: stats.stock },
  ];
  if (stats.autonomyDays !== null) {
    states.push({
      device_feature_external_id: ids.feature(FEATURE_KEYS.AUTONOMY),
      state: Math.min(stats.autonomyDays, MAX_AUTONOMY_DAYS),
    });
  }
  return states;
}

export { buildDevice, buildStates, deviceExternalId, MAX_AUTONOMY_DAYS };
