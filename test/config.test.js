import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeConfig,
  parseStockSettings,
  readStockSettings,
  withStockSettings,
} from '../src/config.js';
import { DEFAULTS } from '../src/constants.js';

test('normalizeConfig: defaults when nothing was saved', () => {
  assert.deepEqual(normalizeConfig(), DEFAULTS);
  assert.deepEqual(normalizeConfig({}), DEFAULTS);
});

test('normalizeConfig: reads numbers sent as strings', () => {
  const config = normalizeConfig({
    bag_weight: '12.5',
    pallet_size: '72',
    low_stock_threshold: '5',
    consumption_window: '30',
    pallet_price: '504',
  });
  assert.deepEqual(config, {
    bagWeight: 12.5,
    palletSize: 72,
    lowStockThreshold: 5,
    consumptionWindow: 30,
    palletPrice: 504,
    bagPrice: 7,
    bulkCapacity: DEFAULTS.bulkCapacity,
    bulkLowThreshold: DEFAULTS.bulkLowThreshold,
    bulkDelivery: DEFAULTS.bulkDelivery,
    bulkTonnePrice: DEFAULTS.bulkTonnePrice,
    bulkReadingUnit: DEFAULTS.bulkReadingUnit,
    language: DEFAULTS.language,
  });
});

test('normalizeConfig: the language of the device names, English by default', () => {
  assert.equal(normalizeConfig({ language: 'de' }).language, 'de');
  assert.equal(normalizeConfig({ language: 'es' }).language, 'es');
  assert.equal(normalizeConfig({ language: 'it' }).language, 'en');
  assert.equal(normalizeConfig({}).language, 'en');
});

test('normalizeConfig: clamps out-of-range values and ignores garbage', () => {
  const config = normalizeConfig({
    bag_weight: 500,
    pallet_size: 0,
    low_stock_threshold: 'abc',
    consumption_window: 1,
  });
  assert.equal(config.bagWeight, 50);
  assert.equal(config.palletSize, 1);
  assert.equal(config.lowStockThreshold, DEFAULTS.lowStockThreshold);
  assert.equal(config.consumptionWindow, 3);
});

test('normalizeConfig: no price, or a price of 0, hides the cost', () => {
  assert.equal(normalizeConfig({}).bagPrice, null);
  assert.equal(normalizeConfig({ pallet_price: '' }).bagPrice, null);
  assert.equal(normalizeConfig({ pallet_price: 0 }).bagPrice, null);
  assert.equal(normalizeConfig({ pallet_price: 0 }).palletPrice, null);
  assert.equal(normalizeConfig({ pallet_price: 99999, pallet_size: 50 }).bagPrice, 100);
});

test('normalizeConfig: the bag price is the pallet price split over its bags', () => {
  assert.equal(normalizeConfig({ pallet_price: 481 }).bagPrice, 481 / 66);
  assert.equal(normalizeConfig({ pallet_price: 525, pallet_size: 72 }).bagPrice, 525 / 72);
});

test('stock settings: read from the action, an empty field left out', () => {
  assert.deepEqual(
    readStockSettings({
      bag_weight: '9.5',
      pallet_size: 96.4,
      low_stock_threshold: '',
      consumption_window: undefined,
      pallet_price: 0,
    }),
    { bagWeight: 9.5, palletSize: 96, palletPrice: null },
  );
  assert.throws(() => readStockSettings({ pallet_size: 0 }), { code: 'invalid_setting' });
  assert.throws(() => readStockSettings({ bag_weight: 'abc' }), { code: 'invalid_setting' });
});

test('stock settings: the stored ones are checked again, a bad one dropped', () => {
  assert.deepEqual(parseStockSettings(null), {});
  assert.deepEqual(parseStockSettings({ bagWeight: 99, palletSize: 72, palletPrice: null }), {
    palletSize: 72,
    palletPrice: null,
  });
});

test('stock settings: over the defaults, the bag price derived again', () => {
  const defaults = normalizeConfig({ pallet_price: 462 });
  assert.equal(withStockSettings(defaults).bagPrice, 7);
  assert.equal(withStockSettings(defaults, { palletSize: 77 }).bagPrice, 6);
  assert.equal(withStockSettings(defaults, { palletPrice: null }).bagPrice, null);
  assert.equal(withStockSettings(defaults, { bagWeight: 10 }).lowStockThreshold, 10);
});

test('normalizeConfig: the defaults of the silos', () => {
  const config = normalizeConfig({
    bulk_capacity: '4000',
    bulk_low_threshold: 800,
    bulk_delivery_default: '2500',
    bulk_tonne_price: 0,
    bulk_reading_unit: 'percent',
  });
  assert.equal(config.bulkCapacity, 4000);
  assert.equal(config.bulkLowThreshold, 800);
  assert.equal(config.bulkDelivery, 2500);
  assert.equal(config.bulkTonnePrice, null, '0: no price');
  assert.equal(config.bulkReadingUnit, 'percent');
  assert.equal(normalizeConfig({ bulk_reading_unit: 'litres' }).bulkReadingUnit, 'kg');
  assert.equal(normalizeConfig({ bulk_capacity: 0 }).bulkCapacity, null);
});

test('stock settings: a silo counts in kg, with its own settings', () => {
  const defaults = normalizeConfig({ bulk_tonne_price: 380, pallet_price: 462 });
  const silo = withStockSettings(defaults, { bulkDelivery: 4000 }, 'bulk');
  assert.equal(silo.bagWeight, 1, 'a unit of a silo is 1 kg');
  assert.equal(silo.bagPrice, 0.38, 'the price per tonne / 1000');
  assert.equal(silo.palletSize, 4000, 'the usual delivery');
  assert.equal(silo.lowStockThreshold, 500, 'the silo threshold');
  assert.equal(silo.palletPrice, null);
  assert.equal(withStockSettings(defaults, { bulkTonnePrice: null }, 'bulk').bagPrice, null);
  // The settings of the other type are ignored.
  assert.deepEqual(readStockSettings({ bag_weight: 10, bulk_capacity: 5000 }, 'bulk'), {
    bulkCapacity: 5000,
  });
  assert.deepEqual(readStockSettings({ bag_weight: 10, bulk_capacity: 5000 }), { bagWeight: 10 });
  assert.deepEqual(readStockSettings({ bulk_reading_unit: 'percent' }, 'bulk'), {
    bulkReadingUnit: 'percent',
  });
  assert.throws(() => readStockSettings({ bulk_reading_unit: 'litres' }, 'bulk'), {
    code: 'invalid_setting_option',
  });
  assert.deepEqual(parseStockSettings({ bagWeight: 10, bulkCapacity: 5000 }, 'bulk'), {
    bulkCapacity: 5000,
  });
});
