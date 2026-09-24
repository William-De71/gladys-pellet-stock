import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStocks, ledgerKeyOf, parseStocks, readStockName } from '../src/stocks.js';
import { DEFAULTS, LEDGER_CONFIG_KEY, STOCKS_CONFIG_KEY, WIDGET_KEY } from '../src/constants.js';
import { parseLedger, serializeLedger } from '../src/ledger.js';
import { NOW, buildLedger, createFakeGladys, silentLogger } from './helpers/fixtures.js';

const MAIN = 'ext:test:pellet:stock';
const CHALET = 'ext:test:pellet:0000000a';

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
  return { gladys, stocks };
}

test('stocks: the main stock keeps the keys of the single-stock versions', async () => {
  const { stocks } = await setup({
    [LEDGER_CONFIG_KEY]: serializeLedger(buildLedger([[3, 'delivery', 66]])),
  });
  assert.deepEqual(stocks.list(), [{ id: 'stock', name: null }]);
  assert.equal(stocks.storeOf().getStats().stock, 66, 'no choice: the main stock');
  assert.equal(stocks.storeOf(MAIN).getStats().stock, 66);
  assert.deepEqual(
    stocks.devices('fr').map((device) => [device.external_id, device.name]),
    [[MAIN, 'Stock de pellets']],
  );
});

test('stocks: an added stock has its own ledger and device', async () => {
  const { gladys, stocks } = await setup();
  const chalet = await stocks.add('  Chalet ');
  assert.deepEqual(chalet, { id: '0000000a', name: 'Chalet' });
  assert.deepEqual(JSON.parse(gladys.storedConfig[STOCKS_CONFIG_KEY]), [chalet]);
  assert.deepEqual(gladys.refreshes, [WIDGET_KEY]);

  await stocks.storeOf(CHALET).record({ type: 'delivery', bags: 20 });
  assert.equal(stocks.storeOf(CHALET).getStats().stock, 20);
  assert.equal(stocks.storeOf().getStats().stock, 0, 'the main stock is untouched');
  assert.equal(parseLedger(gladys.storedConfig[ledgerKeyOf('0000000a')]).movements.length, 1);
  assert.equal(gladys.storedConfig[LEDGER_CONFIG_KEY], undefined);

  assert.deepEqual(
    stocks.devices('fr').map((device) => [device.external_id, device.name]),
    [
      [MAIN, 'Stock de pellets'],
      [CHALET, 'Stock de pellets – Chalet'],
    ],
  );
  assert.equal(stocks.devices()[1].features[0].external_id, `${CHALET}:bags`);
});

test('stocks: the added stocks survive a restart', async () => {
  const first = await setup();
  await first.stocks.add('Chalet');
  await first.stocks.storeOf(CHALET).record({ type: 'delivery', bags: 20 });
  const { stocks } = await setup(first.gladys.storedConfig);
  assert.equal(stocks.find(CHALET).name, 'Chalet');
  assert.equal(stocks.storeOf(CHALET).getStats().stock, 20);
});

test('stocks: names are checked', async () => {
  const { stocks } = await setup();
  await stocks.add('Chalet');
  await assert.rejects(stocks.add('chalet'), { code: 'stock_name_taken' });
  await assert.rejects(stocks.add('   '), { code: 'invalid_stock_name' });
  await assert.rejects(stocks.add('x'.repeat(25)), { code: 'invalid_stock_name' });
  for (let i = 2; i <= 9; i += 1) {
    await stocks.add(`Maison ${i}`);
  }
  await assert.rejects(stocks.add('Une de trop'), { code: 'too_many_stocks', params: { max: 10 } });
});

test('stocks: an unknown stock is refused, never mixed up with the main one', async () => {
  const { stocks } = await setup();
  assert.equal(stocks.find('ext:test:pellet:deadbeef'), null);
  assert.throws(() => stocks.storeOf('ext:test:pellet:deadbeef'), { code: 'unknown_stock' });
});

test('stocks: removing an added stock drops it and its ledger, the main one stays', async () => {
  const { gladys, stocks } = await setup();
  await stocks.add('Chalet');
  await stocks.storeOf(CHALET).record({ type: 'delivery', bags: 20 });
  const removed = await stocks.remove(CHALET);
  assert.equal(removed.name, 'Chalet');
  assert.deepEqual(stocks.list(), [{ id: 'stock', name: null }]);
  assert.deepEqual(JSON.parse(gladys.storedConfig[STOCKS_CONFIG_KEY]), []);
  assert.equal(gladys.storedConfig[ledgerKeyOf('0000000a')], '');
  await assert.rejects(stocks.remove(CHALET), { code: 'unknown_stock' });
  await assert.rejects(stocks.remove(MAIN), { code: 'default_stock_kept' });
  await assert.rejects(stocks.remove(undefined), { code: 'default_stock_kept' });
});

test('stocks: states are published for every stock', async () => {
  const { gladys, stocks } = await setup();
  await stocks.add('Chalet');
  await stocks.publishStates({ force: true });
  const published = gladys.publishedStates.flat().map((state) => state.device_feature_external_id);
  assert.deepEqual(published.sort(), [
    `${CHALET}:autonomy`,
    `${CHALET}:bags`,
    `${MAIN}:autonomy`,
    `${MAIN}:bags`,
  ]);
});

test('parseStocks / readStockName', () => {
  assert.deepEqual(parseStocks(undefined), []);
  assert.deepEqual(parseStocks('not json'), []);
  assert.deepEqual(
    parseStocks([
      { id: '0000000a', name: 'Chalet' },
      { id: '0000000a', name: 'Doublon' },
      { id: 'BAD', name: 'Bad id' },
      { id: '0000000b', name: '' },
      null,
    ]),
    [{ id: '0000000a', name: 'Chalet' }],
  );
  assert.equal(readStockName(' Chalet '), 'Chalet');
  assert.throws(() => readStockName(42), { code: 'invalid_stock_name' });
});
