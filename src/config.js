// -----------------------------------------------------------------------------
// Normalization of the integration config, and the settings of each stock.
//
// The core validates the declared min/max, but a value can still be absent
// (never saved) or arrive as a string: every field falls back to its default
// and is clamped, so the rest of the code never checks a config value again.
//
// A stock may have settings of its own ("Set up a stock"): each one it does
// not have takes the value of the Configuration screen, which holds the
// defaults of every stock.
// -----------------------------------------------------------------------------

import { CONFIG_KEYS, DEFAULTS, LIMITS } from './constants.js';
import { StockError } from './ledger.js';

// The settings a stock may override: their key in the normalized config, the
// field of the config_schema (and of the "Set up a stock" action) carrying them.
const STOCK_SETTINGS = [
  { key: 'bagWeight', field: CONFIG_KEYS.BAG_WEIGHT, limits: LIMITS.bagWeight },
  { key: 'palletSize', field: CONFIG_KEYS.PALLET_SIZE, limits: LIMITS.palletSize, integer: true },
  {
    key: 'lowStockThreshold',
    field: CONFIG_KEYS.LOW_STOCK_THRESHOLD,
    limits: LIMITS.lowStockThreshold,
    integer: true,
  },
  {
    key: 'consumptionWindow',
    field: CONFIG_KEYS.CONSUMPTION_WINDOW,
    limits: LIMITS.consumptionWindow,
    integer: true,
  },
  // 0 is a price of its own: "no price for this stock", whatever the default.
  { key: 'palletPrice', field: CONFIG_KEYS.PALLET_PRICE, limits: LIMITS.palletPrice, price: true },
];

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
 *   consumptionWindow: number, palletPrice: number|null, bagPrice: number|null}}
 *   The normalized config. The bag price is the pallet price divided by the
 *   bags per pallet; a price of 0 counts as no price.
 * @example
 * normalizeConfig({ bag_weight: 15 });
 */
function normalizeConfig(raw = {}) {
  const palletSize = Math.round(
    readNumber(raw[CONFIG_KEYS.PALLET_SIZE], DEFAULTS.palletSize, LIMITS.palletSize),
  );
  // The price is entered per pallet, as on the invoice; decimals are accepted
  // (core number fields take them since Gladys PR #3167).
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
    palletPrice: palletPrice > 0 ? palletPrice : DEFAULTS.palletPrice,
    bagPrice: palletPrice > 0 ? palletPrice / palletSize : DEFAULTS.bagPrice,
  };
}

/**
 * @description Read one stock setting.
 * @param {object} setting - The STOCK_SETTINGS entry.
 * @param {unknown} raw - The raw value.
 * @returns {number|null|undefined} The value (null: no price), undefined when left empty.
 * @throws {StockError} When the value is not a number within the range.
 * @example
 * readStockSetting(STOCK_SETTINGS[0], '10'); // -> 10
 */
function readStockSetting(setting, raw) {
  if (raw === undefined || (typeof raw === 'string' && raw.trim() === '')) {
    return undefined;
  }
  if (raw === null) {
    // Only a stored "no price"; a field left empty is undefined.
    return setting.price ? null : undefined;
  }
  const value = typeof raw === 'string' ? Number(raw) : raw;
  const { min, max } = setting.limits;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
    throw new StockError('invalid_setting', { min, max });
  }
  if (setting.price && value === 0) {
    return null;
  }
  return setting.integer ? Math.round(value) : value;
}

/**
 * @description Read the settings typed in the "Set up a stock" action: the
 * fields left empty are not part of the result.
 * @param {object} fields - The action fields, keyed like the config_schema.
 * @returns {object} The settings, keyed like the normalized config.
 * @throws {StockError} When a value is out of range.
 * @example
 * readStockSettings({ bag_weight: 10, pallet_size: '' }); // -> { bagWeight: 10 }
 */
function readStockSettings(fields = {}) {
  const settings = {};
  STOCK_SETTINGS.forEach((setting) => {
    const value = readStockSetting(setting, fields[setting.field]);
    if (value !== undefined) {
      settings[setting.key] = value;
    }
  });
  return settings;
}

/**
 * @description Read the stored settings of a stock, dropping any unknown or
 * invalid one: it then simply takes the default again.
 * @param {unknown} raw - The stored settings.
 * @returns {object} The settings, keyed like the normalized config.
 * @example
 * parseStockSettings({ bagWeight: 10, color: 'red' }); // -> { bagWeight: 10 }
 */
function parseStockSettings(raw) {
  const settings = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return settings;
  }
  STOCK_SETTINGS.forEach((setting) => {
    if (!Object.hasOwn(raw, setting.key)) {
      return;
    }
    try {
      const value = readStockSetting(setting, raw[setting.key]);
      if (value !== undefined) {
        settings[setting.key] = value;
      }
    } catch {
      // Dropped: the default applies.
    }
  });
  return settings;
}

/**
 * @description The effective config of a stock: its own settings over the
 * normalized config, the bag price derived again.
 * @param {object} config - The normalized config (the defaults).
 * @param {object} [settings] - The settings of the stock.
 * @returns {object} The effective config, shaped like normalizeConfig()'s.
 * @example
 * withStockSettings(config, { palletSize: 96 });
 */
function withStockSettings(config, settings = {}) {
  const effective = { ...config };
  STOCK_SETTINGS.forEach(({ key }) => {
    if (Object.hasOwn(settings, key)) {
      effective[key] = settings[key];
    }
  });
  effective.bagPrice =
    effective.palletPrice > 0 ? effective.palletPrice / effective.palletSize : DEFAULTS.bagPrice;
  return effective;
}

export {
  STOCK_SETTINGS,
  normalizeConfig,
  readNumber,
  readStockSettings,
  parseStockSettings,
  withStockSettings,
};
