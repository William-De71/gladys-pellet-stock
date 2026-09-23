// -----------------------------------------------------------------------------
// The "Pellet stock" device.
//
// The widget does not need it (it is computed inline from the ledger), but a
// device brings what only the core offers: the history of the stock in the
// standard chart box, and scenes on its value ("stock below 10 bags → send me
// a message"). The integration has a single, virtual device, offered on the
// Discovery screen.
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
 * @description Build the device offered on the Discovery screen.
 * @param {object} gladys - The GladysIntegration instance (for the external ids).
 * @param {string} [language] - Language of the default names.
 * @returns {object} The discovered device.
 * @example
 * await gladys.publishDiscoveredDevices([buildDevice(gladys, 'fr')]);
 */
function buildDevice(gladys, language = 'en') {
  const ids = gladys.externalIds(DEVICE_TYPE, DEVICE_ID);
  return {
    name: translate(language, 'device_name'),
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
 * @returns {Array<{device_feature_external_id: string, state: number}>} The states.
 * @example
 * await gladys.publishStates(buildStates(gladys, stats));
 */
function buildStates(gladys, stats) {
  const ids = gladys.externalIds(DEVICE_TYPE, DEVICE_ID);
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

export { buildDevice, buildStates, MAX_AUTONOMY_DAYS };
