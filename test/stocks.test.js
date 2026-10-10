import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStocks, ledgerKeyOf, parseStocks, readHouse } from '../src/stocks.js';
import { DEFAULTS, LEDGER_CONFIG_KEY, STOCKS_CONFIG_KEY, WIDGET_KEY } from '../src/constants.js';
import { parseLedger, serializeLedger } from '../src/ledger.js';
import { NOW, buildLedger, createFakeGladys, silentLogger } from './helpers/fixtures.js';

const MAIN = 'ext:test:pellet:stock';
const CHALET = 'ext:test:pellet:chalet:bags';
// A stock added by name, before the houses (versions up to 1.2).
const OLD = 'ext:test:pellet:0000000f';
const OLD_STOCKS = JSON.stringify([{ id: '0000000f', name: 'Grange' }]);

/**
 * @description Stocks over a fake Gladys, clock fixed at NOW, ids counted.
 * @param {object} [storedConfig] - The config stored in Gladys.
 * @returns {Promise<{gladys: object, stocks: object}>} The fake and the loaded stocks.
 */
async function setup(storedConfig) {
  const gladys = createFakeGladys(storedConfig);
  let next = 10;
  const stocks = createStocks({
    gladys,
    logger: silentLogger,
    getConfig: () => DEFAULTS,
    now: () => NOW,
    newId: () => (next++).toString(16).padStart(8, '0'),
  });
  await stocks.load();
  await stocks.refreshHouses();
  return { gladys, stocks };
}

test('stocks: the main stock keeps the keys of the single-stock versions', async () => {
  const { gladys, stocks } = await setup({
    [LEDGER_CONFIG_KEY]: serializeLedger(buildLedger([[3, 'delivery', 66]])),
  });
  assert.deepEqual(stocks.list(), [
    { id: 'stock', type: 'bags', house: null, name: null, settings: {} },
  ]);
  assert.equal(stocks.storeOf().getStats().stock, 66, 'no choice: the main stock');
  assert.equal(stocks.storeOf(MAIN).getStats().stock, 66);
  assert.deepEqual(
    stocks.devices('fr').map((device) => [device.external_id, device.name]),
    [[MAIN, 'Stock de pellets']],
  );
  // Nothing written for a main stock without a house nor settings.
  await stocks.storeOf().record({ type: 'consumption', bags: 1 });
  assert.equal(gladys.storedConfig[STOCKS_CONFIG_KEY], undefined);
});

test('stocks: a stock added for a house has its own ledger and device, named after the house', async () => {
  const { gladys, stocks } = await setup();
  const chalet = await stocks.add('chalet');
  assert.deepEqual(chalet, {
    id: 'chalet:bags',
    type: 'bags',
    house: 'chalet',
    name: 'Chalet des Écrins',
    settings: {},
  });
  assert.deepEqual(JSON.parse(gladys.storedConfig[STOCKS_CONFIG_KEY]), [
    { id: 'chalet:bags', type: 'bags', house: 'chalet', ledger: '0000000a' },
  ]);
  assert.deepEqual(gladys.refreshes, [WIDGET_KEY]);

  await stocks.storeOf(CHALET).record({ type: 'delivery', bags: 20 });
  assert.equal(stocks.storeOf(CHALET).getStats().stock, 20);
  assert.equal(stocks.storeOf().getStats().stock, 0, 'the main stock is untouched');
  // A selector is not a valid config key: the ledger has a key of its own.
  assert.equal(parseLedger(gladys.storedConfig.stock_ledger_0000000a).movements.length, 1);
  assert.equal(gladys.storedConfig[LEDGER_CONFIG_KEY], undefined);

  assert.deepEqual(
    stocks.devices('fr').map((device) => [device.external_id, device.name]),
    [
      [MAIN, 'Stock de pellets'],
      [CHALET, 'Stock de pellets – Chalet des Écrins'],
    ],
  );
  assert.equal(stocks.devices()[1].features[0].external_id, `${CHALET}:bags`);
});

test('stocks: the name follows the house, the selector standing in when it cannot be read', async () => {
  const { gladys, stocks } = await setup();
  await stocks.add('chalet');
  gladys.houses[1].name = 'Chalet';
  assert.equal(await stocks.refreshHouses(), true);
  assert.equal(stocks.find(CHALET).name, 'Chalet');
  assert.equal(await stocks.refreshHouses(), false, 'nothing changed');

  const first = await setup(gladys.storedConfig);
  first.gladys.failGetHouses = true;
  const { stocks: restarted } = first;
  // setup() read them already: a failure keeps the names known so far.
  assert.equal(await restarted.refreshHouses(), false);
  assert.equal(restarted.find(CHALET).name, 'Chalet des Écrins');
  const blind = createStocks({
    gladys: first.gladys,
    logger: silentLogger,
    getConfig: () => DEFAULTS,
  });
  await blind.load();
  assert.equal(blind.find(CHALET).name, 'chalet');
});

test('stocks: the added stocks survive a restart', async () => {
  const first = await setup();
  await first.stocks.add('chalet');
  await first.stocks.storeOf(CHALET).record({ type: 'delivery', bags: 20 });
  const { stocks } = await setup(first.gladys.storedConfig);
  assert.equal(stocks.find(CHALET).name, 'Chalet des Écrins');
  assert.equal(stocks.storeOf(CHALET).getStats().stock, 20);
});

test('stocks: one stock per house, at most 20', async () => {
  const { stocks } = await setup();
  await stocks.add('chalet');
  await assert.rejects(stocks.add('chalet'), {
    code: 'house_taken',
    params: { name: 'Chalet des Écrins' },
  });
  await assert.rejects(stocks.add(''), { code: 'invalid_house' });
  await assert.rejects(stocks.add(undefined), { code: 'invalid_house' });
  await assert.rejects(stocks.add('Pas un selector'), { code: 'invalid_house' });
  for (let i = 2; i <= 19; i += 1) {
    await stocks.add(`maison-${i}`);
  }
  await assert.rejects(stocks.add('une-de-trop'), { code: 'too_many_stocks', params: { max: 20 } });
});

test('stocks: a stock added by name before the houses keeps its id, ledger and name', async () => {
  const ledger = serializeLedger(buildLedger([[3, 'inventory', 12]]));
  const { stocks } = await setup({
    [STOCKS_CONFIG_KEY]: OLD_STOCKS,
    stock_ledger_0000000f: ledger,
  });
  assert.deepEqual(stocks.find(OLD), {
    id: '0000000f',
    type: 'bags',
    house: null,
    name: 'Grange',
    settings: {},
  });
  assert.equal(stocks.storeOf(OLD).getStats().stock, 12);
});

test('stocks: attaching a stock to a house keeps its device and its history', async () => {
  const ledger = serializeLedger(buildLedger([[3, 'inventory', 12]]));
  const { gladys, stocks } = await setup({
    [STOCKS_CONFIG_KEY]: OLD_STOCKS,
    stock_ledger_0000000f: ledger,
  });
  const attached = await stocks.attach(OLD, 'chalet');
  assert.equal(attached.id, '0000000f');
  assert.equal(attached.name, 'Chalet des Écrins');
  assert.deepEqual(JSON.parse(gladys.storedConfig[STOCKS_CONFIG_KEY]), [
    { id: '0000000f', type: 'bags', house: 'chalet', name: 'Grange' },
  ]);
  assert.equal(stocks.storeOf(OLD).getStats().stock, 12);
  assert.equal(gladys.storedConfig.stock_ledger_0000000f, ledger);
  assert.equal(stocks.devices()[1].external_id, OLD);
  // The house is taken now.
  await assert.rejects(stocks.add('chalet'), { code: 'house_taken' });
  // Attaching it again to the same house is fine.
  await stocks.attach(OLD, 'chalet');

  // The main stock too.
  await stocks.attach(undefined, 'maison');
  assert.equal(stocks.find().name, 'Maison');
  assert.deepEqual(JSON.parse(gladys.storedConfig[STOCKS_CONFIG_KEY])[0], {
    id: 'stock',
    type: 'bags',
    house: 'maison',
  });
  await assert.rejects(stocks.attach(OLD, 'maison'), { code: 'house_taken' });
  await assert.rejects(stocks.attach('ext:test:pellet:deadbeef', 'maison'), {
    code: 'unknown_stock',
  });
});

test('stocks: a stock attached elsewhere leaves its id, a new stock gets another', async () => {
  const { stocks } = await setup();
  await stocks.add('chalet');
  await stocks.attach(CHALET, 'maison');
  const again = await stocks.add('chalet');
  assert.equal(again.id, 'chalet:bags:0000000b');
  assert.notEqual(stocks.find(CHALET), null);
});

test('stocks: a stock has settings of its own over the defaults', async () => {
  const { gladys, stocks } = await setup();
  await stocks.add('chalet');
  const { stock, config } = await stocks.configure(CHALET, {
    bag_weight: '10',
    pallet_size: 96,
    pallet_price: '',
  });
  assert.deepEqual(stock.settings, { bagWeight: 10, palletSize: 96 });
  assert.equal(config.bagWeight, 10);
  assert.equal(config.palletSize, 96);
  assert.equal(config.lowStockThreshold, DEFAULTS.lowStockThreshold, 'the default');
  assert.deepEqual(stocks.configOf(), DEFAULTS, 'the main stock is untouched');

  // An empty field keeps the value, a new one adds to them.
  await stocks.configure(CHALET, { low_stock_threshold: 4.6, pallet_price: 0 });
  assert.deepEqual(stocks.find(CHALET).settings, {
    bagWeight: 10,
    palletSize: 96,
    lowStockThreshold: 5,
    palletPrice: null,
  });
  // 0: no price for this stock, even with a default one.
  assert.equal(stocks.configOf(CHALET).bagPrice, null);

  // Kept across a restart.
  const { stocks: restarted } = await setup(gladys.storedConfig);
  assert.equal(restarted.configOf(CHALET).palletSize, 96);
  assert.equal(restarted.configOf(CHALET).palletPrice, null);

  // Back to the defaults, then one setting again.
  const reset = await stocks.configure(CHALET, { consumption_window: 30 }, true);
  assert.deepEqual(reset.stock.settings, { consumptionWindow: 30 });
  await assert.rejects(stocks.configure(CHALET, { bag_weight: 80 }), {
    code: 'invalid_setting',
    params: { min: 1, max: 50 },
  });
});

test('stocks: the price of a bag follows the pallet settings of the stock', async () => {
  const { stocks } = await setup();
  await stocks.add('chalet');
  await stocks.configure(CHALET, { pallet_price: 600, pallet_size: 60 });
  assert.equal(stocks.configOf(CHALET).bagPrice, 10);
  // Its own pallet size over a default price.
  await stocks.configure(CHALET, { pallet_size: 50 }, true);
  assert.equal(stocks.configOf(CHALET).bagPrice, null, 'no default price');
});

test('stocks: an unknown stock is refused, never mixed up with the main one', async () => {
  const { stocks } = await setup();
  assert.equal(stocks.find('ext:test:pellet:deadbeef'), null);
  assert.throws(() => stocks.storeOf('ext:test:pellet:deadbeef'), { code: 'unknown_stock' });
  assert.throws(() => stocks.configOf('ext:test:pellet:deadbeef'), { code: 'unknown_stock' });
});

test('stocks: removing an added stock drops it and its ledger, the main one stays', async () => {
  const { gladys, stocks } = await setup();
  await stocks.add('chalet');
  await stocks.storeOf(CHALET).record({ type: 'delivery', bags: 20 });
  const removed = await stocks.remove(CHALET);
  assert.equal(removed.name, 'Chalet des Écrins');
  assert.deepEqual(
    stocks.list().map((stock) => stock.id),
    ['stock'],
  );
  assert.deepEqual(JSON.parse(gladys.storedConfig[STOCKS_CONFIG_KEY]), []);
  assert.equal(gladys.storedConfig.stock_ledger_0000000a, '');
  await assert.rejects(stocks.remove(CHALET), { code: 'unknown_stock' });
  await assert.rejects(stocks.remove(MAIN), { code: 'default_stock_kept' });
  await assert.rejects(stocks.remove(undefined), { code: 'default_stock_kept' });
  // The house is free again.
  await stocks.add('chalet');
});

test('stocks: states are published for every stock', async () => {
  const { gladys, stocks } = await setup();
  await stocks.add('chalet');
  await stocks.publishStates({ force: true });
  const published = gladys.publishedStates.flat().map((state) => state.device_feature_external_id);
  assert.deepEqual(published.sort(), [
    `${CHALET}:autonomy`,
    `${CHALET}:bags`,
    `${MAIN}:autonomy`,
    `${MAIN}:bags`,
  ]);
});

/**
 * @description Stocks over a fake Gladys, NOT loaded yet.
 * @param {object} [storedConfig] - The config stored in Gladys.
 * @returns {{gladys: object, stocks: object}} The fake and the stocks.
 */
function setupUnloaded(storedConfig) {
  const gladys = createFakeGladys(storedConfig);
  const stocks = createStocks({
    gladys,
    logger: silentLogger,
    getConfig: () => DEFAULTS,
    now: () => NOW,
    newId: () => '0000000a',
  });
  return { gladys, stocks };
}

test('stocks: a movement arriving during the load never erases the stored history', async () => {
  const stored = serializeLedger(buildLedger([[5, 'inventory', 50]]));
  const { gladys, stocks } = setupUnloaded({ [LEDGER_CONFIG_KEY]: stored });
  // The host API answers slowly: the load is still on its way.
  const getConfig = gladys.getConfig;
  gladys.getConfig = () => new Promise((resolve) => setTimeout(() => resolve(getConfig()), 20));
  const loading = stocks.load();
  assert.throws(() => stocks.storeOf(), { code: 'stock_unavailable' }, 'no write before the load');
  await stocks.ready();
  await stocks.storeOf().record({ type: 'delivery', bags: 66 });
  await loading;
  const movements = parseLedger(gladys.storedConfig[LEDGER_CONFIG_KEY]).movements;
  assert.deepEqual(
    movements.map((movement) => [movement.type, movement.after]),
    [
      ['inventory', 50],
      ['delivery', 116],
    ],
  );
});

test('stocks: a failed load writes nothing, and the next call loads again', async () => {
  const stored = serializeLedger(buildLedger([[5, 'inventory', 50]]));
  const { gladys, stocks } = setupUnloaded({ [LEDGER_CONFIG_KEY]: stored });
  const getConfig = gladys.getConfig;
  gladys.getConfig = async () => {
    throw new Error('host API unreachable');
  };
  await assert.rejects(stocks.ready(), { code: 'stock_unavailable' });
  assert.equal(stocks.isLoaded(), false);
  assert.throws(() => stocks.storeOf(), { code: 'stock_unavailable' });
  await assert.rejects(stocks.add('chalet'), { code: 'stock_unavailable' });
  await stocks.publishStates({ force: true });
  assert.deepEqual(gladys.publishedStates, [], 'never a stock of 0 before the load');
  assert.equal(gladys.storedConfig[LEDGER_CONFIG_KEY], stored, 'the history is untouched');

  gladys.getConfig = getConfig;
  await stocks.ready();
  assert.equal(stocks.storeOf().getStats().stock, 50);
});

test('stocks: a movement queued on a stock being removed is refused', async () => {
  const { gladys, stocks } = await setup();
  await stocks.add('chalet');
  const store = stocks.storeOf(CHALET);
  await store.record({ type: 'inventory', bags: 20 });
  // The removal waits for the store queue: a movement queued meanwhile
  // must not write the ledger back once it is cleared.
  const removing = stocks.remove(CHALET);
  const late = store.record({ type: 'consumption', bags: 1 });
  await removing;
  await assert.rejects(late, { code: 'unknown_stock' });
  assert.equal(gladys.storedConfig.stock_ledger_0000000a, '');
});

test('stocks: a failed removal leaves the stock working', async () => {
  const { gladys, stocks } = await setup();
  await stocks.add('chalet');
  gladys.failSetConfig = true;
  await assert.rejects(stocks.remove(CHALET));
  gladys.failSetConfig = false;
  await stocks.storeOf(CHALET).record({ type: 'inventory', bags: 20 });
  assert.equal(stocks.storeOf(CHALET).getStats().stock, 20);
});

test('parseStocks / ledgerKeyOf / readHouse', () => {
  const main = { id: 'stock', type: 'bags', house: null, settings: {} };
  assert.deepEqual(parseStocks(undefined), [main]);
  assert.deepEqual(parseStocks('not json'), [main]);
  assert.deepEqual(
    parseStocks([
      { id: '0000000a', name: 'Chalet' },
      { id: '0000000a', name: 'Doublon' },
      { id: 'BAD', name: 'Bad id' },
      { id: '0000000b', name: '' },
      { id: 'maison:bags', type: 'bags', house: 'maison', ledger: '0000000c' },
      { id: 'maison:bags:x', type: 'bags', house: 'maison', ledger: '0000000d' },
      { id: 'grange:bags', type: 'bags', house: 'grange' },
      { id: 'silo:bulk', type: 'bulk', house: 'silo', ledger: '0000000e' },
      { id: 'stock', house: 'chalet', settings: { bagWeight: 10, color: 'red', palletSize: -1 } },
      null,
    ]),
    [
      { id: 'stock', type: 'bags', house: 'chalet', settings: { bagWeight: 10 } },
      { id: '0000000a', type: 'bags', house: null, settings: {}, name: 'Chalet' },
      { id: 'maison:bags', type: 'bags', house: 'maison', settings: {}, ledger: '0000000c' },
    ],
  );
  assert.equal(ledgerKeyOf({ id: 'stock' }), 'stock_ledger');
  assert.equal(ledgerKeyOf({ id: '0000000a' }), 'stock_ledger_0000000a');
  assert.equal(ledgerKeyOf({ id: 'chalet:bags', ledger: '0000000c' }), 'stock_ledger_0000000c');
  assert.equal(readHouse('chalet-des-ecrins'), 'chalet-des-ecrins');
  assert.throws(() => readHouse(42), { code: 'invalid_house' });
});
