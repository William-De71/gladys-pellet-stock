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
    bag_price: '6.9',
  });
  assert.deepEqual(config, {
    bagWeight: 12.5,
    palletSize: 72,
    lowStockThreshold: 5,
    consumptionWindow: 30,
    bagPrice: 6.9,
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
  assert.equal(normalizeConfig({ bag_price: '' }).bagPrice, null);
  assert.equal(normalizeConfig({ bag_price: 0 }).bagPrice, null);
  assert.equal(normalizeConfig({ bag_price: 500 }).bagPrice, 100);
});
