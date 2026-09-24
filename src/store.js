// -----------------------------------------------------------------------------
// The stock store: the in-memory ledger, its persistence, and what follows a
// change (device states, widget nudge).
//
// Every movement goes through ONE queue: two taps on "−1 bag" from two
// dashboards must never both read the same stock and lose a bag. A movement
// is applied in memory only once setConfig() succeeded, so a failed write
// leaves the stock as the user last saw it — and the error reaches the toast.
// -----------------------------------------------------------------------------

import { DEVICE_ID, LEDGER_CONFIG_KEY, WIDGET_KEY } from './constants.js';
import { buildStates, deviceExternalId } from './device.js';
import {
  computeStats,
  createLedger,
  parseLedger,
  recordMovement,
  serializeLedger,
  undoLastMovement,
} from './ledger.js';
import { buildSceneEventData, buildSceneOutputs, detectSceneTriggers } from './scene.js';

/**
 * @description Create the store of one stock.
 * @param {object} params - The dependencies.
 * @param {object} params.gladys - The GladysIntegration instance.
 * @param {object} params.logger - The logger.
 * @param {Function} params.getConfig - Returns the normalized config.
 * @param {Function} [params.now] - Clock, injectable for the tests.
 * @param {string} [params.stockId] - The stock id (its device), the default one when omitted.
 * @param {string} [params.ledgerKey] - The config key of its ledger.
 * @returns {object} The store.
 * @example
 * const store = createStockStore({ gladys, logger, getConfig: () => config });
 */
function createStockStore({
  gladys,
  logger,
  getConfig,
  now = () => new Date(),
  stockId = DEVICE_ID,
  ledgerKey = LEDGER_CONFIG_KEY,
}) {
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
    const states = buildStates(gladys, getStats(), stockId).filter(
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
   * @description Fire the scene triggers of a change. A trigger that cannot
   * be published (an older Gladys, the rate limit) never fails the movement.
   * @param {object} change - The detectSceneTriggers() params, minus the threshold.
   * @returns {Promise<void>}
   */
  async function fireSceneTriggers(change) {
    const config = getConfig();
    const triggers = detectSceneTriggers({
      ...change,
      lowStockThreshold: config.lowStockThreshold,
    });
    if (triggers.length === 0) {
      return;
    }
    const data = buildSceneEventData(
      deviceExternalId(gladys, stockId),
      buildSceneOutputs(getStats(), config, now()),
      change.recorded,
    );
    await Promise.all(
      triggers.map((key) =>
        gladys
          .publishSceneEvent(key, data)
          .catch((error) => logger.debug(`Scene trigger ${key} not fired: ${error.message}`)),
      ),
    );
  }

  /**
   * @description Persist a new ledger, make it the current one, and tell
   * Gladys: device states, widget, scene triggers.
   * @param {object} next - The new ledger.
   * @param {object} [options] - About the change.
   * @param {object} [options.recorded] - The movement recorded (none for an undo).
   * @param {boolean} [options.fromScene] - Whether a scene action made the change.
   * @returns {Promise<void>}
   */
  async function commit(next, { recorded, fromScene } = {}) {
    const before = getStats().stock;
    await gladys.setConfig({ [ledgerKey]: serializeLedger(next) });
    ledger = next;
    await notifyChange();
    await fireSceneTriggers({ before, after: getStats().stock, recorded, fromScene });
  }

  return {
    /**
     * @description Load the stored ledger (once connected).
     * @returns {Promise<void>}
     */
    load() {
      return enqueue(async () => {
        const config = await gladys.getConfig();
        ledger = parseLedger(config[ledgerKey]);
        logger.info(
          `Stock "${stockId}" loaded: ${getStats().stock} bag(s), ${ledger.movements.length} movement(s)`,
        );
      });
    },

    /**
     * @description Record a movement.
     * @param {{type: string, bags: unknown}} movement - The movement.
     * @param {object} [options] - Options.
     * @param {boolean} [options.fromScene] - Made by a scene action (see src/scene.js).
     * @returns {Promise<object>} The recorded movement.
     */
    record(movement, { fromScene = false } = {}) {
      return enqueue(async () => {
        const next = recordMovement(ledger, movement, now());
        const recorded = next.movements[next.movements.length - 1];
        await commit(next, { recorded, fromScene });
        return recorded;
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
