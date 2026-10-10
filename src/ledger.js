// -----------------------------------------------------------------------------
// The stock ledger: every movement of pellet bags, and what we derive from it.
//
// Pure functions only (no I/O, `now` always injected), so the whole stock
// logic is testable without Gladys. A ledger is never mutated: every
// operation returns a new one, which the store persists as a whole.
//
// A movement is `{ t, type, bags, before, after }`:
//   - delivery     `bags` added to the stock, with the `price` paid for all of
//                  them and the `bagWeight` of one when the user entered them
//                  (the widget forms, "Record a delivery");
//   - consumption  `bags` taken from the stock (loaded into the stove);
//   - inventory    the stock was COUNTED at `bags` — a correction. Counting
//                  fewer bags than recorded means bags were used without being
//                  declared, so a downward inventory counts as consumption:
//                  a user who never taps "Remove bag(s)" and only counts the stock
//                  every other week still gets a consumption rate. Counting
//                  more bags may come with the `price` of the bags found;
//   - opening      the stock (`after`) and its `lots` when the history began:
//                  the movements compacted away beyond MAX_LEDGER_MOVEMENTS,
//                  so the FIFO cost of the bags still in stock is kept (see
//                  src/cost.js). Never undone, never made by the user.
// `before`/`after` freeze the stock around the movement, so undoing the last
// movement is exact and the chart never recomputes the past.
// -----------------------------------------------------------------------------

import {
  DAY_MS,
  DEFAULTS,
  LIMITS,
  MAX_LEDGER_MOVEMENTS,
  MOVEMENT_TYPES,
  STOCK_TYPES,
} from './constants.js';
import { pricePerBag, valueBags, walkLots } from './cost.js';

/**
 * Error of a refused stock operation, carrying a message code translated by
 * the caller (see i18n.js) — the ledger itself stays language-agnostic.
 */
class StockError extends Error {
  /**
   * @param {string} code - The i18n message code.
   * @param {object} [params] - The message parameters.
   */
  constructor(code, params = {}) {
    super(code);
    this.name = 'StockError';
    this.code = code;
    this.params = params;
  }
}

// What a ledger counts, per type of stock: the bounds of a movement and of
// the stock, and the message of a count out of them. A silo counts in kg.
const UNITS = {
  [STOCK_TYPES.BAGS]: {
    movement: LIMITS.movementBags,
    stock: LIMITS.stockBags,
    invalid: 'invalid_count',
  },
  [STOCK_TYPES.BULK]: { movement: LIMITS.movementKg, stock: LIMITS.stockKg, invalid: 'invalid_kg' },
};

/**
 * @description Create an empty ledger.
 * @returns {{version: number, movements: Array<object>}} An empty ledger.
 * @example
 * const ledger = createLedger();
 */
function createLedger() {
  return { version: 1, movements: [] };
}

/**
 * @description Check that a stored movement is well-formed.
 * @param {unknown} movement - The candidate movement.
 * @returns {boolean} True when the movement can be trusted.
 * @example
 * isValidMovement({ t: '2026-09-23T08:00:00.000Z', type: 'delivery', bags: 66, before: 0, after: 66 });
 */
function isValidMovement(movement) {
  if (!movement || typeof movement !== 'object') {
    return false;
  }
  const { t, type, bags, before, after, price, bagWeight } = movement;
  const valid =
    typeof t === 'string' &&
    !Number.isNaN(Date.parse(t)) &&
    Object.values(MOVEMENT_TYPES).includes(type) &&
    [bags, before, after].every((value) => Number.isInteger(value) && value >= 0) &&
    (price === undefined || isPositive(price)) &&
    (bagWeight === undefined || isPositive(bagWeight));
  return valid && (type !== MOVEMENT_TYPES.OPENING || isValidOpening(movement));
}

/**
 * @description True for a finite number above 0.
 * @param {unknown} value - The value.
 * @returns {boolean} Whether it is one.
 */
function isPositive(value) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

/**
 * @description Check the lots of an opening movement: they hold its stock.
 * @param {object} movement - An opening movement.
 * @returns {boolean} True when its lots can be trusted.
 */
function isValidOpening({ lots, after, bagPrice }) {
  return (
    Array.isArray(lots) &&
    lots.every(
      (lot) =>
        lot &&
        typeof lot.t === 'string' &&
        Number.isInteger(lot.units) &&
        lot.units > 0 &&
        (lot.unitPrice === null || isPositive(lot.unitPrice)) &&
        (lot.unitWeight === null || isPositive(lot.unitWeight)),
    ) &&
    lots.reduce((sum, lot) => sum + lot.units, 0) === after &&
    (bagPrice === undefined || isPositive(bagPrice))
  );
}

/**
 * @description Read a stored ledger. A missing or corrupted ledger yields an
 * empty one, and a corrupted movement is dropped, never the whole history.
 * @param {unknown} raw - The stored value (a JSON string, or an object).
 * @returns {{version: number, movements: Array<object>}} The ledger.
 * @example
 * const ledger = parseLedger(gladys.config.stock_ledger);
 */
function parseLedger(raw) {
  let value = raw;
  if (typeof raw === 'string') {
    try {
      value = JSON.parse(raw);
    } catch {
      return createLedger();
    }
  }
  if (!value || !Array.isArray(value.movements)) {
    return createLedger();
  }
  const movements = value.movements
    .filter(isValidMovement)
    .sort((a, b) => Date.parse(a.t) - Date.parse(b.t));
  return { version: 1, movements };
}

/**
 * @description Serialize a ledger for setConfig().
 * @param {{movements: Array<object>}} ledger - The ledger.
 * @returns {string} The JSON string.
 * @example
 * await gladys.setConfig({ stock_ledger: serializeLedger(ledger) });
 */
function serializeLedger(ledger) {
  return JSON.stringify({ version: 1, movements: ledger.movements });
}

/**
 * @description The current stock, in bags.
 * @param {{movements: Array<object>}} ledger - The ledger.
 * @returns {number} The number of bags in stock.
 * @example
 * currentStock(ledger); // -> 42
 */
function currentStock(ledger) {
  const last = ledger.movements[ledger.movements.length - 1];
  return last ? last.after : 0;
}

/**
 * @description Read a bag count typed by the user or declared by a button.
 * @param {unknown} raw - The raw count.
 * @param {{min: number, max: number}} limits - The accepted range.
 * @param {string} [code] - The message code of a refused count.
 * @returns {number} The count, as an integer.
 * @throws {StockError} When the count is not an integer within the range.
 * @example
 * readBagCount('3', LIMITS.movementBags); // -> 3
 */
function readBagCount(raw, { min, max }, code = 'invalid_count') {
  const value = typeof raw === 'string' && raw.trim() !== '' ? Number(raw) : raw;
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new StockError(code, { min, max });
  }
  return value;
}

/**
 * @description Read an optional number typed by the user, decimals allowed.
 * @param {unknown} raw - The raw value.
 * @param {{min: number, max: number}} limits - The accepted range.
 * @param {string} code - The message code of a refused value.
 * @returns {number|null} The value, or null when the field was left empty.
 * @throws {StockError} When the value is not a number within the range.
 * @example
 * readOptionalNumber('7.5', LIMITS.bagWeight, 'invalid_weight'); // -> 7.5
 */
function readOptionalNumber(raw, { min, max }, code) {
  if (raw === undefined || raw === null || (typeof raw === 'string' && raw.trim() === '')) {
    return null;
  }
  const value = typeof raw === 'string' ? Number(raw) : raw;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
    throw new StockError(code, { min, max });
  }
  return value;
}

/**
 * @description Read a price typed by the user. Left empty or at 0, the
 * delivery simply has no price.
 * @param {unknown} raw - The raw price, in euros.
 * @param {{min: number, max: number}} limits - The accepted range.
 * @returns {number|null} The price, or null when none was entered.
 * @throws {StockError} When the price is not a number within the range.
 * @example
 * readPrice(459.5, LIMITS.deliveryPrice); // -> 459.5
 */
function readPrice(raw, limits) {
  const value = readOptionalNumber(raw, limits, 'invalid_price');
  return value > 0 ? value : null;
}

/**
 * @description Record a movement and return the new ledger.
 * @param {{movements: Array<object>}} ledger - The current ledger.
 * @param {{type: string, bags: unknown, price?: unknown, bagPrice?: unknown,
 *   bagWeight?: unknown}} movement - The movement to record. A delivery takes
 *   the others: the `price` paid for the whole delivery or, when there is
 *   none, the `bagPrice` of one bag (stored as the total, to the cent), and
 *   the `bagWeight` in kg. An inventory takes the `bagPrice` of the bags found
 *   when it counts more than recorded. A silo counts in kg (`bags` then holds
 *   kg), and takes only the `price` of a delivery.
 * @param {Date} now - The time of the movement.
 * @param {string} [stockType] - The type of the stock: its unit and bounds.
 * @returns {{version: number, movements: Array<object>}} The new ledger.
 * @throws {StockError} On an invalid count, price or weight, or a consumption
 *   above the stock.
 * @example
 * const next = recordMovement(ledger, { type: 'consumption', bags: 1 }, new Date());
 */
function recordMovement(ledger, movementIn, now, stockType = STOCK_TYPES.BAGS) {
  const { type, bags: rawBags } = movementIn;
  const units = UNITS[stockType];
  const isBags = stockType === STOCK_TYPES.BAGS;
  const before = currentStock(ledger);
  let bags;
  let after;
  let price = null;
  let bagWeight = null;
  if (type === MOVEMENT_TYPES.INVENTORY) {
    bags = readBagCount(rawBags, units.stock, units.invalid);
    after = bags;
    const bagPrice = isBags ? readPrice(movementIn.bagPrice, LIMITS.bagPrice) : null;
    if (bagPrice !== null && after > before) {
      price = Math.round(bagPrice * (after - before) * 100) / 100;
    }
  } else if (type === MOVEMENT_TYPES.DELIVERY) {
    bags = readBagCount(rawBags, units.movement, units.invalid);
    after = before + bags;
    if (after > units.stock.max) {
      throw new StockError(units.invalid, units.movement);
    }
    price = readPrice(movementIn.price, LIMITS.deliveryPrice);
    if (price === null && isBags) {
      const bagPrice = readPrice(movementIn.bagPrice, LIMITS.bagPrice);
      // One model in the ledger, the total: a lot of the FIFO cost is then
      // always `price / bags`, whatever the form it was entered with.
      price = bagPrice === null ? null : Math.round(bagPrice * bags * 100) / 100;
    }
    if (isBags) {
      bagWeight = readOptionalNumber(movementIn.bagWeight, LIMITS.bagWeight, 'invalid_weight');
    }
  } else if (type === MOVEMENT_TYPES.CONSUMPTION) {
    bags = readBagCount(rawBags, units.movement, units.invalid);
    if (bags > before) {
      // Consuming bags we do not have means the recorded stock is wrong: the
      // user must count it (inventory), we never go negative silently.
      throw new StockError('not_enough_stock', { stock: before });
    }
    after = before - bags;
  } else {
    throw new StockError('unknown_movement');
  }
  const movement = { t: now.toISOString(), type, bags, before, after };
  if (price !== null) {
    movement.price = price;
  }
  if (bagWeight !== null) {
    movement.bagWeight = bagWeight;
  }
  return { version: 1, movements: compact([...ledger.movements, movement]) };
}

/**
 * @description Keep the ledger under MAX_LEDGER_MOVEMENTS: the oldest
 * movements give way to an opening one, which keeps the stock and the lots
 * they leave (an earlier opening included), so no bag loses its price.
 * @param {Array<object>} movements - The movements, oldest first.
 * @returns {Array<object>} The movements, at most MAX_LEDGER_MOVEMENTS.
 * @example
 * compact(movements);
 */
function compact(movements) {
  if (movements.length <= MAX_LEDGER_MOVEMENTS) {
    return movements;
  }
  const kept = movements.slice(-(MAX_LEDGER_MOVEMENTS - 1));
  const dropped = movements.slice(0, movements.length - kept.length);
  const { lots, lastBagPrice } = walkLots(dropped);
  const last = dropped[dropped.length - 1];
  const opening = {
    t: last.t,
    type: MOVEMENT_TYPES.OPENING,
    bags: last.after,
    before: last.after,
    after: last.after,
    lots,
  };
  if (lastBagPrice !== null) {
    opening.bagPrice = lastBagPrice;
  }
  return [opening, ...kept];
}

/**
 * @description Remove the last movement: the stock goes back to what it was
 * before it.
 * @param {{movements: Array<object>}} ledger - The current ledger.
 * @returns {{ledger: object, movement: object}} The new ledger and the removed movement.
 * @throws {StockError} When there is nothing to undo.
 * @example
 * const { ledger: next, movement } = undoLastMovement(ledger);
 */
function undoLastMovement(ledger) {
  const movement = ledger.movements[ledger.movements.length - 1];
  if (!movement || movement.type === MOVEMENT_TYPES.OPENING) {
    throw new StockError('nothing_to_undo');
  }
  return { ledger: { version: 1, movements: ledger.movements.slice(0, -1) }, movement };
}

/**
 * @description Bags consumed by one movement (see the header comment).
 * @param {object} movement - A ledger movement.
 * @returns {number} The consumed bags, 0 for a delivery or an upward inventory.
 * @example
 * consumedBags({ type: 'inventory', before: 40, after: 35 }); // -> 5
 */
function consumedBags(movement) {
  if (movement.type === MOVEMENT_TYPES.CONSUMPTION) {
    return movement.bags;
  }
  if (movement.type === MOVEMENT_TYPES.INVENTORY) {
    return Math.max(0, movement.before - movement.after);
  }
  return 0;
}

/**
 * @description Tell a pallet (or any batch of bags) from a single bag bought
 * on its own: only the former is a "delivery" in the widget and the chart.
 * @param {object} movement - A ledger movement.
 * @returns {boolean} Whether the movement is a delivery of several bags.
 * @example
 * isPalletDelivery({ type: 'delivery', bags: 66 }); // -> true
 */
function isPalletDelivery(movement) {
  return movement.type === MOVEMENT_TYPES.DELIVERY && movement.bags > 1;
}

/**
 * @description Derive the figures shown everywhere (widget, device, scenes).
 * The daily consumption is averaged over the last `consumptionWindow` days,
 * or over the known history when it is shorter — and stays unknown (`null`)
 * under one day of history, where a single tap would extrapolate wildly.
 * The order date is when the stock reaches the low-stock threshold: unknown
 * without a threshold, or once the stock is already at or below it.
 * @param {{movements: Array<object>}} ledger - The ledger.
 * @param {Date} now - The current time.
 * @param {{consumptionWindow: number, lowStockThreshold?: number, bagWeight?: number}} config - The
 *   effective config of the stock.
 * @returns {{stock: number, dailyRate: number|null, autonomyDays: number|null,
 *   emptyDate: Date|null, orderDate: Date|null, lastDelivery: object|null,
 *   lastConsumption: object|null, consumedSinceDelivery: number|null, referenceStock: number,
 *   consumedInWindow: number, bagPrice: number|null, pricedBagWeight: number|null,
 *   remainingKg: number, usedKgSinceDelivery: number|null, hasHistory: boolean}} The
 *   stock figures. `bagPrice` is the price per bag of the last bags entered
 *   with a price, `pricedBagWeight` the weight of those bags when it was
 *   entered. The weights come from the lots (see src/cost.js).
 * @example
 * const stats = computeStats(ledger, new Date(), { consumptionWindow: 14 });
 */
function computeStats(
  ledger,
  now,
  { consumptionWindow, lowStockThreshold = 0, bagWeight = DEFAULTS.bagWeight },
) {
  const { movements } = ledger;
  const stock = currentStock(ledger);
  const nowMs = now.getTime();

  let dailyRate = null;
  let consumedInWindow = 0;
  if (movements.length > 0) {
    const start = Math.max(nowMs - consumptionWindow * DAY_MS, Date.parse(movements[0].t));
    const spanDays = (nowMs - start) / DAY_MS;
    consumedInWindow = movements
      .filter((movement) => Date.parse(movement.t) >= start)
      .reduce((sum, movement) => sum + consumedBags(movement), 0);
    if (spanDays >= 1) {
      dailyRate = consumedInWindow / spanDays;
    }
  }

  let autonomyDays = null;
  if (stock === 0) {
    autonomyDays = 0;
  } else if (dailyRate !== null && dailyRate > 0) {
    autonomyDays = Math.floor(stock / dailyRate);
  }
  const emptyDate = autonomyDays === null ? null : new Date(nowMs + autonomyDays * DAY_MS);

  let orderDate = null;
  if (lowStockThreshold > 0 && stock > lowStockThreshold && dailyRate > 0) {
    const daysLeft = Math.floor((stock - lowStockThreshold) / dailyRate);
    orderDate = new Date(nowMs + daysLeft * DAY_MS);
  }

  // The last pallet: single bags would reset the "used since" count.
  const lastDelivery = [...movements].reverse().find(isPalletDelivery) || null;
  // Counted like the daily rate: "Remove bag(s)" taps and downward recounts.
  const consumedSinceDelivery = lastDelivery
    ? movements
        .slice(movements.lastIndexOf(lastDelivery) + 1)
        .reduce((sum, movement) => sum + consumedBags(movement), 0)
    : null;
  // Only an explicit "Remove bag(s)": a recount says bags went, not when.
  const lastConsumption =
    [...movements].reverse().find((movement) => movement.type === MOVEMENT_TYPES.CONSUMPTION) ||
    null;

  // The gauge reference: the stock right after the last refill (a delivery,
  // or an inventory that raised the stock), so "full" means "as full as the
  // last time it was filled" — whatever the size of the storage room.
  const lastRefill = [...movements]
    .reverse()
    .find(
      (movement) => movement.after > movement.before || movement.type === MOVEMENT_TYPES.DELIVERY,
    );
  const referenceStock = Math.max(stock, lastRefill ? lastRefill.after : stock);

  // The price of the last bags bought: what the next ones will likely cost.
  // Past a compaction, the opening movement still knows it.
  const lastPriced = [...movements].reverse().find((movement) => pricePerBag(movement) !== null);
  const opening = movements[0]?.type === MOVEMENT_TYPES.OPENING ? movements[0] : null;
  let bagPrice = opening?.bagPrice ?? null;
  if (lastPriced) {
    bagPrice = pricePerBag(lastPriced);
  }

  // The weights, lot by lot: bags of 10 and 15 kg may share the stock.
  const valuing = { bagPrice: null, bagWeight };
  const { lots, used } = walkLots(movements);
  const remainingKg = valueBags(lots, valuing).kg;
  const usedKgSinceDelivery = lastDelivery
    ? valueBags(
        used.filter((part) => Date.parse(part.t) > Date.parse(lastDelivery.t)),
        valuing,
      ).kg
    : null;

  return {
    stock,
    dailyRate,
    autonomyDays,
    emptyDate,
    orderDate,
    lastDelivery,
    lastConsumption,
    consumedSinceDelivery,
    referenceStock,
    consumedInWindow,
    bagPrice,
    pricedBagWeight: lastPriced?.bagWeight ?? null,
    remainingKg,
    usedKgSinceDelivery,
    hasHistory: movements.length > 0,
  };
}

export {
  StockError,
  createLedger,
  parseLedger,
  serializeLedger,
  currentStock,
  readBagCount,
  readPrice,
  recordMovement,
  undoLastMovement,
  consumedBags,
  isPalletDelivery,
  computeStats,
};
