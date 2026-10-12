// -----------------------------------------------------------------------------
// The handlers of the integration: what Gladys asks, and what the user does.
//
// Every way in is registered here, on the SDK instance it is given — the
// manifest actions of the Configuration screen, the scene actions, the two
// widgets, the Discovery screen — so the tests drive them through a fake
// Gladys exactly as the core would. index.js keeps the connection and the
// lifecycle.
//
// A refused operation (not enough stock, wrong type of stock…) is not a
// failure of the integration: an action or a widget button RETURNS its
// translated explanation, a scene action throws it (the scene logs it and
// goes on).
// -----------------------------------------------------------------------------

import { settingsOf } from './config.js';
import { costOver, nextDay, parseDay, seasonStart } from './cost.js';
import {
  MOVEMENT_TYPES,
  SILO_ACTIONS,
  SILO_WIDGET_KEY,
  STOCK_TYPES,
  WIDGET_ACTIONS,
  WIDGET_KEY,
} from './constants.js';
import { LANGUAGES, message, translate } from './i18n.js';
import { StockError } from './ledger.js';
import { buildSceneOutputs } from './scene.js';
import { buildSiloContent, readLevel } from './silo-widget.js';
import { buildWidgetContent, buildUnknownStockContent, readSeasonMonth } from './widget.js';

/**
 * @description Register every handler of the integration.
 * @param {object} params - The dependencies.
 * @param {object} params.gladys - The GladysIntegration instance.
 * @param {object} params.stocks - The stocks (see src/stocks.js).
 * @param {Function} [params.now] - Clock, injectable for the tests.
 * @returns {{publishDevices: Function}} What the lifecycle needs too.
 * @example
 * const { publishDevices } = registerHandlers({ gladys, stocks });
 */
function registerHandlers({ gladys, stocks, now = () => new Date() }) {
  // The result message of each movement type.
  const RESULT_KEYS = {
    [MOVEMENT_TYPES.DELIVERY]: 'delivery_recorded',
    [MOVEMENT_TYPES.CONSUMPTION]: 'consumption_recorded',
    [MOVEMENT_TYPES.INVENTORY]: 'inventory_recorded',
  };
  // The same, for a silo (in kg).
  const SILO_RESULT_KEYS = {
    [MOVEMENT_TYPES.DELIVERY]: 'silo_delivery_recorded',
    [MOVEMENT_TYPES.INVENTORY]: 'silo_reading_recorded',
  };

  /**
   * @description Run a user operation and build the message shown to the user.
   * A refused operation (not enough stock, nothing to undo, unknown stock…) is
   * not a failure of the integration: its explanation is RETURNED, so the
   * manifest action shows it under the button and the widget shows it as a
   * toast, translated.
   * @param {Function} operation - Runs the operation, resolves the message.
   * @returns {Promise<{en: string, fr: string}>} The multi-language message.
   * @example
   * await runOperation(async () => message('undo_done'));
   */
  async function runOperation(operation) {
    try {
      return await operation();
    } catch (error) {
      if (error instanceof StockError) {
        return message(error.code, error.params);
      }
      throw error;
    }
  }

  /**
   * @description Record a movement of bags from a user action.
   * @param {string} [stock] - The external id of the stock's device; none means the default stock.
   * @param {string} type - The movement type.
   * @param {unknown} bags - The bag count.
   * @param {{price?: unknown, bagPrice?: unknown, bagWeight?: unknown, purchase?: boolean}} [details] -
   *   What a delivery was entered with (see recordMovement()).
   * @returns {Promise<{en: string, fr: string}>} The message shown to the user.
   * @example
   * await recordFromUser(undefined, MOVEMENT_TYPES.DELIVERY, 66, { price: 459.5 });
   */
  function recordFromUser(stock, type, bags, details = {}) {
    return runOperation(async () => {
      await stocks.ready();
      const store = stocks.storeOf(stock, STOCK_TYPES.BAGS);
      const movement = await store.record({ ...details, type, bags });
      return message(RESULT_KEYS[type], { bags: movement.bags, stock: store.getStats().stock });
    });
  }

  /**
   * @description Record a movement of a silo from a user action.
   * @param {string} [stock] - The external id of the silo's device.
   * @param {string} type - The movement type: a delivery, or a reading (inventory).
   * @param {Function} read - `(config) => ({ kg, price? })`, what the user entered.
   * @returns {Promise<{en: string, fr: string}>} The message shown to the user.
   * @example
   * await recordSiloFromUser(stock, MOVEMENT_TYPES.DELIVERY, () => ({ kg: 3000 }));
   */
  function recordSiloFromUser(stock, type, read) {
    return runOperation(async () => {
      await stocks.ready();
      const store = stocks.storeOf(stock, STOCK_TYPES.BULK);
      const { kg, price } = read(stocks.configOf(stock));
      const movement = await store.record({ type, bags: kg, price });
      return message(SILO_RESULT_KEYS[type], { kg: movement.bags, level: store.getStats().stock });
    });
  }

  /**
   * @description Undo the last movement of a stock.
   * @param {string} [stock] - The external id of the stock's device; none means the default stock.
   * @returns {Promise<{en: string, fr: string}>} The message shown to the user.
   * @example
   * await undoFromUser();
   */
  function undoFromUser(stock) {
    return runOperation(async () => {
      await stocks.ready();
      const store = stocks.storeOf(stock);
      await store.undo();
      const isSilo = stocks.find(stock).type === STOCK_TYPES.BULK;
      return message(isSilo ? 'silo_undo_done' : 'undo_done', { stock: store.getStats().stock });
    });
  }

  /**
   * @description Describe the effective settings of a stock, telling its own
   * from the defaults of the Configuration screen.
   * @param {object} stock - The stock (see stocks.list()).
   * @param {object} config - Its effective config.
   * @returns {{en: string, fr: string}} The message shown to the user.
   * @example
   * describeSettings(stock, stocks.configOf(externalId));
   */
  function describeSettings(stock, config) {
    return Object.fromEntries(
      LANGUAGES.map((language) => {
        const t = (key, params) => translate(language, key, params);
        const format = (value) => new Intl.NumberFormat(language).format(value);
        const parts = settingsOf(stock.type).map(({ key }) => {
          // Only a price or a capacity may be unset.
          let text;
          if (config[key] === null) {
            text = t(`setting_${key}_none`);
          } else if (key === 'bulkReadingUnit') {
            text = t(`setting_bulkReadingUnit_${config[key]}`);
          } else {
            text = t(`setting_${key}`, { value: format(config[key]) });
          }
          const origin = Object.hasOwn(stock.settings, key) ? 'setting_own' : 'setting_default';
          return `${text} (${t(origin)})`;
        });
        return [
          language,
          t('stock_configured', {
            name: stock.name || t('main_stock'),
            settings: parts.join(', '),
          }),
        ];
      }),
    );
  }

  /**
   * @description Describe the cost of the bags used over a period.
   * @param {Date} start - The first day.
   * @param {Date} lastDay - The last day (included).
   * @param {{bags: number, kg: number, cost: number, unpricedBags: number}} cost - See costOver().
   * @param {boolean} [isSilo] - A silo counts in kg: no bag count.
   * @returns {{en: string, fr: string}} The message shown to the user.
   * @example
   * describeCost(new Date(2026, 9, 1), new Date(2027, 5, 1), cost);
   */
  function describeCost(start, lastDay, cost, isSilo = false) {
    return Object.fromEntries(
      LANGUAGES.map((language) => {
        const t = (key, params) => translate(language, key, params);
        // Day first in every language, two digits, as the dates were typed.
        const day = (date) =>
          date.toLocaleDateString(language === 'en' ? 'en-GB' : language, {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
          });
        const euros = (value, digits) =>
          new Intl.NumberFormat(language, {
            style: 'currency',
            currency: 'EUR',
            minimumFractionDigits: digits,
            maximumFractionDigits: digits,
          }).format(value);
        const period = { start: day(start), end: day(lastDay) };
        if (cost.bags === 0) {
          return [language, t('cost_report_empty', period)];
        }
        const pricedKg = cost.kg * ((cost.bags - cost.unpricedBags) / cost.bags);
        let text = t(isSilo ? 'cost_report_silo' : 'cost_report', {
          ...period,
          bags: new Intl.NumberFormat(language).format(cost.bags),
          kg: new Intl.NumberFormat(language, { maximumFractionDigits: 0 }).format(cost.kg),
          cost: euros(cost.cost, 0),
          kg_price: pricedKg > 0 ? euros(cost.cost / pricedKg, 2) : '—',
        });
        if (cost.unpricedBags > 0) {
          text += ` ${t(isSilo ? 'cost_report_unpriced_silo' : 'cost_report_unpriced', {
            bags: cost.unpricedBags,
          })}`;
        }
        return [language, text];
      }),
    );
  }

  // --- Discovery: one virtual device per stock ------------------------------

  /**
   * @description Offer the device of every stock on the Discovery screen.
   * @returns {Promise<void>} Resolves once published.
   * @example
   * await publishDevices();
   */
  function publishDevices() {
    return gladys.publishDiscoveredDevices(stocks.devices());
  }

  gladys.onScanRequest(async () => {
    await stocks.refreshHouses();
    await publishDevices();
  });

  gladys.onDeviceCreated(async () => {
    // The device may be added long after the last movement: publish its
    // states now instead of waiting for the next change.
    await stocks.publishStates({ force: true });
  });

  gladys.onSetValue(async () => {
    throw new Error('The pellet stock features are read-only: use the widget or the actions.');
  });

  // --- Manifest actions (Configuration screen) -------------------------------

  gladys.onAction('set_stock', (fields) =>
    recordFromUser(fields.stock, MOVEMENT_TYPES.INVENTORY, fields.bags, {
      bagPrice: fields.bag_price,
    }),
  );
  gladys.onAction('add_delivery', (fields) =>
    recordFromUser(fields.stock, MOVEMENT_TYPES.DELIVERY, fields.bags, {
      price: fields.price,
      bagWeight: fields.bag_weight,
    }),
  );
  gladys.onAction('consume', (fields) =>
    recordFromUser(fields.stock, MOVEMENT_TYPES.CONSUMPTION, fields.bags),
  );
  gladys.onAction('undo', (fields) => undoFromUser(fields.stock));
  gladys.onAction('analyze_cost', (fields) =>
    runOperation(async () => {
      await stocks.ready();
      const store = stocks.storeOf(fields.stock);
      const start = parseDay(fields.start);
      const lastDay =
        typeof fields.end === 'string' && fields.end.trim() !== '' ? parseDay(fields.end) : now();
      if (!start || !lastDay) {
        throw new StockError('invalid_date');
      }
      if (lastDay.getTime() < start.getTime()) {
        throw new StockError('invalid_period');
      }
      const cost = costOver(
        store.getLedger().movements,
        start,
        nextDay(lastDay),
        stocks.configOf(fields.stock),
      );
      return describeCost(
        start,
        lastDay,
        cost,
        stocks.find(fields.stock).type === STOCK_TYPES.BULK,
      );
    }),
  );

  gladys.onAction('add_stock', (fields) =>
    runOperation(async () => {
      await stocks.ready();
      await stocks.refreshHouses();
      const stock = await stocks.add(fields.house, fields.type);
      await publishDevices();
      return message('stock_added', { name: stock.name });
    }),
  );
  gladys.onAction('attach_stock', (fields) =>
    runOperation(async () => {
      await stocks.ready();
      await stocks.refreshHouses();
      const stock = await stocks.attach(fields.stock, fields.house);
      return message('stock_attached', { name: stock.name });
    }),
  );
  gladys.onAction('configure_stock', (fields) =>
    runOperation(async () => {
      await stocks.ready();
      await stocks.refreshHouses();
      const { stock, config } = await stocks.configure(fields.stock, fields, fields.reset === true);
      return describeSettings(stock, config);
    }),
  );
  gladys.onAction('remove_stock', (fields) =>
    runOperation(async () => {
      await stocks.ready();
      const stock = await stocks.remove(fields.stock);
      await publishDevices();
      return message('stock_removed', { name: stock.name });
    }),
  );

  // --- Scene action ------------------------------------------------------------

  /**
   * @description Run a scene action on the stock it picked, and return the
   * stock figures to the next actions of the scene.
   * @param {object} fields - The fields of the scene action.
   * @param {Function} [operation] - `(store) => Promise`, the change to make; none only reads.
   * @param {string} [type] - The type of stock the change needs.
   * @returns {Promise<object>} The outputs (see src/scene.js).
   * @example
   * await runSceneAction(fields, (store) => store.undo());
   */
  async function runSceneAction(fields, operation, type) {
    let store;
    try {
      await stocks.ready();
      store = stocks.storeOf(fields.stock, type);
      if (operation) {
        await operation(store);
      }
    } catch (error) {
      // A scene action fails by throwing: the scene logs it and goes on.
      if (error instanceof StockError) {
        throw new Error(translate('en', error.code, error.params), { cause: error });
      }
      throw error;
    }
    await store.settled();
    // Which stock answered, and in what unit its figures are.
    const isSilo = stocks.find(fields.stock).type === STOCK_TYPES.BULK;
    return {
      ...buildSceneOutputs(store.getStats(), stocks.configOf(fields.stock), now()),
      type: isSilo ? STOCK_TYPES.BULK : STOCK_TYPES.BAGS,
      unit: isSilo ? 'kg' : 'bag',
    };
  }

  /**
   * @description The cost of the current heating season, for a scene.
   * @param {object} fields - The fields of the scene action (`stock`, `season_start`).
   * @returns {{season_cost: number, season_used: number, season_kg: number,
   *   season_unpriced: number}} The cost to the cent, the bags (kg for a
   *   silo) and kg used, and those without a known price.
   */
  function seasonOutputs(fields) {
    const store = stocks.storeOf(fields.stock);
    const season = costOver(
      store.getLedger().movements,
      seasonStart(now(), readSeasonMonth(fields)),
      null,
      stocks.configOf(fields.stock),
    );
    return {
      season_cost: Math.round(season.cost * 100) / 100,
      season_used: season.bags,
      season_kg: Math.round(season.kg * 10) / 10,
      season_unpriced: season.unpricedBags,
    };
  }

  gladys.onSceneAction('consume_bags', (fields) =>
    runSceneAction(
      fields,
      (store) =>
        store.record({ type: MOVEMENT_TYPES.CONSUMPTION, bags: fields.bags }, { fromScene: true }),
      STOCK_TYPES.BAGS,
    ),
  );
  gladys.onSceneAction('add_bags', (fields) =>
    runSceneAction(
      fields,
      (store) =>
        store.record(
          {
            type: MOVEMENT_TYPES.DELIVERY,
            bags: fields.bags,
            bagPrice: fields.bag_price,
            bagWeight: fields.bag_weight,
            // Bought on their own, unless the scene says it is a delivery.
            purchase: fields.delivery !== true,
          },
          { fromScene: true },
        ),
      STOCK_TYPES.BAGS,
    ),
  );
  gladys.onSceneAction('set_stock', (fields) =>
    runSceneAction(
      fields,
      (store) =>
        store.record({ type: MOVEMENT_TYPES.INVENTORY, bags: fields.bags }, { fromScene: true }),
      STOCK_TYPES.BAGS,
    ),
  );
  /**
   * @description Run a scene action on a silo: left without a stock, it takes
   * the only silo there is.
   * @param {object} fields - The fields of the scene action.
   * @param {Function} operation - `(store, fields) => Promise`, the change to make.
   * @returns {Promise<object>} The outputs (see src/scene.js).
   */
  async function runSiloSceneAction(fields, operation) {
    if (!fields.stock) {
      // A failed load is reported by runSceneAction(), which loads again.
      await stocks.ready().catch(() => {});
    }
    const siloFields = { ...fields, stock: fields.stock || siloOf({}).externalId };
    return runSceneAction(siloFields, (store) => operation(store, siloFields), STOCK_TYPES.BULK);
  }

  gladys.onSceneAction('silo_delivery', (fields) =>
    runSiloSceneAction(fields, (store) =>
      store.record(
        { type: MOVEMENT_TYPES.DELIVERY, bags: fields.kg, price: fields.price },
        { fromScene: true },
      ),
    ),
  );
  // A level sensor on the silo can feed it from a scene.
  gladys.onSceneAction('silo_reading', (fields) =>
    runSiloSceneAction(fields, (store, siloFields) =>
      store.record(
        {
          type: MOVEMENT_TYPES.INVENTORY,
          bags: readLevel(fields, stocks.configOf(siloFields.stock)),
        },
        { fromScene: true },
      ),
    ),
  );
  gladys.onSceneAction('read_stock', async (fields) => ({
    ...(await runSceneAction(fields)),
    ...seasonOutputs(fields),
  }));

  // --- Dashboard widget ----------------------------------------------------------

  gladys.onWidgetGet(WIDGET_KEY, async ({ settings = {}, language }) => {
    // Never an empty widget before the load: a failed one fails the request.
    await stocks.ready();
    await stocks.settled();
    const stock = stocks.find(settings.stock);
    if (!stock) {
      return buildUnknownStockContent(language);
    }
    if (stock.type === STOCK_TYPES.BULK) {
      return buildUnknownStockContent(language, 'widget_stock_is_silo');
    }
    const store = stocks.storeOf(settings.stock);
    return buildWidgetContent({
      ledger: store.getLedger(),
      stats: store.getStats(),
      config: stocks.configOf(settings.stock),
      settings,
      language,
      stockName: stock.name,
      now: now(),
    });
  });

  // `values` holds what the user typed in the form of the button, validated by
  // the core against the fields declared in the widget. It is absent on a
  // Gladys (or an SDK) without action forms: the bags declared in `params`
  // apply (one bag, or the pallet size).
  gladys.onWidgetAction(WIDGET_KEY, (actionKey, params, { settings = {}, values } = {}) => {
    const form = values || {};
    const bags = form.bags ?? params.bags;
    switch (actionKey) {
      case WIDGET_ACTIONS.CONSUME:
        return recordFromUser(settings.stock, MOVEMENT_TYPES.CONSUMPTION, bags);
      case WIDGET_ACTIONS.ADD_BAG:
        return recordFromUser(settings.stock, MOVEMENT_TYPES.DELIVERY, bags, {
          bagPrice: form.bag_price,
          purchase: true,
        });
      case WIDGET_ACTIONS.DELIVERY:
        return recordFromUser(settings.stock, MOVEMENT_TYPES.DELIVERY, bags, {
          price: form.price,
          bagWeight: form.bag_weight,
        });
      case WIDGET_ACTIONS.UNDO:
        return undoFromUser(settings.stock);
      default:
        throw new Error(`Unknown widget action: ${actionKey}`);
    }
  });

  /**
   * @description The silo a silo widget shows: the one picked in its settings,
   * else the only silo there is.
   * @param {object} settings - The widget instance settings.
   * @returns {{stock: object|null, externalId: string|undefined, problem: string|null}}
   *   The silo and the external id to reach it, or the message key of what is wrong.
   */
  function siloOf(settings) {
    if (settings.stock) {
      const stock = stocks.find(settings.stock);
      if (!stock) {
        return { stock: null, problem: 'widget_unknown_stock' };
      }
      if (stock.type !== STOCK_TYPES.BULK) {
        return { stock: null, problem: 'widget_stock_is_bags' };
      }
      return { stock, externalId: settings.stock, problem: null };
    }
    const silos = stocks.list().filter((stock) => stock.type === STOCK_TYPES.BULK);
    if (silos.length !== 1) {
      return { stock: null, problem: silos.length === 0 ? 'widget_no_silo' : 'widget_pick_silo' };
    }
    return { stock: silos[0], externalId: stocks.externalIdOf(silos[0].id), problem: null };
  }

  gladys.onWidgetGet(SILO_WIDGET_KEY, async ({ settings = {}, language }) => {
    await stocks.ready();
    await stocks.settled();
    const { stock, externalId, problem } = siloOf(settings);
    if (problem) {
      return buildUnknownStockContent(language, problem);
    }
    const store = stocks.storeOf(externalId);
    return buildSiloContent({
      ledger: store.getLedger(),
      stats: store.getStats(),
      config: stocks.configOf(externalId),
      settings,
      language,
      stockName: stock.name,
      now: now(),
    });
  });

  gladys.onWidgetAction(SILO_WIDGET_KEY, (actionKey, params, { settings = {}, values } = {}) =>
    runOperation(async () => {
      const form = values || {};
      await stocks.ready();
      const { externalId, problem } = siloOf(settings);
      if (problem) {
        return message(problem);
      }
      return runSiloAction(actionKey, externalId, form);
    }),
  );

  /**
   * @description Run a button of the silo widget.
   * @param {string} actionKey - The button.
   * @param {string} externalId - The silo's device external id.
   * @param {object} form - What the user typed in its form.
   * @returns {Promise<{en: string, fr: string}>} The message shown to the user.
   */
  function runSiloAction(actionKey, externalId, form) {
    switch (actionKey) {
      case SILO_ACTIONS.DELIVERY:
        return recordSiloFromUser(externalId, MOVEMENT_TYPES.DELIVERY, () => ({
          kg: form.kg,
          price: form.price,
        }));
      case SILO_ACTIONS.READING:
        return recordSiloFromUser(externalId, MOVEMENT_TYPES.INVENTORY, (siloConfig) => ({
          kg: readLevel(form, siloConfig),
        }));
      case SILO_ACTIONS.UNDO:
        return undoFromUser(externalId);
      default:
        throw new Error(`Unknown widget action: ${actionKey}`);
    }
  }

  return { publishDevices };
}

export { registerHandlers };
