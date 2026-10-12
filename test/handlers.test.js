import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeConfig } from '../src/config.js';
import { registerHandlers } from '../src/handlers.js';
import { parseLedger } from '../src/ledger.js';
import { createStocks } from '../src/stocks.js';
import { NOW, createFakeGladys, silentLogger } from './helpers/fixtures.js';

const MAIN = 'ext:test:pellet:stock';
const CHALET_SILO = 'ext:test:pellet:chalet:bulk';
const MAISON_SILO = 'ext:test:pellet:maison:bulk';

/**
 * @description The handlers over a fake Gladys, clock fixed at NOW.
 * @param {object} [rawConfig] - The integration config.
 * @returns {Promise<{gladys: object, stocks: object, h: object}>} The fake,
 *   the stocks and the registered handlers.
 */
async function setup(rawConfig = {}) {
  const gladys = createFakeGladys();
  const config = normalizeConfig(rawConfig);
  let next = 10;
  const stocks = createStocks({
    gladys,
    logger: silentLogger,
    getConfig: () => config,
    now: () => NOW,
    newId: () => (next++).toString(16).padStart(8, '0'),
  });
  registerHandlers({ gladys, stocks, now: () => NOW });
  await stocks.ready();
  await stocks.refreshHouses();
  return { gladys, stocks, h: gladys.handlers };
}

const SILO = 'pellet_silo';
const BAGS = 'pellet_stock';

test('handlers: adding a silo offers its device and answers in the house name', async () => {
  const { gladys, h } = await setup();
  const answer = await h.action.add_stock({ house: 'chalet', type: 'bulk' });
  assert.match(answer.fr, /Stock de « Chalet des Écrins » ajouté/);
  assert.deepEqual(
    gladys.discovered.map((device) => device.name),
    ['Pellet stock', 'Pellet silo – Chalet des Écrins'],
  );
  const again = await h.action.add_stock({ house: 'chalet', type: 'bulk' });
  assert.match(again.fr, /a déjà un stock de pellets/);
});

test('handlers: the bag widget, form values first, the params without a form', async () => {
  const { stocks, h } = await setup();
  await h.widgetAction[BAGS]('delivery', { bags: 66 }, { values: { bags: 70, price: 490 } });
  await h.widgetAction[BAGS]('add_bag', { bags: 1 }, { values: { bags: 2, bag_price: 7.5 } });
  // An older Gladys sends no values: the declared params apply.
  await h.widgetAction[BAGS]('consume', { bags: 1 }, {});
  const answer = await h.widgetAction[BAGS]('consume', { bags: 1 }, { values: { bags: 3 } });
  assert.equal(answer.fr, '3 sac(s) utilisé(s) — il en reste 68.');
  const movements = stocks.storeOf().getLedger().movements;
  assert.equal(movements[0].purchase, undefined, 'a pallet is a delivery');
  assert.equal(movements[1].purchase, true, '"Add bag(s)" is a purchase');
  assert.deepEqual(
    movements.map((movement) => [movement.type, movement.bags, movement.price]),
    [
      ['delivery', 70, 490],
      ['delivery', 2, 15],
      ['consumption', 1, undefined],
      ['consumption', 3, undefined],
    ],
  );
  const undone = await h.widgetAction[BAGS]('undo', {}, {});
  assert.equal(undone.fr, 'Dernière opération annulée — 71 sac(s) en stock.');
});

test('handlers: each widget explains a stock of the other type', async () => {
  const { h } = await setup();
  await h.action.add_stock({ house: 'chalet', type: 'bulk' });
  const bags = await h.widgetGet[BAGS]({ settings: { stock: CHALET_SILO }, language: 'fr' });
  assert.match(bags.components[0].text, /Ce stock est un silo/);
  const silo = await h.widgetGet[SILO]({ settings: { stock: MAIN }, language: 'fr' });
  assert.match(silo.components[0].text, /Ce stock est un stock de sacs/);
  const refused = await h.widgetAction[BAGS](
    'consume',
    { bags: 1 },
    { settings: { stock: CHALET_SILO } },
  );
  assert.match(refused.fr, /Ce stock est un silo/);
});

test('handlers: the silo widget takes the only silo, asks when there are several', async () => {
  const { h } = await setup();
  const none = await h.widgetGet[SILO]({ settings: {}, language: 'fr' });
  assert.match(none.components[0].text, /Aucun silo/);

  await h.action.add_stock({ house: 'chalet', type: 'bulk' });
  const only = await h.widgetGet[SILO]({ settings: {}, language: 'fr' });
  assert.match(only.components[0].text, /Aucun niveau enregistré/);
  const delivered = await h.widgetAction[SILO](
    'delivery',
    {},
    { values: { kg: 3000, price: 1140 } },
  );
  assert.equal(delivered.fr, '3000 kg livrés — 3000 kg dans le silo.');

  await h.action.add_stock({ house: 'maison', type: 'bulk' });
  const several = await h.widgetGet[SILO]({ settings: {}, language: 'fr' });
  assert.match(several.components[0].text, /Plusieurs silos/);
  const refused = await h.widgetAction[SILO]('reading', {}, { values: { kg: 100 } });
  assert.match(refused.fr, /Plusieurs silos/);
  const picked = await h.widgetGet[SILO]({ settings: { stock: CHALET_SILO }, language: 'fr' });
  assert.equal(picked.components[0].type, 'value');
});

test('handlers: a silo level read in % of its capacity', async () => {
  const { stocks, h } = await setup();
  await h.action.add_stock({ house: 'chalet', type: 'bulk' });
  const noCapacity = await h.widgetAction[SILO]('reading', {}, { values: { percent: 40 } });
  assert.match(noCapacity.fr, /capacité du silo/);
  await h.action.configure_stock({ stock: CHALET_SILO, bulk_capacity: 4000 });
  const read = await h.widgetAction[SILO]('reading', {}, { values: { percent: 40 } });
  assert.equal(read.fr, 'Niveau enregistré : 1600 kg.');
  assert.equal(stocks.storeOf(CHALET_SILO).getStats().stock, 1600);
  const undone = await h.widgetAction[SILO]('undo', {}, {});
  assert.equal(undone.fr, 'Dernière opération annulée — 0 kg dans le silo.');
});

test('handlers: the actions counting bags refuse a silo', async () => {
  const { h } = await setup();
  await h.action.add_stock({ house: 'chalet', type: 'bulk' });
  for (const key of ['set_stock', 'add_delivery', 'consume']) {
    const answer = await h.action[key]({ stock: CHALET_SILO, bags: 3 });
    assert.match(answer.fr, /Ce stock est un silo/, key);
  }
  await assert.rejects(h.sceneAction.consume_bags({ stock: CHALET_SILO, bags: 1 }), /is a silo/);
});

test('handlers: "Set up a stock" lists the settings in use', async () => {
  const { h } = await setup({ pallet_price: 462 });
  const answer = await h.action.configure_stock({ bag_weight: 10, reset: false });
  assert.equal(
    answer.fr,
    'Réglages de « stock principal » : sacs de 10 kg (propre), 66 sacs par palette (par défaut), stock bas à 10 sacs (par défaut), moyenne sur 14 jours (par défaut), palette à 462 € (par défaut).',
  );
  const refused = await h.action.configure_stock({ bag_weight: 80 });
  assert.equal(refused.fr, 'Indiquez une valeur entre 1 et 50.');
});

test('handlers: "Analyze the cost" checks the dates and answers in the unit of the stock', async () => {
  const { h } = await setup();
  await h.action.set_stock({ bags: 10 });
  await h.action.add_delivery({ bags: 66, price: 528 });
  await h.action.consume({ bags: 20 });
  const bad = await h.action.analyze_cost({ start: '31/02/2026' });
  assert.equal(bad.fr, 'Indiquez les dates au format JJ/MM/AAAA.');
  const reversed = await h.action.analyze_cost({ start: '01/10/2026', end: '01/09/2026' });
  assert.match(reversed.fr, /ne peut pas précéder/);
  const answer = await h.action.analyze_cost({ start: '01/09/2026' });
  assert.equal(
    answer.fr,
    'Du 01/09/2026 au 23/09/2026 : 20 sac(s), 300 kg, 80\u00a0€ (0,53\u00a0€/kg). 10 sac(s) sans prix connu ne sont pas comptés dans le coût.',
  );

  await h.action.add_stock({ house: 'chalet', type: 'bulk' });
  await h.widgetAction[SILO]('delivery', {}, { values: { kg: 3000, price: 1140 } });
  await h.widgetAction[SILO]('reading', {}, { values: { kg: 2000 } });
  const silo = await h.action.analyze_cost({ stock: CHALET_SILO, start: '1/9/26' });
  assert.equal(
    silo.fr,
    'Du 01/09/2026 au 23/09/2026 : 1\u202f000 kg, 380\u00a0€ (0,38\u00a0€/kg).',
  );
});

test('handlers: scene actions, the silo ones defaulting to the only silo', async () => {
  const { stocks, h } = await setup();
  await h.action.add_stock({ house: 'maison', type: 'bulk' });
  await h.action.configure_stock({ stock: MAISON_SILO, bulk_capacity: 5000 });
  await h.sceneAction.silo_delivery({ kg: 4000, price: 1600 });
  const outputs = await h.sceneAction.silo_reading({ percent: 70 });
  assert.equal(outputs.stock, 3500);
  assert.equal(outputs.type, 'bulk');
  assert.equal(outputs.unit, 'kg');

  // Bags with their price and weight: bought on their own, unless ticked.
  await h.sceneAction.add_bags({ bags: 10, bag_price: 7, bag_weight: 10 });
  const [added] = stocks.storeOf().getLedger().movements;
  assert.deepEqual([added.price, added.bagWeight, added.purchase], [70, 10, true]);
  await h.sceneAction.consume_bags({ bags: 4 });

  // The figures, the season cost included.
  const read = await h.sceneAction.read_stock({});
  assert.equal(read.type, 'bags');
  assert.equal(read.unit, 'bag');
  assert.equal(read.stock, 6);
  assert.equal(read.remaining_kg, 60);
  assert.deepEqual(
    [read.season_cost, read.season_used, read.season_kg, read.season_unpriced],
    [28, 4, 40, 0],
  );
  const silo = await h.sceneAction.read_stock({ stock: MAISON_SILO, season_start: '9' });
  assert.deepEqual([silo.season_used, silo.season_cost], [500, 200]);
});

test('handlers: a scene adding bags as a delivery', async () => {
  const { stocks, h } = await setup();
  await h.sceneAction.add_bags({ bags: 66, delivery: true });
  const [delivered] = stocks.storeOf().getLedger().movements;
  assert.equal(delivered.purchase, undefined);
  assert.equal(stocks.storeOf().getStats().lastDelivery.bags, 66);
});

test('handlers: attaching and removing a stock answer in the house name', async () => {
  const { gladys, h } = await setup();
  const attached = await h.action.attach_stock({ house: 'maison' });
  assert.equal(attached.fr, 'Stock rattaché à la maison « Maison ».');
  await h.action.add_stock({ house: 'chalet' });
  const removed = await h.action.remove_stock({ stock: 'ext:test:pellet:chalet:bags' });
  assert.match(removed.fr, /Stock « Chalet des Écrins » supprimé/);
  assert.deepEqual(
    gladys.discovered.map((device) => device.external_id),
    [MAIN],
  );
  const kept = await h.action.remove_stock({});
  assert.equal(kept.fr, 'Le stock principal ne peut pas être supprimé.');
  assert.equal(parseLedger(gladys.storedConfig.stock_ledger_0000000a).movements.length, 0);
});

test('handlers: the devices offered on Discovery are named in the configured language', async () => {
  const { gladys, h } = await setup({ language: 'de' });
  await h.action.add_stock({ house: 'chalet', type: 'bulk' });
  assert.deepEqual(
    gladys.discovered.map((device) => device.name),
    ['Pelletvorrat', 'Pelletsilo – Chalet des Écrins'],
  );
});

test('handlers: a device added, or a silo added, refreshes both widgets', async () => {
  const { gladys, h } = await setup();
  gladys.refreshes.length = 0;
  await h.action.add_stock({ house: 'chalet', type: 'bulk' });
  assert.ok(gladys.refreshes.includes(SILO), 'the silo widget, no longer "No silo yet"');
  gladys.refreshes.length = 0;
  gladys.publishedStates.length = 0;
  await gladys.handlers.deviceCreated({ external_id: CHALET_SILO });
  assert.deepEqual([...new Set(gladys.refreshes)].sort(), [SILO, BAGS]);
  assert.ok(gladys.publishedStates.length > 0, 'the states are published again');
});
