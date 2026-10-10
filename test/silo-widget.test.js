import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';
import { normalizeConfig, withStockSettings } from '../src/config.js';
import { computeStats, createLedger, recordMovement } from '../src/ledger.js';
import { buildSiloContent, formatKg, readLevel } from '../src/silo-widget.js';
import { NOW, daysAgo } from './helpers/fixtures.js';

/**
 * @description Build a silo ledger from `[daysAgo, type, kg, price?]` steps.
 * @param {Array<Array>} steps - The movements, oldest first.
 * @returns {object} The ledger.
 */
function siloLedger(steps) {
  return steps.reduce(
    (ledger, [ago, type, kg, price]) =>
      recordMovement(ledger, { type, bags: kg, price }, daysAgo(ago), 'bulk'),
    createLedger(),
  );
}

/**
 * @description The silo widget content of a ledger.
 * @param {object} ledger - The ledger.
 * @param {object} [options] - Raw config, stock settings, widget settings, language.
 * @returns {object} The content.
 */
function contentOf(ledger, { raw = {}, own = {}, settings = {}, language = 'fr' } = {}) {
  const config = withStockSettings(normalizeConfig(raw), own, 'bulk');
  return buildSiloContent({
    ledger,
    stats: computeStats(ledger, NOW, config),
    config,
    settings,
    language,
    stockName: 'Chalet',
    now: NOW,
  });
}

const byType = (content, type) => content.components.filter((component) => component.type === type);
const rowsOf = (content) =>
  Object.fromEntries(byType(content, 'status')[0].items.map((item) => [item.label, item.value]));

// A delivery of 3 t at 380 €/t, then readings every ten days.
const SEASON = siloLedger([
  [60, 'inventory', 400],
  [50, 'delivery', 3000, 1140],
  [30, 'inventory', 2600],
  [20, 'inventory', 2200],
  [10, 'inventory', 1900],
  [1, 'inventory', 1650],
]);

test('silo widget: a full content fits the core vocabulary and budget', () => {
  ['fr', 'en'].forEach((language) => {
    const content = contentOf(SEASON, { raw: { bulk_capacity: 4000 }, language });
    assert.deepEqual(validateWidgetContent(content), [], language);
  });
  const content = contentOf(SEASON, { raw: { bulk_capacity: 4000 } });
  assert.deepEqual(
    byType(content, 'button').map((button) => [button.label, button.action.key]),
    [
      ['Livraison', 'delivery'],
      ['Relevé de niveau', 'reading'],
      ['Annuler', 'undo'],
    ],
  );
  assert.equal(byType(content, 'chart')[0].title, 'Chalet · niveau (kg)');
  assert.deepEqual(
    byType(content, 'chart')[0].annotations.map((annotation) => annotation.label),
    ['+3 t'],
  );
});

test('silo widget: the level in tonnes from 1,000 kg, the fill rate with a capacity', () => {
  const content = contentOf(SEASON, { raw: { bulk_capacity: 4000 } });
  const [level] = byType(content, 'value');
  assert.deepEqual([level.value, level.unit], [1.7, 't']);
  const rows = rowsOf(content);
  assert.equal(rows.Remplissage, '41 %');
  assert.equal(rows['Dernier relevé'], 'hier');
  assert.equal(rows['Valeur du stock'], '627 € · 0,38 €/kg');
  // 550 kg read lower over the last 14 days.
  assert.equal(rows['Par jour'], '39,3 kg/j');
  assert.equal(rowsOf(contentOf(SEASON)).Remplissage, undefined, 'no capacity, no rate');

  const low = siloLedger([[5, 'inventory', 300]]);
  const [lowLevel] = byType(contentOf(low), 'value');
  assert.deepEqual([lowLevel.value, lowLevel.unit, lowLevel.color], [300, 'kg', 'warning']);
});

test('silo widget: the delivery form, pre-filled with the usual delivery and its price', () => {
  const delivery = (raw) =>
    byType(contentOf(SEASON, { raw }), 'button').find((button) => button.action.key === 'delivery')
      .action;
  const action = delivery({ bulk_delivery_default: 2500, bulk_tonne_price: 400 });
  assert.deepEqual(
    action.fields.map(({ key, required, min, max, default: value }) => [
      key,
      required,
      min,
      max,
      value,
    ]),
    [
      ['kg', true, 1, 30000, 2500],
      ['price', false, 0, 20000, 1000],
    ],
  );
  assert.equal('default' in delivery({}).fields[1], false, 'no price per tonne');
});

test('silo widget: the reading form asks for kg, or % with a capacity', () => {
  const reading = (raw, own) =>
    byType(contentOf(SEASON, { raw, own }), 'button').find(
      (button) => button.action.key === 'reading',
    ).action.fields[0];
  assert.deepEqual([reading({}).key, reading({}).max], ['kg', 100000]);
  assert.equal(reading({ bulk_capacity: 4000 }).max, 4000, 'never above the capacity');
  const percent = reading({ bulk_capacity: 4000, bulk_reading_unit: 'percent' });
  assert.deepEqual([percent.key, percent.min, percent.max], ['percent', 0, 100]);
  // In % without a capacity: back to kg.
  assert.equal(reading({ bulk_reading_unit: 'percent' }).key, 'kg');
  // A setting of the silo wins.
  assert.equal(reading({ bulk_reading_unit: 'percent' }, { bulkCapacity: 5000 }).key, 'percent');
});

test('silo widget: the season cost in kg', () => {
  const rows = rowsOf(contentOf(SEASON, { settings: { season_start: '7' } }));
  // 400 kg without a price, then 1,350 kg at 0.38 €/kg.
  assert.equal(rows['Coût de la saison'], '513 € · 1,8 t (400 kg sans prix)');
});

test('silo widget: an empty silo explains how to start', () => {
  const content = contentOf(createLedger());
  assert.deepEqual(validateWidgetContent(content), []);
  assert.match(content.components[0].text, /Relevé de niveau/);
  assert.deepEqual(
    byType(content, 'button').map((button) => button.action.key),
    ['delivery', 'reading'],
  );
  assert.deepEqual(
    byType(contentOf(createLedger(), { settings: { show_buttons: false } }), 'button'),
    [],
  );
});

test('readLevel: kg as typed, % of the capacity', () => {
  assert.equal(readLevel({ kg: 1200 }, { bulkCapacity: null }), 1200);
  assert.equal(readLevel({ percent: 40 }, { bulkCapacity: 4000 }), 1600);
  assert.equal(readLevel({ percent: '33.3' }, { bulkCapacity: 1000 }), 333);
  assert.throws(() => readLevel({ percent: 40 }, { bulkCapacity: null }), {
    code: 'silo_no_capacity',
  });
  assert.throws(() => readLevel({ percent: 120 }, { bulkCapacity: 4000 }), {
    code: 'invalid_percent',
  });
});

test('formatKg', () => {
  assert.equal(formatKg(950, 'fr'), '950 kg');
  assert.equal(formatKg(2450, 'fr'), '2,5 t');
});
