// -----------------------------------------------------------------------------
// The stock store: the in-memory ledger, its persistence, and what follows a
// change (device states, widget nudge).
//
// Every movement goes through ONE queue: two taps on "−1 bag" from two
// dashboards must never both read the same stock and lose a bag. A movement
// is applied in memory only once setConfig() succeeded, so a failed write
// leaves the stock as the user last saw it — and the error reaches the toast.
// -----------------------------------------------------------------------------

import { LEDGER_CONFIG_KEY, WIDGET_KEY } from './constants.js';
import { buildStates } from './device.js';
import {
  computeStats,
  createLedger,
  parseLedger,
  recordMovement,
  serializeLedger,
  undoLastMovement,
} from './ledger.js';

/**
 * @description Create the stock store.
 * @param {object} params - The dependencies.
 * @param {object} params.gladys - The GladysIntegration instance.
 * @param {object} params.logger - The logger.
 * @param {Function} params.getConfig - Returns the normalized config.
 * @param {Function} [params.now] - Clock, injectable for the tests.
 * @returns {object} The store.
 * @example
 * const store = createStockStore({ gladys, logger, getConfig: () => config });
 */
function createStockStore({ gladys, logger, getConfig, now = () => new Date() }) {
  let ledger = createLedger();
  let queue = Promise.resolve();
  // Last value published per feature: the host API rate-limits states, and
  // the hourly refresh must not republish an unchanged stock.
  const published = new Map();

  /**
   * @description Run a task after every queued one, whatever their outcome.
   * @param {Function} task - The async task.
   * @returns {Promise<unknown>} The task result.
   */
  function enqueue(task) {
    const run = queue.then(task);
    queue = run.catch(() => {});
    return run;
  }

  /**
   * @description The figures of the current ledger.
   * @returns {object} The computeStats() result.
   */
  function getStats() {
    return computeStats(ledger, now(), getConfig());
  }

  /**
   * @description Publish the device states that changed since the last call.
   * @param {object} [options] - Options.
   * @param {boolean} [options.force] - Republish everything (device just created).
   * @returns {Promise<void>}
   */
  async function publishStates({ force = false } = {}) {
    const states = buildStates(gladys, getStats()).filter(
      ({ device_feature_external_id: id, state }) => force || published.get(id) !== state,
    );
    if (states.length === 0) {
      return;
    }
    try {
      await gladys.publishStates(states);
      states.forEach(({ device_feature_external_id: id, state }) => published.set(id, state));
    } catch (error) {
      // Expected until the user adds the device from the Discovery screen:
      // the widget works without it, so this is not worth a warning.
      logger.debug(`Device states not published: ${error.message}`);
    }
  }

  /**
   * @description Tell Gladys the stock changed: device states and widget.
   * @returns {Promise<void>}
   */
  async function notifyChange() {
    await publishStates();
    try {
      gladys.requestWidgetRefresh(WIDGET_KEY);
    } catch (error) {
      logger.debug(`Widget refresh not requested: ${error.message}`);
    }
  }

  /**
   * @description Persist a new ledger, then make it the current one.
   * @param {object} next - The new ledger.
   * @returns {Promise<void>}
   */
  async function commit(next) {
    await gladys.setConfig({ [LEDGER_CONFIG_KEY]: serializeLedger(next) });
    ledger = next;
    await notifyChange();
  }

  return {
    /**
     * @description Load the stored ledger (once connected).
     * @returns {Promise<void>}
     */
    load() {
      return enqueue(async () => {
        const config = await gladys.getConfig();
        ledger = parseLedger(config[LEDGER_CONFIG_KEY]);
        logger.info(
          `Stock loaded: ${getStats().stock} bag(s), ${ledger.movements.length} movement(s)`,
        );
      });
    },

    /**
     * @description Record a movement.
     * @param {{type: string, bags: unknown}} movement - The movement.
     * @returns {Promise<object>} The recorded movement.
     */
    record(movement) {
      return enqueue(async () => {
        const next = recordMovement(ledger, movement, now());
        await commit(next);
        return next.movements[next.movements.length - 1];
      });
    },

    /**
     * @description Undo the last movement.
     * @returns {Promise<object>} The removed movement.
     */
    undo() {
      return enqueue(async () => {
        const { ledger: next, movement } = undoLastMovement(ledger);
        await commit(next);
        return movement;
      });
    },

    /**
     * @description Wait for the queued operations (the initial load included),
     * so a read never sees a stock about to change.
     * @returns {Promise<void>}
     */
    settled: () => queue,

    getLedger: () => ledger,
    getStats,
    publishStates,
    notifyChange,
  };
}

export { createStockStore };
