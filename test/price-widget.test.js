import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';
import { normalizeConfig, withStockSettings } from '../src/config.js';
import { DEFAULTS } from '../src/constants.js';
import { LANGUAGES } from '../src/i18n.js';
import { createLedger, recordMovement } from '../src/ledger.js';
import {
  buildPriceContent,
  buildPricePoints,
  priceHistory,
  readPricePeriod,
  seasonCosts,
  seasonName,
  yearlyChange,
} from '../src/price-widget.js';
import { NOW, daysAgo } from './helpers/fixtures.js';

const config = { ...DEFAULTS };

/**
 * @description Build a ledger from `[daysAgo, type, units, price?]` steps.
 * @param {Array<Array>} steps - The movements, oldest first.
 * @param {string} [type] - The stock type.
 * @returns {object} The ledger.
 */
function ledgerOf(steps, type = 'bags') {
  return steps.reduce(
    (ledger, [ago, kind, units, price]) =>
      recordMovement(ledger, { type: kind, bags: units, price }, daysAgo(ago), type),
    createLedger(),
  );
}

// Three seasons (NOW is 2026-09-23, so the current season started in
// October 2025): a pallet at 6.90 €, one at 6.60 €, one at 7.15 €.
const YEARS = ledgerOf([
  [720, 'delivery', 66, 455.4],
  [700, 'consumption', 40],
  [500, 'consumption', 20],
  [380, 'delivery', 66, 435.6],
  [300, 'consumption', 50],
  [200, 'delivery', 66, 471.9],
  [150, 'consumption', 60],
  [10, 'consumption', 5],
]);

const contentOf = (ledger, options = {}) =>
  buildPriceContent({ ledger, config, language: 'fr', now: NOW, ...options });
// Intl puts narrow no-break spaces before € and %.
const plain = (text) => (typeof text === 'string' ? text.replace(/[\u202f\u00a0]/g, ' ') : text);
const byType = (content, type) => content.components.filter((component) => component.type === type);

test('prices: the price of each priced delivery, per bag, oldest first', () => {
  const history = priceHistory(YEARS.movements);
  assert.deepEqual(
    history.map(({ price }) => Math.round(price * 100) / 100),
    [6.9, 6.6, 7.15],
  );
  // A silo is priced per tonne.
  const silo = ledgerOf([[30, 'delivery', 3000, 1170]], 'bulk');
  assert.deepEqual(
    priceHistory(silo.movements, 'bulk').map(({ price }) => price),
    [390],
  );
});

test('prices: the change over one year compares with the price in force a year earlier', () => {
  const history = priceHistory(YEARS.movements);
  // 7.15 € (200 days ago) against 6.90 € in force 565 days ago.
  assert.equal(Math.round(yearlyChange(history) * 1000) / 1000, 0.036);
  assert.equal(yearlyChange(history.slice(0, 1)), null);
  assert.equal(yearlyChange([]), null);
});

test('prices: the step line starts at the price in force and reaches now', () => {
  const history = priceHistory(YEARS.movements);
  const points = buildPricePoints(history, NOW, 365);
  assert.deepEqual(
    points.map(({ v }) => v),
    [6.6, 7.15, 7.15],
  );
  assert.equal(points[0].t, daysAgo(365).toISOString());
  assert.equal(points.at(-1).t, NOW.toISOString());
  assert.equal(buildPricePoints(history, NOW, 1095).length, 4);
  assert.deepEqual(buildPricePoints([], NOW, 365), []);
});

test('prices: one row per heating season, the current one first', () => {
  const seasons = seasonCosts(YEARS.movements, config, 10, NOW);
  assert.deepEqual(
    seasons.map((season) => seasonName(season.start)),
    ['2025-26', '2024-25'],
  );
  assert.equal(seasons[0].end, null);
  assert.equal(seasonName(new Date(2026, 0, 1)), '2026');
  assert.deepEqual(seasonCosts([], config, 10, NOW), []);
});

test('prices: a full content fits the core vocabulary in every language', () => {
  for (const language of LANGUAGES) {
    for (const period of ['365', '1095', '1825']) {
      const content = contentOf(YEARS, { language, settings: { chart_period: period } });
      assert.deepEqual(validateWidgetContent(content), [], `${language} ${period}`);
    }
  }
  const content = contentOf(YEARS);
  assert.deepEqual(
    byType(content, 'value').map((tile) => [tile.label, plain(tile.value), tile.unit, tile.color]),
    [
      ['Dernier prix', '7,15 €', '/sac', 'primary'],
      ['Sur un an', '+4 %', undefined, 'warning'],
    ],
  );
  const [status] = byType(content, 'status');
  assert.equal(status.items[0].label, '2025-26');
  assert.equal(status.items[0].color, 'info');
  assert.match(plain(status.items[0].value), /^\d[\d ]* € · \d+ sacs · \d+,\d\d €\/sac$/);
  assert.equal(status.items[1].label, '2024-25');
});

test('prices: a stable price, a lower price', () => {
  const stable = ledgerOf([
    [400, 'delivery', 66, 462],
    [20, 'delivery', 66, 462],
  ]);
  const [, change] = byType(contentOf(stable), 'value');
  assert.deepEqual([plain(change.value), change.color, change.icon], ['0 %', 'neutral', 'minus']);
  const lower = ledgerOf([
    [400, 'delivery', 66, 462],
    [20, 'delivery', 66, 429],
  ]);
  const [, down] = byType(contentOf(lower), 'value');
  assert.deepEqual([plain(down.value), down.color], ['-7 %', 'success']);
});

test('prices: without any price, an explanation instead of empty figures', () => {
  const content = contentOf(ledgerOf([[10, 'inventory', 40]]));
  assert.equal(content.components.length, 1);
  assert.match(content.components[0].text, /Aucun prix enregistré/);
  const silo = contentOf(ledgerOf([[10, 'inventory', 2000]], 'bulk'), { type: 'bulk' });
  assert.match(silo.components[0].text, /widget du silo/);
});

test('prices: a silo in € per tonne and in tonnes, named in the chart title', () => {
  const silo = ledgerOf(
    [
      [300, 'delivery', 3000, 1080],
      [200, 'inventory', 2200],
      [30, 'delivery', 3000, 1170],
      [5, 'inventory', 4000],
    ],
    'bulk',
  );
  const content = contentOf(silo, {
    type: 'bulk',
    stockName: 'Chalet',
    config: withStockSettings(normalizeConfig(), {}, 'bulk'),
  });
  assert.deepEqual(validateWidgetContent(content), []);
  const [last, change] = byType(content, 'value');
  assert.deepEqual([plain(last.value), last.unit], ['390,00 €', '/t']);
  assert.equal(change, undefined, 'no price a year earlier');
  const [chart] = byType(content, 'chart');
  assert.equal(chart.title, 'Chalet · Prix à la tonne (€)');
  const [status] = byType(content, 'status');
  assert.match(plain(status.items[0].value), / · \d+(,\d)? t · \d+,\d\d €\/t$/);
});

test('prices: bags without a price are told apart in their season', () => {
  const ledger = ledgerOf([
    [200, 'inventory', 20],
    [150, 'delivery', 66, 462],
    [100, 'consumption', 30],
  ]);
  const [status] = byType(contentOf(ledger), 'status');
  assert.match(status.items[0].value, /\(20 sans prix\)$/);
});

test('readPricePeriod', () => {
  assert.equal(readPricePeriod({ chart_period: '365' }), 365);
  assert.equal(readPricePeriod({ chart_period: '90' }), 1095);
  assert.equal(readPricePeriod({}), 1095);
});
