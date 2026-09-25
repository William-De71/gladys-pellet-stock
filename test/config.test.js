import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeConfig } from '../src/config.js';
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
    bagPrice: 7,
  });
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
  assert.equal(normalizeConfig({ pallet_price: 99999, pallet_size: 50 }).bagPrice, 100);
});

test('normalizeConfig: the bag price is the pallet price split over its bags', () => {
  assert.equal(normalizeConfig({ pallet_price: 481 }).bagPrice, 481 / 66);
  assert.equal(normalizeConfig({ pallet_price: 525, pallet_size: 72 }).bagPrice, 525 / 72);
});
