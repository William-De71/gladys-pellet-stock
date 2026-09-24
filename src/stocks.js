// -----------------------------------------------------------------------------
// The stocks: the default one, and those added for other houses.
//
// Each stock is a store of its own (ledger, queue, device states) and a
// device offered on the Discovery screen, where the user puts it in a room.
// The widget, the actions and the scene action pick a stock through a
// `source: "devices"` select, i.e. by the external id of its device; no
// choice means the default stock, so a single-house setup never picks.
//
// The default stock keeps the keys of the single-stock versions (ledger key,
// device id): upgrading changes nothing for an existing installation.
// -----------------------------------------------------------------------------

import { randomBytes } from 'node:crypto';
import {
  DEVICE_ID,
  LEDGER_CONFIG_KEY,
  LIMITS,
  STOCKS_CONFIG_KEY,
  WIDGET_KEY,
} from './constants.js';
import { buildDevice, deviceExternalId } from './device.js';
import { StockError } from './ledger.js';
import { createStockStore } from './store.js';

const STOCK_ID_REGEX = /^[a-f0-9]{8}$/;

/**
 * @description The config key of a stock's ledger.
 * @param {string} stockId - The stock id.
 * @returns {string} The config key.
 * @example
 * ledgerKeyOf('a1b2c3d4'); // -> 'stock_ledger_a1b2c3d4'
 */
function ledgerKeyOf(stockId) {
  return stockId === DEVICE_ID ? LEDGER_CONFIG_KEY : `${LEDGER_CONFIG_KEY}_${stockId}`;
}

/**
 * @description Read the stored list of added stocks, dropping any malformed
 * or duplicated entry.
 * @param {unknown} raw - The stored value (a JSON string, or an array).
 * @returns {Array<{id: string, name: string}>} The added stocks.
 * @example
 * parseStocks('[{"id":"a1b2c3d4","name":"Chalet"}]');
 */
function parseStocks(raw) {
  let value = raw;
  if (typeof raw === 'string') {
    try {
      value = JSON.parse(raw);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(value)) {
    return [];
  }
  const seen = new Set();
  return value.filter((stock) => {
    const valid =
      stock &&
      STOCK_ID_REGEX.test(stock.id) &&
      typeof stock.name === 'string' &&
      stock.name.length >= LIMITS.stockName.min &&
      stock.name.length <= LIMITS.stockName.max &&
      !seen.has(stock.id);
    if (valid) {
      seen.add(stock.id);
    }
    return valid;
  });
}

/**
 * @description Read a stock name typed by the user.
 * @param {unknown} raw - The raw value.
 * @returns {string} The trimmed name.
 * @throws {StockError} When it is empty or too long.
 * @example
 * readStockName('  Chalet '); // -> 'Chalet'
 */
function readStockName(raw) {
  const name = typeof raw === 'string' ? raw.trim() : '';
  if (name.length < LIMITS.stockName.min || name.length > LIMITS.stockName.max) {
    throw new StockError('invalid_stock_name', { max: LIMITS.stockName.max });
  }
  return name;
}

/**
 * @description Create the stocks.
 * @param {object} params - The dependencies.
 * @param {object} params.gladys - The GladysIntegration instance.
 * @param {object} params.logger - The logger.
 * @param {Function} params.getConfig - Returns the normalized config.
 * @param {Function} [params.now] - Clock, injectable for the tests.
 * @param {Function} [params.newId] - Id generator, injectable for the tests.
 * @returns {object} The stocks.
 * @example
 * const stocks = createStocks({ gladys, logger, getConfig: () => config });
 */
function createStocks({
  gladys,
  logger,
  getConfig,
  now = () => new Date(),
  newId = () => randomBytes(4).toString('hex'),
}) {
  let extras = [];
  const stores = new Map();
  // Adding and removing stocks go through one queue, like the movements of
  // a stock: two quick adds must not both write the list and lose one.
  let queue = Promise.resolve();

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
   * @description Create the store of a stock.
   * @param {string} stockId - The stock id.
   * @returns {object} The store.
   */
  function createStore(stockId) {
    const store = createStockStore({
      gladys,
      logger,
      getConfig,
      now,
      stockId,
      ledgerKey: ledgerKeyOf(stockId),
    });
    stores.set(stockId, store);
    return store;
  }

  createStore(DEVICE_ID);

  /**
   * @description Every stock, the default one first.
   * @returns {Array<{id: string, name: string|null}>} The stocks.
   */
  function list() {
    return [{ id: DEVICE_ID, name: null }, ...extras];
  }

  /**
   * @description Find a stock by the external id of its device.
   * @param {string} [externalId] - The device external id; none means the default stock.
   * @returns {{id: string, name: string|null}|null} The stock, or null when unknown.
   */
  function find(externalId) {
    if (!externalId) {
      return list()[0];
    }
    return list().find((stock) => deviceExternalId(gladys, stock.id) === externalId) || null;
  }

  /**
   * @description Persist the list of added stocks, then make it the current one.
   * @param {Array<{id: string, name: string}>} next - The new list.
   * @returns {Promise<void>}
   */
  async function saveExtras(next) {
    await gladys.setConfig({ [STOCKS_CONFIG_KEY]: JSON.stringify(next) });
    extras = next;
    try {
      gladys.requestWidgetRefresh(WIDGET_KEY);
    } catch (error) {
      logger.debug(`Widget refresh not requested: ${error.message}`);
    }
  }

  return {
    /**
     * @description Load the added stocks and every ledger (once connected).
     * @returns {Promise<void>}
     */
    load() {
      return enqueue(async () => {
        const config = await gladys.getConfig();
        extras = parseStocks(config[STOCKS_CONFIG_KEY]);
        extras.forEach((stock) => createStore(stock.id));
        await Promise.all([...stores.values()].map((store) => store.load()));
      });
    },

    list,
    find,

    /**
     * @description The store of a stock picked by the user.
     * @param {string} [externalId] - The device external id; none means the default stock.
     * @returns {object} The store.
     * @throws {StockError} When the stock no longer exists.
     */
    storeOf(externalId) {
      const stock = find(externalId);
      if (!stock) {
        throw new StockError('unknown_stock');
      }
      return stores.get(stock.id);
    },

    /**
     * @description Add a stock, for another house.
     * @param {unknown} rawName - The name typed by the user.
     * @returns {Promise<{id: string, name: string}>} The new stock.
     */
    add(rawName) {
      return enqueue(async () => {
        const name = readStockName(rawName);
        if (extras.length >= LIMITS.extraStocks.max) {
          throw new StockError('too_many_stocks', { max: LIMITS.extraStocks.max + 1 });
        }
        if (extras.some((stock) => stock.name.toLowerCase() === name.toLowerCase())) {
          throw new StockError('stock_name_taken', { name });
        }
        let id = newId();
        while (stores.has(id)) {
          id = newId();
        }
        const stock = { id, name };
        await saveExtras([...extras, stock]);
        createStore(id);
        return stock;
      });
    },

    /**
     * @description Remove an added stock and its history. The default stock stays.
     * @param {string} [externalId] - The device external id.
     * @returns {Promise<{id: string, name: string}>} The removed stock.
     */
    remove(externalId) {
      return enqueue(async () => {
        const stock = find(externalId);
        if (!stock) {
          throw new StockError('unknown_stock');
        }
        if (stock.id === DEVICE_ID) {
          throw new StockError('default_stock_kept');
        }
        // Let the movements already queued on it land first.
        await stores.get(stock.id).settled();
        await saveExtras(extras.filter((other) => other.id !== stock.id));
        stores.delete(stock.id);
        try {
          await gladys.setConfig({ [ledgerKeyOf(stock.id)]: '' });
        } catch (error) {
          // Harmless: an orphan ledger is never read again.
          logger.debug(`Ledger of the removed stock not cleared: ${error.message}`);
        }
        return stock;
      });
    },

    /**
     * @description The devices of every stock, for the Discovery screen.
     * @param {string} [language] - Language of the default names.
     * @returns {Array<object>} The discovered devices.
     */
    devices(language) {
      return list().map((stock) => buildDevice(gladys, language, stock));
    },

    /**
     * @description Publish the device states of every stock.
     * @param {object} [options] - Passed to each store.
     * @returns {Promise<void>}
     */
    async publishStates(options) {
      await Promise.all([...stores.values()].map((store) => store.publishStates(options)));
    },

    /**
     * @description Tell Gladys every stock may have changed (config updated).
     * @returns {Promise<void>}
     */
    async notifyChange() {
      await Promise.all([...stores.values()].map((store) => store.notifyChange()));
    },

    /**
     * @description Wait for the queued operations (the initial load included).
     * @returns {Promise<void>}
     */
    async settled() {
      await queue;
      await Promise.all([...stores.values()].map((store) => store.settled()));
    },
  };
}

export { createStocks, ledgerKeyOf, parseStocks, readStockName };
