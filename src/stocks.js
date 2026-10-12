// -----------------------------------------------------------------------------
// The stocks: the default one, and one per house.
//
// Each stock is a store of its own (ledger, queue, device states) and a
// device offered on the Discovery screen, where the user puts it in a room.
// The widget, the actions and the scene action pick a stock through a
// `source: "devices"` select, i.e. by the external id of its device; no
// choice means the default stock, so a single-house setup never picks.
//
// A stock is attached to a house of Gladys (`source: "houses"`, by selector),
// at most one stock of each type per house. Its name is the name of that
// house, read with getHouses() (`location: true`): Gladys owns it, a renamed
// house follows on the next read. A stock may also have settings of its own,
// over those of the Configuration screen (see src/config.js).
//
// The default stock keeps the keys of the single-stock versions (ledger key,
// device id): upgrading changes nothing for an existing installation. A stock
// added before the houses keeps its random id and its name until it is
// attached to a house; attaching it never changes its device nor its ledger.
//
// Nothing is written before the stored ledgers were read: a movement recorded
// on the empty in-memory ledger would be saved OVER the real one and erase the
// whole history. Commands may arrive as soon as the SDK is connected, while
// the load is still on its way (or after it failed): callers await `ready()`,
// which loads (again) if needed, and every write refuses an unloaded stock.
// -----------------------------------------------------------------------------

import { randomBytes } from 'node:crypto';
import {
  deviceLanguage,
  parseStockSettings,
  readStockSettings,
  withStockSettings,
} from './config.js';
import {
  DEVICE_ID,
  LEDGER_CONFIG_KEY,
  LIMITS,
  STOCK_TYPES,
  STOCKS_CONFIG_KEY,
  SILO_WIDGET_KEY,
  WIDGET_KEY,
} from './constants.js';
import { buildDevice, deviceExternalId } from './device.js';
import { StockError } from './ledger.js';
import { createStockStore } from './store.js';

// The random ids: of a stock added before the houses, of a ledger key.
const RANDOM_ID_REGEX = /^[a-f0-9]{8}$/;
// A house selector, as Gladys builds it (a slug of the name). Kept loose:
// the core already checked the house exists when the user picked it.
const HOUSE_REGEX = /^[a-z0-9][a-z0-9_-]{0,99}$/;

/**
 * @description The config key of a stock's ledger: its own key for a stock
 * added for a house (a selector is not a valid config key), else derived from
 * its id, as in the versions before the houses.
 * @param {{id: string, ledger?: string}} stock - The stock.
 * @returns {string} The config key.
 * @example
 * ledgerKeyOf({ id: 'a1b2c3d4' }); // -> 'stock_ledger_a1b2c3d4'
 */
function ledgerKeyOf({ id, ledger }) {
  if (ledger) {
    return `${LEDGER_CONFIG_KEY}_${ledger}`;
  }
  return id === DEVICE_ID ? LEDGER_CONFIG_KEY : `${LEDGER_CONFIG_KEY}_${id}`;
}

/**
 * @description Read a house selector picked by the user.
 * @param {unknown} raw - The raw value.
 * @returns {string} The selector.
 * @throws {StockError} When no house was picked.
 * @example
 * readHouse('chalet'); // -> 'chalet'
 */
function readHouse(raw) {
  if (typeof raw !== 'string' || !HOUSE_REGEX.test(raw)) {
    throw new StockError('invalid_house');
  }
  return raw;
}

/**
 * @description Read the type of a stock picked by the user.
 * @param {unknown} raw - The raw value; none means bags.
 * @returns {string} One of STOCK_TYPES.
 * @throws {StockError} When it is not a type of stock.
 * @example
 * readStockType('bulk'); // -> 'bulk'
 */
function readStockType(raw) {
  if (raw === undefined || raw === null || raw === '') {
    return STOCK_TYPES.BAGS;
  }
  if (!Object.values(STOCK_TYPES).includes(raw)) {
    throw new StockError('invalid_stock_type');
  }
  return raw;
}

/**
 * @description Read one stored stock.
 * @param {unknown} raw - The stored entry.
 * @returns {object|null} The stock, or null when malformed.
 */
function parseStock(raw) {
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  const { id, house, name, ledger } = raw;
  const type = raw.type === undefined ? STOCK_TYPES.BAGS : raw.type;
  if (typeof id !== 'string' || id.length === 0 || id.length > 120) {
    return null;
  }
  if (!Object.values(STOCK_TYPES).includes(type)) {
    return null;
  }
  // The main stock is the one of the bag versions: always bags.
  if (id === DEVICE_ID && type !== STOCK_TYPES.BAGS) {
    return null;
  }
  if (house !== undefined && house !== null && !HOUSE_REGEX.test(house)) {
    return null;
  }
  if (ledger !== undefined && !RANDOM_ID_REGEX.test(ledger)) {
    return null;
  }
  const hasName =
    typeof name === 'string' &&
    name.length >= LIMITS.stockName.min &&
    name.length <= LIMITS.stockName.max;
  if (name !== undefined && !hasName) {
    return null;
  }
  const isLegacy = RANDOM_ID_REGEX.test(id);
  // An added stock is known by its house, or by the name it was given
  // before the houses; a stock for a house always has its own ledger key.
  if (id !== DEVICE_ID && !house && !(isLegacy && hasName)) {
    return null;
  }
  if (id !== DEVICE_ID && !isLegacy && !ledger) {
    return null;
  }
  const stock = {
    id,
    type,
    house: house || null,
    settings: parseStockSettings(raw.settings, type),
  };
  if (hasName) {
    stock.name = name;
  }
  if (ledger) {
    stock.ledger = ledger;
  }
  return stock;
}

/**
 * @description Read the stored list of stocks, dropping any malformed or
 * duplicated entry (same id, or a second stock of a type in a house). The
 * main stock is always first, listed or not.
 * @param {unknown} raw - The stored value (a JSON string, or an array).
 * @returns {Array<object>} The stocks: `{ id, type, house, settings, name?, ledger? }`.
 * @example
 * parseStocks('[{"id":"chalet:bags","house":"chalet","ledger":"a1b2c3d4"}]');
 */
function parseStocks(raw) {
  let value = raw;
  if (typeof raw === 'string') {
    try {
      value = JSON.parse(raw);
    } catch {
      value = [];
    }
  }
  const entries = Array.isArray(value) ? value.map(parseStock).filter(Boolean) : [];
  const main = entries.find((stock) => stock.id === DEVICE_ID) || {
    id: DEVICE_ID,
    type: STOCK_TYPES.BAGS,
    house: null,
    settings: {},
  };
  const stocks = [main];
  entries.forEach((stock) => {
    const taken = stocks.some(
      (other) =>
        other.id === stock.id ||
        (stock.ledger && other.ledger === stock.ledger) ||
        (stock.house && other.house === stock.house && other.type === stock.type),
    );
    if (!taken) {
      stocks.push(stock);
    }
  });
  return stocks;
}

/**
 * @description The stored form of the stocks: the main one only when it has
 * a house or settings of its own, empty fields left out.
 * @param {Array<object>} stocks - The stocks, the main one first.
 * @returns {string} The JSON string.
 */
function serializeStocks(stocks) {
  const listed = stocks.filter(
    (stock) => stock.id !== DEVICE_ID || stock.house || Object.keys(stock.settings).length > 0,
  );
  return JSON.stringify(
    listed.map(({ id, type, house, name, ledger, settings }) => ({
      id,
      type,
      ...(house && { house }),
      ...(name && { name }),
      ...(ledger && { ledger }),
      ...(Object.keys(settings).length > 0 && { settings }),
    })),
  );
}

/**
 * @description Create the stocks.
 * @param {object} params - The dependencies.
 * @param {object} params.gladys - The GladysIntegration instance.
 * @param {object} params.logger - The logger.
 * @param {Function} params.getConfig - Returns the normalized config (the defaults of every stock).
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
  let stocks = parseStocks(undefined);
  const stores = new Map();
  // The names of the houses, by selector, from the last getHouses().
  let houseNames = new Map();
  // Adding and removing stocks go through one queue, like the movements of
  // a stock: two quick adds must not both write the list and lose one.
  let queue = Promise.resolve();
  let loaded = false;
  // The load in progress, shared by every caller waiting for it.
  let loading = null;

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
   * @description The effective config of a stock, read at every use: its
   * settings and the defaults may change at any time.
   * @param {string} stockId - The stock id.
   * @returns {object} The effective config.
   */
  function configOf(stockId) {
    const stock = stocks.find((other) => other.id === stockId);
    return stock
      ? withStockSettings(getConfig(), stock.settings, stock.type)
      : withStockSettings(getConfig());
  }

  /**
   * @description Create the store of a stock.
   * @param {object} stock - The stock.
   * @returns {object} The store.
   */
  function createStore(stock) {
    const store = createStockStore({
      gladys,
      logger,
      getConfig: () => configOf(stock.id),
      now,
      stockId: stock.id,
      ledgerKey: ledgerKeyOf(stock),
      type: stock.type,
    });
    stores.set(stock.id, store);
    return store;
  }

  createStore(stocks[0]);

  /**
   * @description The name shown for a stock: its house, or the name it was
   * given before the houses; none for the main stock without a house.
   * @param {object} stock - The stock.
   * @returns {string|null} The name.
   */
  function nameOf(stock) {
    if (stock.house) {
      // The selector until the names are read (or without `location`).
      return houseNames.get(stock.house) || stock.house;
    }
    return stock.name || null;
  }

  /**
   * @description Every stock, the default one first, with its shown name.
   * @returns {Array<{id: string, type: string, house: string|null, name: string|null, settings: object}>} The stocks.
   */
  function list() {
    return stocks.map(({ id, type, house, settings, ...rest }) => ({
      id,
      type,
      house,
      name: nameOf({ house, ...rest }),
      settings,
    }));
  }

  /**
   * @description Find a stock by the external id of its device.
   * @param {string} [externalId] - The device external id; none means the default stock.
   * @returns {object|null} The stock (see list()), or null when unknown.
   */
  function find(externalId) {
    if (!externalId) {
      return list()[0];
    }
    return list().find((stock) => deviceExternalId(gladys, stock.id) === externalId) || null;
  }

  /**
   * @description Find a stock picked by the user, or refuse.
   * @param {string} [externalId] - The device external id; none means the default stock.
   * @returns {object} The stored stock.
   * @throws {StockError} When the stock no longer exists.
   */
  function stockOf(externalId) {
    const found = find(externalId);
    if (!found) {
      throw new StockError('unknown_stock');
    }
    return stocks.find((stock) => stock.id === found.id);
  }

  /**
   * @description Refuse a second stock of a type in a house.
   * @param {string} house - The house selector.
   * @param {string} type - The stock type.
   * @param {string} [exceptId] - The stock being attached, which may already be there.
   * @throws {StockError} When the house already has one.
   */
  function assertHouseFree(house, type, exceptId) {
    if (
      stocks.some((stock) => stock.id !== exceptId && stock.house === house && stock.type === type)
    ) {
      throw new StockError('house_taken', { name: houseNames.get(house) || house });
    }
  }

  /**
   * @description Persist the list of stocks, then make it the current one.
   * @param {Array<object>} next - The new list, the main stock first.
   * @returns {Promise<void>}
   */
  async function saveStocks(next) {
    await gladys.setConfig({ [STOCKS_CONFIG_KEY]: serializeStocks(next) });
    stocks = next;
    refreshWidgets();
  }

  /**
   * @description Ask Gladys to refetch both widgets: a stock added, removed or
   * renamed changes what either of them shows (a first silo replaces the
   * "No silo yet" of the silo widget).
   */
  function refreshWidgets() {
    for (const key of [WIDGET_KEY, SILO_WIDGET_KEY]) {
      try {
        gladys.requestWidgetRefresh(key);
      } catch (error) {
        logger.debug(`Widget refresh not requested: ${error.message}`);
      }
    }
  }

  /**
   * @description Refuse a write while the stored ledgers are not read.
   * @throws {StockError} When the stocks are not loaded.
   */
  function assertLoaded() {
    if (!loaded) {
      throw new StockError('stock_unavailable');
    }
  }

  /**
   * @description Load the stocks and every ledger, once: later calls resolve
   * at once, and a failed load is retried by the next call.
   * @returns {Promise<void>}
   */
  function load() {
    if (loaded) {
      return Promise.resolve();
    }
    if (!loading) {
      loading = enqueue(async () => {
        const config = await gladys.getConfig();
        stocks = parseStocks(config[STOCKS_CONFIG_KEY]);
        stocks.slice(1).forEach(createStore);
        await Promise.all([...stores.values()].map((store) => store.load()));
        loaded = true;
      }).finally(() => {
        loading = null;
      });
    }
    return loading;
  }

  return {
    load,

    /**
     * @description Wait for the stocks to be loaded, loading them if needed.
     * A failed load is logged and refused with a message for the user.
     * @returns {Promise<void>}
     * @throws {StockError} When the stored ledgers cannot be read.
     */
    async ready() {
      try {
        await load();
      } catch (error) {
        logger.error('Could not load the pellet stock', error);
        throw new StockError('stock_unavailable');
      }
    },

    /**
     * @description Read the names of the houses again. A failure keeps the
     * names known so far: a stock is then shown by its house selector.
     * @returns {Promise<boolean>} Whether a name changed.
     */
    async refreshHouses() {
      let houses;
      try {
        houses = await gladys.getHouses();
      } catch (error) {
        logger.debug(`Houses not read: ${error.message}`);
        return false;
      }
      const next = new Map(
        (Array.isArray(houses) ? houses : [])
          .filter((house) => house && typeof house.selector === 'string')
          .map((house) => [
            house.selector,
            typeof house.name === 'string' ? house.name : house.selector,
          ]),
      );
      const changed =
        next.size !== houseNames.size ||
        [...next].some(([selector, name]) => houseNames.get(selector) !== name);
      houseNames = next;
      return changed;
    },

    isLoaded: () => loaded,
    list,
    find,

    /**
     * @description The external id of a stock's device, to reach it like a user would.
     * @param {string} stockId - The stock id.
     * @returns {string} The device external id.
     */
    externalIdOf: (stockId) => deviceExternalId(gladys, stockId),

    /**
     * @description The store of a stock picked by the user.
     * @param {string} [externalId] - The device external id; none means the default stock.
     * @param {string} [type] - The type the operation needs: bags are not
     *   counted in a silo, nor kg in a stock of bags.
     * @returns {object} The store.
     * @throws {StockError} When the stocks are not loaded, the stock no longer
     *   exists, or is not of that type.
     */
    storeOf(externalId, type) {
      assertLoaded();
      const stock = stockOf(externalId);
      if (type && stock.type !== type) {
        throw new StockError(stock.type === STOCK_TYPES.BULK ? 'stock_is_silo' : 'stock_is_bags');
      }
      return stores.get(stock.id);
    },

    /**
     * @description The effective config of a stock picked by the user.
     * @param {string} [externalId] - The device external id; none means the default stock.
     * @returns {object} The config, shaped like normalizeConfig()'s.
     * @throws {StockError} When the stock no longer exists.
     */
    configOf(externalId) {
      return configOf(stockOf(externalId).id);
    },

    /**
     * @description Add a stock for a house.
     * @param {unknown} rawHouse - The house selector picked by the user.
     * @param {unknown} [rawType] - The stock type picked by the user; none means bags.
     * @returns {Promise<object>} The new stock (see list()).
     */
    add(rawHouse, rawType) {
      return enqueue(async () => {
        // Before the load, the list in memory is empty: saving it would
        // drop every added stock.
        assertLoaded();
        const house = readHouse(rawHouse);
        const type = readStockType(rawType);
        if (stocks.length - 1 >= LIMITS.extraStocks.max) {
          throw new StockError('too_many_stocks', { max: LIMITS.extraStocks.max + 1 });
        }
        assertHouseFree(house, type);
        let id = `${house}:${type}`;
        // Taken by a stock since attached to another house: the device of
        // that one keeps its id.
        while (stores.has(id)) {
          id = `${house}:${type}:${newId()}`;
        }
        let ledger = newId();
        while (stocks.some((stock) => stock.ledger === ledger)) {
          ledger = newId();
        }
        const stock = { id, type, house, ledger, settings: {} };
        await saveStocks([...stocks, stock]);
        createStore(stock);
        return find(deviceExternalId(gladys, id));
      });
    },

    /**
     * @description Attach a stock to a house: the main one, or one added
     * before the houses. Its device and its ledger stay as they are.
     * @param {string} [externalId] - The device external id; none means the default stock.
     * @param {unknown} rawHouse - The house selector picked by the user.
     * @returns {Promise<object>} The stock (see list()).
     */
    attach(externalId, rawHouse) {
      return enqueue(async () => {
        assertLoaded();
        const stock = stockOf(externalId);
        const house = readHouse(rawHouse);
        assertHouseFree(house, stock.type, stock.id);
        await saveStocks(
          stocks.map((other) => (other.id === stock.id ? { ...other, house } : other)),
        );
        await stores.get(stock.id).notifyChange();
        return find(deviceExternalId(gladys, stock.id));
      });
    },

    /**
     * @description Set the settings of a stock: a field left empty keeps the
     * current value, `reset` drops every setting of its own first.
     * @param {string} [externalId] - The device external id; none means the default stock.
     * @param {object} fields - The action fields, keyed like the config_schema.
     * @param {boolean} [reset] - Back to the defaults before applying the fields.
     * @returns {Promise<{stock: object, config: object}>} The stock and its effective config.
     */
    configure(externalId, fields, reset = false) {
      return enqueue(async () => {
        assertLoaded();
        const stock = stockOf(externalId);
        const settings = {
          ...(reset ? {} : stock.settings),
          ...readStockSettings(fields, stock.type),
        };
        await saveStocks(
          stocks.map((other) => (other.id === stock.id ? { ...other, settings } : other)),
        );
        // The threshold and the window change the autonomy and the colors.
        await stores.get(stock.id).notifyChange();
        return { stock: find(deviceExternalId(gladys, stock.id)), config: configOf(stock.id) };
      });
    },

    /**
     * @description Remove an added stock and its history. The default stock stays.
     * @param {string} [externalId] - The device external id.
     * @returns {Promise<object>} The removed stock (see list()).
     */
    remove(externalId) {
      return enqueue(async () => {
        assertLoaded();
        const stock = stockOf(externalId);
        if (stock.id === DEVICE_ID) {
          throw new StockError('default_stock_kept');
        }
        const removed = find(deviceExternalId(gladys, stock.id));
        // Refuse any new movement on it, and let those already running land
        // first: none can write its ledger back after it is cleared below.
        const store = stores.get(stock.id);
        store.close();
        await store.settled();
        try {
          await saveStocks(stocks.filter((other) => other.id !== stock.id));
        } catch (error) {
          // Not removed after all: the stock keeps working.
          store.reopen();
          throw error;
        }
        stores.delete(stock.id);
        try {
          await gladys.setConfig({ [ledgerKeyOf(stock)]: '' });
        } catch (error) {
          // Harmless: an orphan ledger is never read again.
          logger.debug(`Ledger of the removed stock not cleared: ${error.message}`);
        }
        return removed;
      });
    },

    /**
     * @description The devices of every stock, for the Discovery screen.
     * @param {string} [language] - Language of the default names, the
     *   configured one (or the last one seen) when omitted.
     * @returns {Array<object>} The discovered devices.
     */
    devices(language = deviceLanguage(getConfig())) {
      return list().map((stock) => buildDevice(gladys, language, stock));
    },

    /**
     * @description Publish the device states of every stock. Nothing before
     * the load: an empty ledger would publish a stock of 0 and fire the
     * scenes on the device value.
     * @param {object} [options] - Passed to each store.
     * @returns {Promise<void>}
     */
    async publishStates(options) {
      if (!loaded) {
        return;
      }
      await Promise.all([...stores.values()].map((store) => store.publishStates(options)));
    },

    /**
     * @description Ask Gladys to refetch both widgets.
     */
    refreshWidgets,

    /**
     * @description Tell Gladys every stock may have changed (config updated).
     * Nothing before the load, as for publishStates().
     * @returns {Promise<void>}
     */
    async notifyChange() {
      if (!loaded) {
        return;
      }
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

export { createStocks, ledgerKeyOf, parseStocks, readHouse, readStockType };
