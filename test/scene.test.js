import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSceneEventData, buildSceneOutputs, detectSceneTriggers } from '../src/scene.js';
import { DEFAULTS } from '../src/constants.js';
import { computeStats } from '../src/ledger.js';
import { NOW, buildLedger } from './helpers/fixtures.js';

const outputsOf = (steps, overrides = {}) => {
  const config = { ...DEFAULTS, ...overrides };
  return buildSceneOutputs(computeStats(buildLedger(steps), NOW, config), config, NOW);
};

test('scene outputs: every figure of a stock in use', () => {
  // 1 bag a day, 47 bags left, threshold at 10.
  const steps = [[20, 'delivery', 66]];
  for (let ago = 19; ago >= 1; ago -= 1) {
    steps.push([ago, 'consumption', 1]);
  }
  assert.deepEqual(outputsOf(steps), {
    stock: 47,
    remaining_kg: 705,
    autonomy_days: 47,
    daily_rate: 1,
    days_before_order: 37,
  });
});

test('scene outputs: unknown figures are left out, never sent as 0', () => {
  assert.deepEqual(outputsOf([[0.2, 'delivery', 66]]), { stock: 66, remaining_kg: 990 });
});

test('scene outputs: at or below the threshold, order now', () => {
  const outputs = outputsOf([
    [5, 'delivery', 20],
    [1, 'consumption', 12],
  ]);
  assert.equal(outputs.stock, 8);
  assert.equal(outputs.days_before_order, 0);
  assert.equal(outputs.daily_rate, 2.4);
});

test('scene triggers: fire on the transition only', () => {
  const detect = (before, after, extra = {}) =>
    detectSceneTriggers({ before, after, lowStockThreshold: 10, ...extra });
  assert.deepEqual(detect(11, 10), ['low_stock']);
  assert.deepEqual(detect(10, 9), [], 'already low: no new event');
  assert.deepEqual(detect(12, 0), ['low_stock', 'stock_empty']);
  assert.deepEqual(detect(1, 0), ['stock_empty']);
  assert.deepEqual(detect(0, 0), []);
  assert.deepEqual(detect(11, 10, { lowStockThreshold: 0 }), [], 'no threshold, no low stock');
});

test('scene triggers: a pallet fires, unless a scene added it (no loop)', () => {
  const pallet = { type: 'delivery', bags: 66 };
  assert.deepEqual(
    detectSceneTriggers({ before: 5, after: 71, recorded: pallet, lowStockThreshold: 10 }),
    ['pallet_delivered'],
  );
  assert.deepEqual(
    detectSceneTriggers({
      before: 5,
      after: 71,
      recorded: pallet,
      fromScene: true,
      lowStockThreshold: 10,
    }),
    [],
  );
  assert.deepEqual(
    detectSceneTriggers({
      before: 5,
      after: 6,
      recorded: { type: 'delivery', bags: 1 },
      lowStockThreshold: 10,
    }),
    [],
    'a single bag is not a pallet',
  );
  assert.deepEqual(
    detectSceneTriggers({ before: 11, after: 10, fromScene: true, lowStockThreshold: 10 }),
    ['low_stock'],
    'the stock level fires whatever the origin',
  );
});

test('scene triggers: the data names the stock device and carries the figures', () => {
  assert.deepEqual(
    buildSceneEventData(
      'ext:test:pellet:stock',
      { stock: 71, remaining_kg: 1065 },
      { type: 'delivery', bags: 66 },
    ),
    { stock: 'ext:test:pellet:stock', bags_left: 71, remaining_kg: 1065, bags_delivered: 66 },
  );
});
