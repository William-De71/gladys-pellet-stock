// -----------------------------------------------------------------------------
// Test helpers: a fixed clock, ledgers built day by day, and a fake Gladys.
// -----------------------------------------------------------------------------

import { DAY_MS } from '../../src/constants.js';
import { createLedger, recordMovement } from '../../src/ledger.js';

// 2026-09-23T08:00:00Z, the "now" of every test.
const NOW = new Date('2026-09-23T08:00:00.000Z');

/**
 * @description The date `days` days before NOW.
 * @param {number} days - Days in the past.
 * @returns {Date} The date.
 * @example
 * daysAgo(3);
 */
function daysAgo(days) {
  return new Date(NOW.getTime() - days * DAY_MS);
}

/**
 * @description Build a ledger from `[daysAgo, type, bags]` steps.
 * @param {Array<[number, string, number]>} steps - The movements, oldest first.
 * @returns {object} The ledger.
 * @example
 * buildLedger([[10, 'delivery', 66], [5, 'consumption', 2]]);
 */
function buildLedger(steps) {
  return steps.reduce(
    (ledger, [ago, type, bags]) => recordMovement(ledger, { type, bags }, daysAgo(ago)),
    createLedger(),
  );
}

/**
 * @description A fake GladysIntegration recording what the store sends.
 * @param {object} [config] - The stored config.
 * @returns {object} The fake.
 * @example
 * const gladys = createFakeGladys();
 */
function createFakeGladys(config = {}) {
  const fake = {
    storedConfig: { ...config },
    publishedStates: [],
    refreshes: [],
    failSetConfig: false,
    failPublishStates: false,
    externalIds(type, platformId) {
      const device = `ext:test:${type}:${platformId}`;
      return { device, feature: (key) => `${device}:${key}` };
    },
    async getConfig() {
      return { ...fake.storedConfig };
    },
    async setConfig(partial) {
      if (fake.failSetConfig) {
        throw new Error('host API unreachable');
      }
      Object.assign(fake.storedConfig, partial);
      return { success: true };
    },
    async publishStates(states) {
      if (fake.failPublishStates) {
        throw new Error('device feature not found');
      }
      fake.publishedStates.push(states);
      return { success: true };
    },
    requestWidgetRefresh(key) {
      fake.refreshes.push(key);
    },
  };
  return fake;
}

const silentLogger = { debug() {}, info() {}, warn() {}, error() {} };

export { NOW, daysAgo, buildLedger, createFakeGladys, silentLogger };
