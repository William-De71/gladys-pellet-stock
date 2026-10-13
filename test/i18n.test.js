// -----------------------------------------------------------------------------
// Four languages everywhere: English, French, German and Spanish, in the
// manifest, the runtime texts, the widgets and the user documentation.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';

import { normalizeConfig, withStockSettings } from '../src/config.js';
import { DEFAULTS } from '../src/constants.js';
import { buildDevice } from '../src/device.js';
import { LANGUAGES, MESSAGES, message, translate } from '../src/i18n.js';
import { computeStats, createLedger, recordMovement } from '../src/ledger.js';
import { buildSiloContent } from '../src/silo-widget.js';
import { buildUnknownStockContent, buildWidgetContent } from '../src/widget.js';
import { NOW, buildLedger, createFakeGladys, daysAgo } from './helpers/fixtures.js';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const manifest = JSON.parse(read('../gladys-assistant-integration.json'));

/**
 * @description Every multi-language object of the manifest, with its path.
 * @param {unknown} node - A manifest node.
 * @param {string} [path] - Its path.
 * @returns {Array<[string, object]>} The texts.
 */
function texts(node, path = '') {
  if (Array.isArray(node)) {
    return node.flatMap((child, i) => texts(child, `${path}[${i}]`));
  }
  if (node && typeof node === 'object') {
    if (typeof node.en === 'string') {
      return [[path, node]];
    }
    return Object.entries(node).flatMap(([key, child]) => texts(child, `${path}.${key}`));
  }
  return [];
}

test('the integration speaks English, French, German and Spanish', () => {
  assert.deepEqual(LANGUAGES, ['en', 'fr', 'de', 'es']);
});

test('every manifest text exists in the four languages', () => {
  const all = texts(manifest);
  assert.ok(all.length > 200);
  for (const [path, text] of all) {
    assert.deepEqual(Object.keys(text), LANGUAGES, path);
    for (const language of LANGUAGES) {
      assert.ok(text[language]?.trim(), `${path}.${language} is missing`);
    }
  }
});

test('catalog description: 10 to 100 characters per language', () => {
  for (const language of LANGUAGES) {
    const { length } = manifest.description[language];
    assert.ok(length >= 10 && length <= 100, `description.${language}: ${length}`);
  }
});

test('widget labels: 3 to 30 characters, descriptions up to 100, per language', () => {
  for (const widget of manifest.widgets) {
    for (const language of LANGUAGES) {
      const { length } = widget.label[language];
      assert.ok(length >= 3 && length <= 30, `${widget.key}.label.${language}: ${length}`);
      const description = widget.description[language].length;
      assert.ok(description <= 100, `${widget.key}.description.${language}: ${description}`);
    }
  }
});

test('the language setting follows the user by default, or forces one of the four', () => {
  const setting = manifest.config_schema.find((field) => field.key === 'language');
  assert.equal(setting.type, 'select');
  assert.equal(setting.default, DEFAULTS.language);
  assert.equal(DEFAULTS.language, 'auto');
  assert.deepEqual(
    setting.options.map((option) => option.value),
    ['auto', ...LANGUAGES],
  );
});

test('every runtime text exists in the four languages, with the same placeholders', () => {
  const placeholders = (text) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
  for (const [key, text] of Object.entries(MESSAGES.en)) {
    for (const language of LANGUAGES) {
      assert.ok(MESSAGES[language][key], `${key}.${language} is missing`);
      assert.deepEqual(
        placeholders(MESSAGES[language][key]),
        placeholders(text),
        `${key}.${language}`,
      );
    }
  }
  for (const language of LANGUAGES) {
    assert.deepEqual(Object.keys(MESSAGES[language]).sort(), Object.keys(MESSAGES.en).sort());
  }
  assert.deepEqual(Object.keys(message('nothing_to_undo')), LANGUAGES);
});

test('the toasts of the widget buttons stay within 200 characters per language', () => {
  const params = { bags: 66, stock: 1234, kg: 3000, level: 4000, name: 'Chalet des Écrins' };
  for (const key of [
    'delivery_recorded',
    'consumption_recorded',
    'undo_done',
    'nothing_to_undo',
    'not_enough_stock',
    'stock_unavailable',
    'unknown_stock',
    'silo_delivery_recorded',
    'silo_reading_recorded',
    'silo_undo_done',
    'silo_no_capacity',
    'invalid_count',
    'invalid_price',
    'invalid_weight',
    'invalid_kg',
    'invalid_percent',
    'stock_is_silo',
    'stock_is_bags',
  ]) {
    for (const [language, text] of Object.entries(message(key, { ...params, min: 1, max: 200 }))) {
      assert.ok(text.length <= 200, `${key}.${language}: ${text.length}`);
    }
  }
});

const SEASON = buildLedger([
  [400, 'delivery', 66, 459],
  [300, 'consumption', 30],
  [40, 'delivery', 66, 480],
  [30, 'consumption', 50],
  [20, 'delivery', 3],
  [10, 'consumption', 40],
  [1, 'consumption', 6],
]);

const siloLedger = (steps) =>
  steps.reduce(
    (ledger, [ago, type, kg, price]) =>
      recordMovement(ledger, { type, bags: kg, price }, daysAgo(ago), 'bulk'),
    createLedger(),
  );

test('the widgets are valid in every language, with the longest texts', () => {
  const bagsConfig = { ...DEFAULTS, palletPrice: 459, bagPrice: 459 / 66, lowStockThreshold: 20 };
  const silo = withStockSettings(
    normalizeConfig({ bulk_capacity: 6000, bulk_tonne_price: 380 }),
    {},
    'bulk',
  );
  const SILO = siloLedger([
    [60, 'delivery', 3000, 1140],
    [30, 'consumption', 1200],
    [5, 'inventory', 1500],
  ]);
  for (const language of LANGUAGES) {
    const contents = [
      buildUnknownStockContent(language),
      buildUnknownStockContent(language, 'widget_stock_is_silo'),
      buildUnknownStockContent(language, 'widget_no_silo'),
    ];
    for (const ledger of [createLedger(), SEASON]) {
      for (const settings of [
        {},
        { chart_view: 'consumption', chart_period: '365', season_start: '9' },
        { chart_view: 'consumption', chart_period: '90' },
        { show_buttons: false },
      ]) {
        contents.push(
          buildWidgetContent({
            ledger,
            stats: computeStats(ledger, NOW, bagsConfig),
            config: bagsConfig,
            settings,
            language,
            stockName: 'Chalet des Écrins',
            now: NOW,
          }),
        );
      }
    }
    for (const ledger of [createLedger(), SILO]) {
      for (const settings of [
        {},
        { chart_view: 'consumption', chart_period: '365', season_start: '9' },
      ]) {
        contents.push(
          buildSiloContent({
            ledger,
            stats: computeStats(ledger, NOW, silo),
            config: silo,
            settings,
            language,
            stockName: 'Chalet des Écrins',
            now: NOW,
          }),
        );
      }
    }
    for (const content of contents) {
      assert.deepEqual(validateWidgetContent(content), [], language);
    }
  }
});

test('device names follow the language setting, English being the fallback', () => {
  const gladys = createFakeGladys();
  assert.equal(buildDevice(gladys, 'de').name, 'Pelletvorrat');
  assert.equal(buildDevice(gladys, 'es').features[1].name, 'Autonomía de pellets');
  assert.equal(
    buildDevice(gladys, 'de', { id: 'maison:bulk', name: 'Maison', type: 'bulk' }).name,
    'Pelletsilo – Maison',
  );
  assert.equal(buildDevice(gladys, 'it').name, 'Pellet stock');
  assert.equal(translate('es', 'button_consume'), 'Quitar sacos');
});

test('docs: English and French mandatory, the four languages with the same structure', () => {
  const headings = (text) => text.split('\n').filter((line) => /^#{1,3} /.test(line)).length;
  const tables = (text) => text.split('\n').filter((line) => /^\|\s*-/.test(line)).length;
  const docs = Object.fromEntries(
    LANGUAGES.map((language) => {
      const path = new URL(`../docs/${language}.md`, import.meta.url);
      assert.ok(existsSync(path), `docs/${language}.md is missing`);
      return [language, readFileSync(path, 'utf8')];
    }),
  );
  for (const language of LANGUAGES) {
    assert.ok(docs[language].length > 300, `docs/${language}.md is too short`);
    assert.equal(headings(docs[language]), headings(docs.en), `docs/${language}.md headings`);
    assert.equal(tables(docs[language]), tables(docs.en), `docs/${language}.md tables`);
  }
});

test('README: one per language, each linking to the three others', () => {
  const files = { en: 'README.md', fr: 'README.fr.md', de: 'README.de.md', es: 'README.es.md' };
  for (const file of Object.values(files)) {
    const path = new URL(`../${file}`, import.meta.url);
    assert.ok(existsSync(path), `${file} is missing`);
    const text = readFileSync(path, 'utf8');
    for (const other of Object.values(files).filter((name) => name !== file)) {
      assert.ok(text.includes(`](${other})`), `${file} does not link to ${other}`);
    }
    assert.ok(text.includes('](cover.jpg)'), `${file} does not show the cover`);
  }
});
