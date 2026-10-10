import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  StockError,
  computeStats,
  createLedger,
  currentStock,
  parseLedger,
  recordMovement,
  serializeLedger,
  undoLastMovement,
} from '../src/ledger.js';
import { MAX_LEDGER_MOVEMENTS } from '../src/constants.js';
import { NOW, buildLedger, daysAgo } from './helpers/fixtures.js';

const WINDOW = { consumptionWindow: 14 };

test('recordMovement: a delivery adds bags and freezes the stock around it', () => {
  const ledger = recordMovement(createLedger(), { type: 'delivery', bags: 66 }, NOW);
  assert.deepEqual(ledger.movements, [
    { t: NOW.toISOString(), type: 'delivery', bags: 66, before: 0, after: 66 },
  ]);
  assert.equal(currentStock(ledger), 66);
});

test('recordMovement: a consumption removes bags', () => {
  const ledger = buildLedger([
    [2, 'delivery', 66],
    [1, 'consumption', 3],
  ]);
  assert.equal(currentStock(ledger), 63);
});

test('recordMovement: an inventory sets the counted stock', () => {
  const ledger = buildLedger([
    [2, 'delivery', 66],
    [1, 'inventory', 40],
  ]);
  assert.equal(currentStock(ledger), 40);
  assert.equal(ledger.movements[1].before, 66);
});

test('recordMovement: an inventory at zero is accepted', () => {
  const ledger = buildLedger([
    [2, 'delivery', 5],
    [1, 'inventory', 0],
  ]);
  assert.equal(currentStock(ledger), 0);
});

test('recordMovement: never consumes more than the stock', () => {
  const ledger = buildLedger([[1, 'delivery', 2]]);
  assert.throws(
    () => recordMovement(ledger, { type: 'consumption', bags: 3 }, NOW),
    (error) => error instanceof StockError && error.code === 'not_enough_stock',
  );
});

test('recordMovement: rejects counts that are not whole bags within range', () => {
  const ledger = createLedger();
  [0, -1, 1.5, 'abc', undefined, 1001].forEach((bags) => {
    assert.throws(
      () => recordMovement(ledger, { type: 'delivery', bags }, NOW),
      (error) => error instanceof StockError && error.code === 'invalid_count',
      `bags=${bags}`,
    );
  });
});

test('recordMovement: a delivery keeps the price paid for it', () => {
  const ledger = recordMovement(createLedger(), { type: 'delivery', bags: 66, price: 459.5 }, NOW);
  assert.deepEqual(ledger.movements, [
    { t: NOW.toISOString(), type: 'delivery', bags: 66, before: 0, after: 66, price: 459.5 },
  ]);
  assert.equal(
    recordMovement(createLedger(), { type: 'delivery', bags: 66, price: '481.2' }, NOW).movements[0]
      .price,
    481.2,
  );
});

test('recordMovement: an empty price, or 0, is no price', () => {
  [undefined, null, '', '  ', 0, '0'].forEach((price) => {
    const ledger = recordMovement(createLedger(), { type: 'delivery', bags: 66, price }, NOW);
    assert.equal('price' in ledger.movements[0], false, `price=${price}`);
  });
});

test('recordMovement: rejects a price out of range or not a number', () => {
  // A whole delivery: up to the 1,000 bags of a movement, past a pallet price.
  assert.equal(
    recordMovement(createLedger(), { type: 'delivery', bags: 700, price: 6000 }, NOW).movements[0]
      .price,
    6000,
  );
  [-1, 20000.01, 'abc', NaN, Infinity, {}].forEach((price) => {
    assert.throws(
      () => recordMovement(createLedger(), { type: 'delivery', bags: 66, price }, NOW),
      (error) => error instanceof StockError && error.code === 'invalid_price',
      `price=${price}`,
    );
  });
});

test('recordMovement: only a delivery carries a price', () => {
  const ledger = recordMovement(
    buildLedger([[1, 'delivery', 66]]),
    { type: 'consumption', bags: 1, price: 7 },
    NOW,
  );
  assert.equal('price' in ledger.movements[1], false);
});

test('recordMovement: bags bought one by one are priced per bag, stored as the total', () => {
  const ledger = recordMovement(createLedger(), { type: 'delivery', bags: 3, bagPrice: 7.29 }, NOW);
  assert.equal(ledger.movements[0].price, 21.87);
  // The total paid wins over a price per bag.
  const both = recordMovement(
    createLedger(),
    { type: 'delivery', bags: 3, price: 20, bagPrice: 7.29 },
    NOW,
  );
  assert.equal(both.movements[0].price, 20);
  assert.equal(
    'price' in
      recordMovement(createLedger(), { type: 'delivery', bags: 3, bagPrice: 0 }, NOW).movements[0],
    false,
  );
  [-1, 100.01, 'abc'].forEach((bagPrice) => {
    assert.throws(
      () => recordMovement(createLedger(), { type: 'delivery', bags: 3, bagPrice }, NOW),
      (error) => error instanceof StockError && error.code === 'invalid_price',
      `bagPrice=${bagPrice}`,
    );
  });
});

test('recordMovement: a delivery keeps the weight of its bags', () => {
  const ledger = recordMovement(
    createLedger(),
    { type: 'delivery', bags: 96, bagWeight: '10.5' },
    NOW,
  );
  assert.equal(ledger.movements[0].bagWeight, 10.5);
  // Left empty: no weight, the configured one applies.
  const plain = recordMovement(createLedger(), { type: 'delivery', bags: 66, bagWeight: '' }, NOW);
  assert.equal('bagWeight' in plain.movements[0], false);
  [0, 51, 'abc'].forEach((bagWeight) => {
    assert.throws(
      () => recordMovement(createLedger(), { type: 'delivery', bags: 66, bagWeight }, NOW),
      (error) => error instanceof StockError && error.code === 'invalid_weight',
      `bagWeight=${bagWeight}`,
    );
  });
  // Only a delivery carries a weight.
  const used = recordMovement(ledger, { type: 'consumption', bags: 1, bagWeight: 10 }, NOW);
  assert.equal('bagWeight' in used.movements[1], false);
});

test('recordMovement: accepts counts sent as strings', () => {
  const ledger = recordMovement(createLedger(), { type: 'delivery', bags: '12' }, NOW);
  assert.equal(currentStock(ledger), 12);
});

test('recordMovement: rejects an unknown movement type', () => {
  assert.throws(
    () => recordMovement(createLedger(), { type: 'theft', bags: 1 }, NOW),
    (error) => error.code === 'unknown_movement',
  );
});

test('recordMovement: keeps only the most recent movements', () => {
  let ledger = recordMovement(createLedger(), { type: 'inventory', bags: 10000 }, daysAgo(400));
  for (let i = 0; i < MAX_LEDGER_MOVEMENTS; i += 1) {
    ledger = recordMovement(ledger, { type: 'consumption', bags: 1 }, daysAgo(399 - i * 0.1));
  }
  assert.equal(ledger.movements.length, MAX_LEDGER_MOVEMENTS);
  assert.equal(ledger.movements[0].type, 'consumption');
  assert.equal(currentStock(ledger), 10000 - MAX_LEDGER_MOVEMENTS);
});

test('undoLastMovement: restores the stock before the last movement', () => {
  const ledger = buildLedger([
    [2, 'delivery', 66],
    [1, 'consumption', 1],
  ]);
  const { ledger: next, movement } = undoLastMovement(ledger);
  assert.equal(movement.type, 'consumption');
  assert.equal(currentStock(next), 66);
  assert.equal(ledger.movements.length, 2, 'the original ledger is never mutated');
});

test('undoLastMovement: refuses on an empty ledger', () => {
  assert.throws(
    () => undoLastMovement(createLedger()),
    (error) => error.code === 'nothing_to_undo',
  );
});

test('parseLedger / serializeLedger: round trip', () => {
  const ledger = buildLedger([
    [3, 'delivery', 66],
    [1, 'consumption', 2],
  ]);
  assert.deepEqual(parseLedger(serializeLedger(ledger)), ledger);
});

test('parseLedger: an absent or corrupted value yields an empty ledger', () => {
  [undefined, null, '', '{not json', '{"movements": 3}', 42].forEach((raw) => {
    assert.deepEqual(parseLedger(raw), createLedger(), `raw=${raw}`);
  });
});

test('parseLedger: drops invalid movements, keeps the rest, sorted', () => {
  const ledger = parseLedger({
    movements: [
      { t: daysAgo(1).toISOString(), type: 'consumption', bags: 1, before: 66, after: 65 },
      { t: 'yesterday', type: 'delivery', bags: 1, before: 0, after: 1 },
      { t: daysAgo(2).toISOString(), type: 'delivery', bags: 66, before: 0, after: 66 },
      { t: daysAgo(1).toISOString(), type: 'delivery', bags: -3, before: 0, after: 1 },
      { t: daysAgo(1).toISOString(), type: 'delivery', bags: 3, before: 0, after: 3, price: '9' },
      { t: daysAgo(1).toISOString(), type: 'delivery', bags: 3, before: 0, after: 3, price: 0 },
      {
        t: daysAgo(1).toISOString(),
        type: 'delivery',
        bags: 3,
        before: 0,
        after: 3,
        bagWeight: '15',
      },
      null,
    ],
  });
  assert.deepEqual(
    ledger.movements.map((movement) => movement.type),
    ['delivery', 'consumption'],
  );
});

test('parseLedger / serializeLedger: the price of a delivery survives a round trip', () => {
  const ledger = recordMovement(
    buildLedger([[3, 'delivery', 66, 459.5]]),
    { type: 'delivery', bags: 10, bagPrice: 7.5, bagWeight: 10 },
    NOW,
  );
  assert.deepEqual(parseLedger(serializeLedger(ledger)), ledger);
});

test('computeStats: an empty ledger', () => {
  const stats = computeStats(createLedger(), NOW, WINDOW);
  assert.equal(stats.stock, 0);
  assert.equal(stats.dailyRate, null);
  assert.equal(stats.autonomyDays, 0);
  assert.equal(stats.hasHistory, false);
  assert.equal(stats.lastDelivery, null);
});

test('computeStats: averages the consumption over the window', () => {
  // 20 days of history, but only the last 14 count: 14 bags over 14 days.
  const steps = [[20, 'delivery', 66]];
  for (let ago = 19; ago >= 1; ago -= 1) {
    steps.push([ago, 'consumption', 1]);
  }
  const stats = computeStats(buildLedger(steps), NOW, WINDOW);
  assert.equal(stats.stock, 66 - 19);
  assert.equal(stats.consumedInWindow, 14);
  assert.equal(stats.dailyRate, 1);
  assert.equal(stats.autonomyDays, 47);
  assert.equal(
    stats.emptyDate.toISOString(),
    new Date(NOW.getTime() + 47 * 86400000).toISOString(),
  );
});

test('computeStats: a history shorter than the window averages over the history', () => {
  const stats = computeStats(
    buildLedger([
      [4, 'delivery', 66],
      [3, 'consumption', 2],
      [1, 'consumption', 2],
    ]),
    NOW,
    WINDOW,
  );
  assert.equal(stats.dailyRate, 1);
  assert.equal(stats.autonomyDays, 62);
});

test('computeStats: a downward inventory counts as consumption', () => {
  const stats = computeStats(
    buildLedger([
      [10, 'delivery', 66],
      [5, 'inventory', 56],
      [0, 'inventory', 46],
    ]),
    NOW,
    WINDOW,
  );
  assert.equal(stats.consumedInWindow, 20);
  assert.equal(stats.dailyRate, 2);
  assert.equal(stats.autonomyDays, 23);
});

test('computeStats: an upward inventory is a refill, not a consumption', () => {
  const stats = computeStats(
    buildLedger([
      [10, 'inventory', 20],
      [5, 'inventory', 30],
    ]),
    NOW,
    WINDOW,
  );
  assert.equal(stats.consumedInWindow, 0);
  assert.equal(stats.dailyRate, 0);
  assert.equal(stats.autonomyDays, null, 'no consumption: the autonomy is unknown');
  assert.equal(stats.referenceStock, 30);
});

test('computeStats: under one day of history, the rate stays unknown', () => {
  const stats = computeStats(
    buildLedger([
      [0.5, 'delivery', 66],
      [0.1, 'consumption', 3],
    ]),
    NOW,
    WINDOW,
  );
  assert.equal(stats.dailyRate, null);
  assert.equal(stats.autonomyDays, null);
  assert.equal(stats.emptyDate, null);
});

test('computeStats: the gauge reference is the stock after the last refill', () => {
  const stats = computeStats(
    buildLedger([
      [30, 'delivery', 66],
      [20, 'consumption', 30],
      [10, 'delivery', 66],
      [5, 'consumption', 10],
    ]),
    NOW,
    WINDOW,
  );
  assert.equal(stats.stock, 92);
  assert.equal(stats.referenceStock, 102);
  assert.equal(stats.lastDelivery.after, 102);
});

test('computeStats: the last delivery is the last pallet, not a single bag', () => {
  const stats = computeStats(
    buildLedger([
      [10, 'delivery', 66],
      [8, 'consumption', 5],
      [5, 'delivery', 1],
      [3, 'consumption', 2],
    ]),
    NOW,
    WINDOW,
  );
  assert.equal(stats.lastDelivery.bags, 66);
  assert.equal(stats.consumedSinceDelivery, 7);
});

test('computeStats: no price until a delivery is entered with one', () => {
  const stats = computeStats(buildLedger([[3, 'delivery', 66]]), NOW, WINDOW);
  assert.equal(stats.bagPrice, null);
});

test('computeStats: the price is the one of the last delivery entered with one', () => {
  const stats = computeStats(
    buildLedger([
      [30, 'delivery', 66, 400],
      [10, 'delivery', 72, 504],
      [8, 'consumption', 5],
      [5, 'delivery', 1],
    ]),
    NOW,
    WINDOW,
  );
  assert.equal(stats.bagPrice, 7);
});

test('computeStats: the price comes with the weight of the bags it was paid for', () => {
  const ledger = recordMovement(
    buildLedger([[10, 'delivery', 66, 462]]),
    { type: 'delivery', bags: 96, price: 600, bagWeight: 10 },
    daysAgo(5),
  );
  const stats = computeStats(ledger, NOW, WINDOW);
  assert.equal(stats.bagPrice, 6.25);
  assert.equal(stats.pricedBagWeight, 10);
  assert.equal(
    computeStats(buildLedger([[3, 'delivery', 66, 462]]), NOW, WINDOW).pricedBagWeight,
    null,
  );
});

test('computeStats: undoing a priced delivery brings the previous price back', () => {
  const { ledger } = undoLastMovement(
    buildLedger([
      [30, 'delivery', 66, 400],
      [10, 'delivery', 72, 504],
    ]),
  );
  assert.equal(computeStats(ledger, NOW, WINDOW).bagPrice, 400 / 66);
});

test('computeStats: the order date is when the stock reaches the threshold', () => {
  // 1 bag a day, 47 bags left, threshold at 10: 37 days to order.
  const steps = [[20, 'delivery', 66]];
  for (let ago = 19; ago >= 1; ago -= 1) {
    steps.push([ago, 'consumption', 1]);
  }
  const ledger = buildLedger(steps);
  const stats = computeStats(ledger, NOW, { ...WINDOW, lowStockThreshold: 10 });
  assert.equal(stats.orderDate.toISOString(), daysAgo(-37).toISOString());
  assert.equal(stats.lastConsumption.t, daysAgo(1).toISOString());
  assert.equal(computeStats(ledger, NOW, WINDOW).orderDate, null, 'no threshold, no date');
  assert.equal(
    computeStats(ledger, NOW, { ...WINDOW, lowStockThreshold: 50 }).orderDate,
    null,
    'already under the threshold',
  );
});

test('computeStats: a recount is not a "last bag used"', () => {
  const stats = computeStats(
    buildLedger([
      [10, 'delivery', 66],
      [5, 'inventory', 56],
    ]),
    NOW,
    WINDOW,
  );
  assert.equal(stats.lastConsumption, null);
});
