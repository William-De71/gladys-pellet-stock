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
 *   consumptionWindow: number, bagPrice: number|null}} The normalized config.
 *   The bag price is the pallet price divided by the bags per pallet; a price
 *   of 0 counts as no price.
 * @example
 * normalizeConfig({ bag_weight: 15 });
 */
function normalizeConfig(raw = {}) {
  const palletSize = Math.round(
    readNumber(raw[CONFIG_KEYS.PALLET_SIZE], DEFAULTS.palletSize, LIMITS.palletSize),
  );
  // The price is entered per pallet: the core number field only takes whole
  // numbers, too coarse for a bag at 7.29 € but fine for a pallet at 459 €.
  const palletPrice = readNumber(raw[CONFIG_KEYS.PALLET_PRICE], 0, LIMITS.palletPrice);
  return {
    bagWeight: readNumber(raw[CONFIG_KEYS.BAG_WEIGHT], DEFAULTS.bagWeight, LIMITS.bagWeight),
    palletSize,
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
    bagPrice: palletPrice > 0 ? palletPrice / palletSize : DEFAULTS.bagPrice,
  };
}

export { normalizeConfig, readNumber };
