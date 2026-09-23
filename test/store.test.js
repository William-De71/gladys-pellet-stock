import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStockStore } from '../src/store.js';
import { buildDevice, buildStates } from '../src/device.js';
import { DEFAULTS, LEDGER_CONFIG_KEY, WIDGET_KEY } from '../src/constants.js';
import { serializeLedger, parseLedger } from '../src/ledger.js';
import { NOW, buildLedger, createFakeGladys, silentLogger } from './helpers/fixtures.js';

const STOCK_ID = 'ext:test:pellet:stock:bags';
const AUTONOMY_ID = 'ext:test:pellet:stock:autonomy';

/**
 * @description A store over a fake Gladys, clock fixed at NOW.
 * @param {object} [storedConfig] - The config stored in Gladys.
 * @returns {{gladys: object, store: object}} The fake and the store.
 */
function setup(storedConfig) {
  const gladys = createFakeGladys(storedConfig);
  const store = createStockStore({
    gladys,
    logger: silentLogger,
    getConfig: () => DEFAULTS,
    now: () => NOW,
  });
  return { gladys, store };
}

test('store: loads the stored ledger', async () => {
  const ledger = buildLedger([[3, 'delivery', 66]]);
  const { store } = setup({ [LEDGER_CONFIG_KEY]: serializeLedger(ledger) });
  await store.load();
  assert.equal(store.getStats().stock, 66);
});

test('store: a movement is persisted, published and nudges the widget', async () => {
  const { gladys, store } = setup();
  await store.load();
  const movement = await store.record({ type: 'delivery', bags: 66 });
  assert.equal(movement.after, 66);
  assert.equal(parseLedger(gladys.storedConfig[LEDGER_CONFIG_KEY]).movements.length, 1);
  assert.deepEqual(gladys.publishedStates, [[{ device_feature_external_id: STOCK_ID, state: 66 }]]);
  assert.deepEqual(gladys.refreshes, [WIDGET_KEY]);
});

test('store: a failed write leaves the stock unchanged', async () => {
  const { gladys, store } = setup();
  await store.load();
  gladys.failSetConfig = true;
  await assert.rejects(store.record({ type: 'delivery', bags: 66 }), /host API unreachable/);
  assert.equal(store.getStats().stock, 0);
  assert.deepEqual(gladys.refreshes, []);
  // The queue survives the failure.
  gladys.failSetConfig = false;
  await store.record({ type: 'delivery', bags: 10 });
  assert.equal(store.getStats().stock, 10);
});

test('store: concurrent taps are serialized, no bag is lost', async () => {
  const { gladys, store } = setup();
  await store.load();
  await store.record({ type: 'delivery', bags: 10 });
  await Promise.all([1, 2, 3].map(() => store.record({ type: 'consumption', bags: 1 })));
  assert.equal(store.getStats().stock, 7);
  assert.equal(parseLedger(gladys.storedConfig[LEDGER_CONFIG_KEY]).movements.length, 4);
});

test('store: undo restores the previous stock', async () => {
  const { store } = setup();
  await store.load();
  await store.record({ type: 'delivery', bags: 66 });
  await store.record({ type: 'consumption', bags: 2 });
  const removed = await store.undo();
  assert.equal(removed.type, 'consumption');
  assert.equal(store.getStats().stock, 66);
});

test('store: states are deduplicated, and forced when the device is created', async () => {
  const { gladys, store } = setup({
    [LEDGER_CONFIG_KEY]: serializeLedger(buildLedger([[3, 'delivery', 66]])),
  });
  await store.load();
  await store.publishStates();
  await store.publishStates();
  assert.equal(gladys.publishedStates.length, 1);
  await store.publishStates({ force: true });
  assert.equal(gladys.publishedStates.length, 2);
});

test('store: a missing device does not break a movement', async () => {
  const { gladys, store } = setup();
  await store.load();
  gladys.failPublishStates = true;
  await store.record({ type: 'delivery', bags: 66 });
  assert.equal(store.getStats().stock, 66);
  // Not remembered as published: retried once the device exists.
  gladys.failPublishStates = false;
  await store.publishStates();
  assert.equal(gladys.publishedStates.length, 1);
});

test('device: one read-only device with the stock and the autonomy', () => {
  const device = buildDevice(createFakeGladys(), 'fr');
  assert.equal(device.name, 'Stock de pellets');
  assert.equal(device.external_id, 'ext:test:pellet:stock');
  assert.deepEqual(
    device.features.map((feature) => [feature.external_id, feature.category, feature.read_only]),
    [
      [STOCK_ID, 'counter-sensor', true],
      [AUTONOMY_ID, 'duration', true],
    ],
  );
  assert.equal(device.features[1].unit, 'days');
});

test('device: an unknown autonomy is omitted, never published as 0', () => {
  const gladys = createFakeGladys();
  assert.deepEqual(buildStates(gladys, { stock: 40, autonomyDays: null }), [
    { device_feature_external_id: STOCK_ID, state: 40 },
  ]);
  assert.deepEqual(buildStates(gladys, { stock: 40, autonomyDays: 99999 })[1], {
    device_feature_external_id: AUTONOMY_ID,
    state: 3650,
  });
});
