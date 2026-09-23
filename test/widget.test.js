import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';
import { buildStockPoints, buildWidgetContent, readChartDays, stockColor } from '../src/widget.js';
import { computeStats, createLedger } from '../src/ledger.js';
import { DEFAULTS } from '../src/constants.js';
import { NOW, buildLedger, daysAgo } from './helpers/fixtures.js';

const config = { ...DEFAULTS };

/**
 * @description Build the widget content of a ledger.
 * @param {object} ledger - The ledger.
 * @param {object} [options] - Settings and language.
 * @returns {object} The widget content.
 */
function contentOf(ledger, { settings = {}, language = 'fr', overrides = {} } = {}) {
  const fullConfig = { ...config, ...overrides };
  return buildWidgetContent({
    ledger,
    stats: computeStats(ledger, NOW, fullConfig),
    config: fullConfig,
    settings,
    language,
    now: NOW,
  });
}

const byType = (content, type) => content.components.filter((component) => component.type === type);

const SEASON = buildLedger([
  [40, 'delivery', 66],
  [30, 'consumption', 10],
  [20, 'delivery', 66],
  [10, 'consumption', 14],
  [5, 'consumption', 7],
  [1, 'consumption', 7],
]);

test('widget: a full content fits the core vocabulary and budget exactly', () => {
  ['fr', 'en'].forEach((language) => {
    const content = contentOf(SEASON, { language });
    assert.deepEqual(validateWidgetContent(content), [], language);
  });
});

test('widget: the empty state explains how to start, with the add buttons', () => {
  const content = contentOf(createLedger());
  assert.deepEqual(validateWidgetContent(content), []);
  assert.equal(content.components[0].type, 'text');
  assert.match(content.components[0].text, /Corriger le stock/);
  const [bag, pallet] = byType(content, 'button');
  assert.equal(bag.label, '+1 sac');
  assert.deepEqual(bag.action, { key: 'add_bag', params: { bags: 1 } });
  assert.equal(pallet.action.key, 'delivery');
  assert.deepEqual(pallet.action.params, { bags: DEFAULTS.palletSize });
  assert.equal(pallet.action.confirm, true);
});

test('widget: the tiles show the stock and the autonomy', () => {
  const content = contentOf(SEASON);
  const [stock, autonomy] = byType(content, 'value');
  assert.equal(stock.value, 94);
  assert.equal(stock.unit, 'sacs');
  assert.equal(stock.color, 'success');
  assert.equal(autonomy.value, 47);
});

test('widget: four buttons, one per kind of movement, in that order', () => {
  const content = contentOf(SEASON, { language: 'en' });
  assert.deepEqual(
    byType(content, 'button').map((button) => [button.label, button.action.key]),
    [
      ['−1 bag', 'consume'],
      ['+1 bag', 'add_bag'],
      ['Pallet delivered', 'delivery'],
      ['Undo', 'undo'],
    ],
  );
  assert.deepEqual(
    byType(content, 'button').find((button) => button.action.key === 'add_bag').action.params,
    { bags: 1 },
  );
});

test('widget: unknown figures are shown as a dash, never as 0', () => {
  const content = contentOf(buildLedger([[0.2, 'delivery', 66]]), { language: 'en' });
  const [, autonomy] = byType(content, 'value');
  assert.equal(autonomy.value, '—');
  const rate = byType(content, 'status')[0].items.find((item) => item.label === 'Per day');
  assert.equal(rate.value, '—');
  assert.deepEqual(validateWidgetContent(content), []);
});

test('widget: the daily rate is a status row', () => {
  const status = (ledger) =>
    byType(contentOf(ledger), 'status')[0].items.find((item) => item.label === 'Par jour');
  assert.equal(status(SEASON).value, '2 sac/j');
  assert.equal(
    status(
      buildLedger([
        [30, 'delivery', 66],
        [29, 'consumption', 1],
      ]),
    ).value,
    'Aucune conso',
  );
});

test('widget: a low stock turns orange, adds a reminder, and still fits the budget', () => {
  const content = contentOf(
    buildLedger([
      [5, 'delivery', 20],
      [1, 'consumption', 12],
    ]),
  );
  assert.equal(byType(content, 'value')[0].color, 'warning');
  const [reminder] = byType(content, 'status')[0].items;
  assert.equal(reminder.label, 'Stock bas');
  assert.equal(reminder.color, 'warning');
  // The worst case: every status row and the four buttons.
  assert.equal(byType(content, 'button').length, 4);
  assert.deepEqual(validateWidgetContent(content), []);
});

test('widget: an empty stock is red and has no "−1 bag" button', () => {
  const content = contentOf(
    buildLedger([
      [5, 'delivery', 2],
      [1, 'consumption', 2],
    ]),
  );
  assert.equal(byType(content, 'value')[0].color, 'danger');
  const keys = byType(content, 'button').map((button) => button.action.key);
  assert.deepEqual(keys, ['add_bag', 'delivery', 'undo']);
  assert.deepEqual(validateWidgetContent(content), []);
});

test('widget: the buttons can be hidden for a wall display', () => {
  const content = contentOf(SEASON, { settings: { show_buttons: false } });
  assert.deepEqual(byType(content, 'button'), []);
});

test('widget: the delivery button adds the configured pallet size', () => {
  const content = contentOf(SEASON, { overrides: { palletSize: 72 } });
  const delivery = byType(content, 'button').find((button) => button.action.key === 'delivery');
  assert.deepEqual(delivery.action.params, { bags: 72 });
});

test('widget: the chart is a step line over the period, reaching now', () => {
  const content = contentOf(SEASON, { settings: { chart_period: '30' } });
  const [chart] = byType(content, 'chart');
  assert.equal(chart.chart_type, 'stepline');
  const { points } = chart.series[0];
  assert.equal(points[0].t, daysAgo(30).toISOString());
  assert.equal(points[0].v, 66, 'the stock when the period starts');
  assert.equal(points[points.length - 1].t, NOW.toISOString());
  assert.equal(points[points.length - 1].v, 94);
  assert.deepEqual(
    chart.annotations.map((annotation) => annotation.label),
    ['+66'],
  );
});

test('widget: the status shows the weight, the last delivery and the empty date', () => {
  const [status] = byType(contentOf(SEASON, { language: 'en' }), 'status');
  assert.deepEqual(
    status.items.map((item) => item.label),
    ['Per day', 'Remaining weight', 'Last delivery', 'Empty around'],
  );
  assert.equal(status.items[1].value, '1,410 kg');
  assert.match(status.items[2].value, /\(\+66\)$/);
});

test('widget: single bags are not marked on the chart, pallets are', () => {
  const content = contentOf(
    buildLedger([
      [10, 'delivery', 66],
      [5, 'delivery', 1],
      [4, 'delivery', 1],
      [3, 'delivery', 5],
    ]),
  );
  assert.deepEqual(
    byType(content, 'chart')[0].annotations.map((annotation) => annotation.label),
    ['+66', '+5'],
  );
});

test('buildStockPoints: a history starting inside the period starts from zero', () => {
  const points = buildStockPoints(
    buildLedger([
      [5, 'delivery', 66],
      [1, 'consumption', 1],
    ]).movements,
    NOW,
    90,
  );
  assert.deepEqual(
    points.map((point) => point.v),
    [0, 66, 65, 65],
  );
});

test('buildStockPoints: a quiet period is a flat line at the last stock', () => {
  const points = buildStockPoints(buildLedger([[100, 'delivery', 66]]).movements, NOW, 30);
  assert.deepEqual(
    points.map((point) => point.v),
    [66, 66],
  );
});

test('buildStockPoints: never exceeds the 300 points of the contract', () => {
  const steps = [[80, 'delivery', 1000]];
  for (let i = 0; i < 400; i += 1) {
    steps.push([79 - i * 0.1, 'consumption', 1]);
  }
  const content = contentOf(buildLedger(steps));
  assert.equal(byType(content, 'chart')[0].series[0].points.length, 300);
  assert.deepEqual(validateWidgetContent(content), []);
});

test('readChartDays / stockColor', () => {
  assert.equal(readChartDays({}), 90);
  assert.equal(readChartDays({ chart_period: '365' }), 365);
  assert.equal(readChartDays({ chart_period: 'x' }), 90);
  assert.equal(stockColor(0, 10), 'danger');
  assert.equal(stockColor(10, 10), 'warning');
  assert.equal(stockColor(11, 10), 'success');
});
