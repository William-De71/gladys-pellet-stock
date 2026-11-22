import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  costOver,
  nextDay,
  parseDay,
  pricePerBag,
  seasonStart,
  valueBags,
  walkLots,
} from '../src/cost.js';
import { recordMovement } from '../src/ledger.js';
import { NOW, buildLedger, daysAgo } from './helpers/fixtures.js';

const CONFIG = { bagPrice: null, bagWeight: 15 };

test('walkLots: the oldest bags go first', () => {
  const { lots, used } = walkLots(
    buildLedger([
      [30, 'delivery', 10, 60],
      [20, 'delivery', 10, 80],
      [10, 'consumption', 12],
    ]).movements,
  );
  assert.deepEqual(
    lots.map((lot) => [lot.units, lot.unitPrice]),
    [[8, 8]],
  );
  assert.deepEqual(
    used.map((part) => [part.units, part.unitPrice]),
    [
      [10, 6],
      [2, 8],
    ],
  );
});

test('walkLots: bags without a price cost the last price known', () => {
  const { lots } = walkLots(
    buildLedger([
      [30, 'delivery', 10],
      [20, 'delivery', 10, 80],
      [10, 'delivery', 5],
      [5, 'inventory', 27],
    ]).movements,
  );
  assert.deepEqual(
    lots.map((lot) => [lot.units, lot.unitPrice]),
    [
      [10, null],
      [10, 8],
      [5, 8],
      [2, 8],
    ],
  );
});

test('walkLots: a downward count uses the oldest bags, a first count has no price', () => {
  const { lots, used } = walkLots(
    buildLedger([
      [30, 'inventory', 12],
      [20, 'delivery', 10, 80],
      [10, 'inventory', 15],
    ]).movements,
  );
  assert.deepEqual(
    used.map((part) => [part.units, part.unitPrice]),
    [[7, null]],
  );
  assert.deepEqual(
    lots.map((lot) => [lot.units, lot.unitPrice]),
    [
      [5, null],
      [10, 8],
    ],
  );
});

test('walkLots: a history that starts with a stock gives it a lot of unknown price', () => {
  const ledger = buildLedger([[10, 'delivery', 5, 40]]);
  const movements = [{ ...ledger.movements[0], before: 20, after: 25 }];
  assert.deepEqual(
    walkLots(movements).lots.map((lot) => [lot.units, lot.unitPrice]),
    [
      [20, null],
      [5, 8],
    ],
  );
});

test('walkLots: an undone movement is simply no longer there', () => {
  const ledger = buildLedger([
    [20, 'delivery', 10, 60],
    [10, 'delivery', 10, 80],
  ]);
  const withoutLast = ledger.movements.slice(0, -1);
  assert.deepEqual(
    walkLots(withoutLast).lots.map((lot) => [lot.units, lot.unitPrice]),
    [[10, 6]],
  );
});

test('valueBags: the defaults of the stock for what a lot does not know', () => {
  const parts = [
    { units: 4, unitPrice: 6, unitWeight: 10 },
    { units: 2, unitPrice: null, unitWeight: null },
  ];
  assert.deepEqual(valueBags(parts, CONFIG), { bags: 6, kg: 70, cost: 24, unpricedBags: 2 });
  assert.deepEqual(valueBags(parts, { bagPrice: 7, bagWeight: 15 }), {
    bags: 6,
    kg: 70,
    cost: 38,
    unpricedBags: 0,
  });
});

test('costOver: the bags used in the period, at the price of their lot', () => {
  // The forum example: 40 bags bought at one price, then 60 at another.
  let ledger = buildLedger([
    [400, 'delivery', 40, 240],
    [300, 'delivery', 60, 480],
  ]);
  for (let ago = 200; ago > 150; ago -= 1) {
    ledger = recordMovement(ledger, { type: 'consumption', bags: 1 }, daysAgo(ago));
  }
  // 50 bags: the 40 at 6 €, then 10 at 8 €.
  assert.deepEqual(costOver(ledger.movements, daysAgo(365), NOW, CONFIG), {
    bags: 50,
    kg: 750,
    cost: 320,
    unpricedBags: 0,
  });
  // Only the last 5 days of use: bags of the second lot.
  assert.equal(costOver(ledger.movements, daysAgo(155), NOW, CONFIG).cost, 40);
  // The end is excluded.
  assert.equal(costOver(ledger.movements, daysAgo(365), daysAgo(200), CONFIG).bags, 0);
});

test('pricePerBag: of the bags a movement added', () => {
  assert.equal(pricePerBag({ type: 'delivery', bags: 66, before: 0, after: 66, price: 462 }), 7);
  assert.equal(pricePerBag({ type: 'inventory', bags: 14, before: 10, after: 14, price: 30 }), 7.5);
  assert.equal(pricePerBag({ type: 'delivery', bags: 66, before: 0, after: 66 }), null);
});

test('seasonStart: the first day of the month, this year or the last', () => {
  assert.deepEqual(seasonStart(new Date(2026, 1, 10), 10), new Date(2025, 9, 1));
  assert.deepEqual(seasonStart(new Date(2026, 9, 10), 10), new Date(2026, 9, 1));
  assert.deepEqual(seasonStart(new Date(2026, 9, 1), 10), new Date(2026, 9, 1));
});

test('parseDay / nextDay', () => {
  assert.deepEqual(parseDay('1/10/26'), new Date(2026, 9, 1));
  assert.deepEqual(parseDay(' 01.06.2027 '), new Date(2027, 5, 1));
  assert.deepEqual(parseDay('29-02-2028'), new Date(2028, 1, 29));
  ['31/02/2026', '2026-10-01', '1/13/26', '', 'abc', 42, undefined].forEach((raw) => {
    assert.equal(parseDay(raw), null, String(raw));
  });
  assert.deepEqual(nextDay(new Date(2026, 11, 31)), new Date(2027, 0, 1));
});
