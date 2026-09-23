// -----------------------------------------------------------------------------
// Normalization of the integration config.
//
// The core validates the declared min/max, but a value can still be absent
// (never saved) or arrive as a string: every field falls back to its default
// and is clamped, so the rest of the code never checks a config value again.
// -----------------------------------------------------------------------------

import { CONFIG_KEYS, DEFAULTS, LIMITS } from './constants.js';

/**
 * @description Read a number from a raw config value, clamped to its limits.
 * @param {unknown} raw - The raw value.
 * @param {number} fallback - Used when the value is not a finite number.
 * @param {{min: number, max: number}} limits - The accepted range.
 * @returns {number} The normalized number.
 * @example
 * readNumber('15', 15, { min: 1, max: 50 }); // -> 15
 */
function readNumber(raw, fallback, { min, max }) {
  const value = typeof raw === 'string' && raw.trim() !== '' ? Number(raw) : raw;
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, value));
}

/**
 * @description Normalize the raw integration config.
 * @param {object} [raw] - The config as received from Gladys.
 * @returns {{bagWeight: number, palletSize: number, lowStockThreshold: number,
 *   consumptionWindow: number}} The normalized config.
 * @example
 * normalizeConfig({ bag_weight: 15 });
 */
function normalizeConfig(raw = {}) {
  return {
    bagWeight: readNumber(raw[CONFIG_KEYS.BAG_WEIGHT], DEFAULTS.bagWeight, LIMITS.bagWeight),
    palletSize: Math.round(
      readNumber(raw[CONFIG_KEYS.PALLET_SIZE], DEFAULTS.palletSize, LIMITS.palletSize),
    ),
    lowStockThreshold: Math.round(
      readNumber(
        raw[CONFIG_KEYS.LOW_STOCK_THRESHOLD],
        DEFAULTS.lowStockThreshold,
        LIMITS.lowStockThreshold,
      ),
    ),
    consumptionWindow: Math.round(
      readNumber(
        raw[CONFIG_KEYS.CONSUMPTION_WINDOW],
        DEFAULTS.consumptionWindow,
        LIMITS.consumptionWindow,
      ),
    ),
  };
}

export { normalizeConfig, readNumber };
