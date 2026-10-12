// -----------------------------------------------------------------------------
// Non-regression of everything users store: the device and feature external
// ids, the fields the Discovery "Update" button compares (category, type,
// unit, min, max, step), and every key of the manifest a scene, a widget or a
// saved configuration refers to. Plus the wiring of the manifest to the code:
// every action, scene action and widget has its handler, and back.
//
// test/fixtures/discovery.baseline.json was generated before the update of
// October 2026, from main at b31658f (version 1.2.0 plus the houses and the
// silo, not released yet); the devices of 1.2.0 are identical. A failure here
// means existing users would have to delete and recreate a device, or would
// lose a scene or a widget setting: never update the baseline without a
// documented migration.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { normalizeConfig } from '../src/config.js';
import { buildDevice } from '../src/device.js';
import { registerHandlers } from '../src/handlers.js';
import { LANGUAGES } from '../src/i18n.js';
import { SCENE_TRIGGERS } from '../src/scene.js';
import { createStocks } from '../src/stocks.js';
import { NOW, createFakeGladys, silentLogger } from './helpers/fixtures.js';

const read = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const baseline = read('./fixtures/discovery.baseline.json');
const manifest = read('../gladys-assistant-integration.json');

// The external ids of the baseline, as the SDK builds them for this integration.
const gladys = {
  externalIds(type, platformId) {
    const device = `ext:pellet-stock:${type}:${platformId}`;
    return { device, feature: (key) => `${device}:${key}` };
  },
};

const ETERNAL = [
  'external_id',
  'category',
  'type',
  'unit',
  'min',
  'max',
  'step',
  'read_only',
  'has_feedback',
];
const pick = (feature) =>
  Object.fromEntries(
    ETERNAL.filter((key) => feature[key] !== undefined).map((key) => [key, feature[key]]),
  );
const keys = (list) => (list ?? []).map((entry) => entry.key);
const byKey = (list) => new Map((list ?? []).map((entry) => [entry.key, entry]));

const DEVICES = {
  bags_default: (language) => buildDevice(gladys, language),
  bags_house: (language) => buildDevice(gladys, language, { id: 'maison:bags', name: 'Maison' }),
  bulk_house: (language) =>
    buildDevice(gladys, language, { id: 'maison:bulk', name: 'Maison', type: 'bulk' }),
};

test('the devices keep their external ids and the fields Discovery compares, in every language', () => {
  assert.deepEqual(Object.keys(DEVICES), Object.keys(baseline.devices));
  for (const [name, build] of Object.entries(DEVICES)) {
    const expected = baseline.devices[name];
    for (const language of LANGUAGES) {
      const device = build(language);
      assert.equal(device.external_id, expected.external_id, name);
      assert.equal(device.should_poll, expected.should_poll, name);
      assert.equal(device.poll_frequency, expected.poll_frequency, name);
      assert.deepEqual(device.features.map(pick), expected.features, `${name} (${language})`);
      for (const feature of device.features) {
        for (const field of ['min', 'max', 'read_only', 'has_feedback']) {
          assert.notEqual(feature[field], undefined, `${feature.external_id}.${field}`);
        }
      }
    }
  }
});

test('no configuration key disappears, changes type or loses an option', () => {
  const current = byKey(manifest.config_schema);
  for (const { key, type, options } of baseline.manifest.config_schema) {
    const now = current.get(key);
    assert.equal(now?.type, type, `config_schema.${key}`);
    for (const value of options ?? []) {
      assert.ok(
        now.options.some((option) => option.value === value),
        `config_schema.${key}: ${value}`,
      );
    }
  }
});

test('no configuration action disappears', () => {
  const current = keys(manifest.actions);
  for (const { key } of baseline.manifest.actions) {
    assert.ok(current.includes(key), `actions.${key}`);
  }
});

test('scene triggers keep their keys, filters and variables', () => {
  const current = byKey(manifest.scene_triggers);
  for (const trigger of baseline.manifest.scene_triggers) {
    const now = current.get(trigger.key);
    assert.ok(now, `scene_triggers.${trigger.key}`);
    for (const field of trigger.fields) {
      assert.ok(keys(now.fields).includes(field), `${trigger.key}.fields.${field}`);
    }
    const variables = byKey(now.variables);
    for (const { key, type } of trigger.variables) {
      assert.equal(variables.get(key)?.type, type, `${trigger.key}.variables.${key}`);
    }
  }
});

test('scene actions keep their keys, fields and outputs', () => {
  const current = byKey(manifest.scene_actions);
  for (const action of baseline.manifest.scene_actions) {
    const now = current.get(action.key);
    assert.ok(now, `scene_actions.${action.key}`);
    for (const field of action.fields) {
      assert.ok(keys(now.fields).includes(field), `${action.key}.fields.${field}`);
    }
    const outputs = byKey(now.outputs);
    for (const { key, type } of action.outputs) {
      assert.equal(outputs.get(key)?.type, type, `${action.key}.outputs.${key}`);
    }
  }
});

test('widgets keep their keys, settings, option values and buttons', () => {
  const current = byKey(manifest.widgets);
  for (const widget of baseline.manifest.widgets) {
    const now = current.get(widget.key);
    assert.ok(now, `widgets.${widget.key}`);
    const settings = byKey(now.settings);
    for (const key of widget.settings) {
      assert.ok(settings.has(key), `${widget.key}.settings.${key}`);
    }
    for (const [key, values] of Object.entries(widget.options)) {
      const options = settings.get(key).options.map((option) => option.value);
      for (const value of values) {
        assert.ok(options.includes(value), `${widget.key}.settings.${key}: ${value}`);
      }
    }
    for (const key of widget.actions) {
      assert.ok(keys(now.actions).includes(key), `${widget.key}.actions.${key}`);
    }
  }
});

test('every action, scene action and widget of the manifest has its handler, and back', () => {
  const fake = createFakeGladys();
  const config = normalizeConfig();
  const stocks = createStocks({
    gladys: fake,
    logger: silentLogger,
    getConfig: () => config,
    now: () => NOW,
  });
  registerHandlers({ gladys: fake, stocks, now: () => NOW });
  const sorted = (list) => [...list].sort();
  assert.deepEqual(sorted(Object.keys(fake.handlers.action)), sorted(keys(manifest.actions)));
  assert.deepEqual(
    sorted(Object.keys(fake.handlers.sceneAction)),
    sorted(keys(manifest.scene_actions)),
  );
  assert.deepEqual(sorted(Object.keys(fake.handlers.widgetGet)), sorted(keys(manifest.widgets)));
  // The buttons are declared by the widget contents: the stock and silo
  // widgets have some, the prices widget is read only.
  assert.deepEqual(sorted(Object.keys(fake.handlers.widgetAction)), [
    'pellet_silo',
    'pellet_stock',
  ]);
  assert.deepEqual(sorted(Object.values(SCENE_TRIGGERS)), sorted(keys(manifest.scene_triggers)));
});
