// -----------------------------------------------------------------------------
// The "Pellet stock" device.
//
// The widget does not need it (it is computed inline from the ledger), but a
// device brings what only the core offers: the history of the stock in the
// standard chart box, and scenes on its value ("stock below 10 bags → send me
// a message"). Each stock is a virtual device, offered on the Discovery
// screen, where the user puts it in a room — hence in a house.
//
// A silo is a device of its own: its level in kg, its fill rate (in % of its
// capacity, once known) and its autonomy.
//
// Every feature is a read-only sensor: the stock changes through movements
// (actions, widget buttons, scene actions), never by setting a value.
// -----------------------------------------------------------------------------

import {
  DEVICE_FEATURE_CATEGORIES,
  DEVICE_FEATURE_TYPES,
  DEVICE_FEATURE_UNITS,
} from '@gladysassistant/integration-sdk';
import { DEVICE_ID, DEVICE_TYPE, FEATURE_KEYS, LIMITS, STOCK_TYPES } from './constants.js';
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
 * @description A read-only sensor feature with history.
 * @param {object} feature - Its name, external id, category, type and bounds.
 * @returns {object} The feature.
 */
function sensor(feature) {
  return { ...feature, read_only: true, has_feedback: false, keep_history: true };
}

/**
 * @description Build the device of a stock, offered on the Discovery screen.
 * @param {object} gladys - The GladysIntegration instance (for the external ids).
 * @param {string} [language] - Language of the default names.
 * @param {{id: string, name: string|null, type?: string}} [stock] - The stock, the default one when omitted.
 * @returns {object} The discovered device.
 * @example
 * await gladys.publishDiscoveredDevices([buildDevice(gladys, 'fr', { id: 'a1b2c3d4', name: 'Chalet' })]);
 */
function buildDevice(gladys, language = 'en', { id = DEVICE_ID, name = null, type } = {}) {
  const ids = gladys.externalIds(DEVICE_TYPE, id);
  const isBulk = type === STOCK_TYPES.BULK;
  const deviceName = translate(language, isBulk ? 'silo_device_name' : 'device_name');
  const autonomy = sensor({
    name: translate(language, isBulk ? 'feature_silo_autonomy' : 'feature_autonomy'),
    external_id: ids.feature(FEATURE_KEYS.AUTONOMY),
    category: DEVICE_FEATURE_CATEGORIES.DURATION,
    type: DEVICE_FEATURE_TYPES.DURATION.INTEGER,
    unit: DEVICE_FEATURE_UNITS.DAYS,
    min: 0,
    max: MAX_AUTONOMY_DAYS,
  });
  const features = isBulk
    ? [
        // Gladys has no kg unit: the name carries it.
        sensor({
          name: translate(language, 'feature_silo_level'),
          external_id: ids.feature(FEATURE_KEYS.LEVEL),
          category: DEVICE_FEATURE_CATEGORIES.COUNTER_SENSOR,
          type: DEVICE_FEATURE_TYPES.SENSOR.INTEGER,
          min: LIMITS.stockKg.min,
          max: LIMITS.stockKg.max,
        }),
        sensor({
          name: translate(language, 'feature_silo_fill'),
          external_id: ids.feature(FEATURE_KEYS.FILL),
          category: DEVICE_FEATURE_CATEGORIES.LEVEL_SENSOR,
          type: DEVICE_FEATURE_TYPES.LEVEL_SENSOR.LIQUID_LEVEL_PERCENT,
          unit: DEVICE_FEATURE_UNITS.PERCENT,
          min: LIMITS.percent.min,
          max: LIMITS.percent.max,
        }),
        autonomy,
      ]
    : [
        sensor({
          name: translate(language, 'feature_stock'),
          external_id: ids.feature(FEATURE_KEYS.STOCK),
          category: DEVICE_FEATURE_CATEGORIES.COUNTER_SENSOR,
          type: DEVICE_FEATURE_TYPES.SENSOR.INTEGER,
          min: LIMITS.stockBags.min,
          max: LIMITS.stockBags.max,
        }),
        autonomy,
      ];
  return {
    name: name ? `${deviceName} – ${name}` : deviceName,
    external_id: ids.device,
    should_poll: false,
    features,
  };
}

/**
 * @description The fill rate of a silo.
 * @param {number} kg - Its level.
 * @param {number|null} capacity - Its capacity in kg, null when unknown.
 * @returns {number|null} The rate in % (0-100, rounded), null without a capacity.
 * @example
 * fillPercent(1500, 4000); // -> 38
 */
function fillPercent(kg, capacity) {
  if (!(capacity > 0)) {
    return null;
  }
  return Math.min(100, Math.round((kg / capacity) * 100));
}

/**
 * @description The states to publish for the current figures. An unknown
 * autonomy (no consumption yet, or less than one day of history) is omitted,
 * never published as 0 — a 0 would read as "empty" and fire the scenes.
 * @param {object} gladys - The GladysIntegration instance (for the external ids).
 * @param {{stock: number, autonomyDays: number|null}} stats - The stock figures.
 * @param {string} [stockId] - The stock id, the default one when omitted.
 * @param {string} [type] - The stock type.
 * @param {{bulkCapacity?: number|null}} [config] - The effective config of the stock.
 * @returns {Array<{device_feature_external_id: string, state: number}>} The states.
 * @example
 * await gladys.publishStates(buildStates(gladys, stats));
 */
function buildStates(gladys, stats, stockId = DEVICE_ID, type = STOCK_TYPES.BAGS, config = {}) {
  const ids = gladys.externalIds(DEVICE_TYPE, stockId);
  const states = [];
  if (type === STOCK_TYPES.BULK) {
    states.push({
      device_feature_external_id: ids.feature(FEATURE_KEYS.LEVEL),
      state: stats.stock,
    });
    const fill = fillPercent(stats.stock, config.bulkCapacity);
    if (fill !== null) {
      states.push({ device_feature_external_id: ids.feature(FEATURE_KEYS.FILL), state: fill });
    }
  } else {
    states.push({
      device_feature_external_id: ids.feature(FEATURE_KEYS.STOCK),
      state: stats.stock,
    });
  }
  if (stats.autonomyDays !== null) {
    states.push({
      device_feature_external_id: ids.feature(FEATURE_KEYS.AUTONOMY),
      state: Math.min(stats.autonomyDays, MAX_AUTONOMY_DAYS),
    });
  }
  return states;
}

export { buildDevice, buildStates, deviceExternalId, fillPercent, MAX_AUTONOMY_DAYS };
