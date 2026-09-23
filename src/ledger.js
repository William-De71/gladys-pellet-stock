// -----------------------------------------------------------------------------
// The stock ledger: every movement of pellet bags, and what we derive from it.
//
// Pure functions only (no I/O, `now` always injected), so the whole stock
// logic is testable without Gladys. A ledger is never mutated: every
// operation returns a new one, which the store persists as a whole.
//
// A movement is `{ t, type, bags, before, after }`:
//   - delivery     `bags` added to the stock;
//   - consumption  `bags` taken from the stock (loaded into the stove);
//   - inventory    the stock was COUNTED at `bags` — a correction. Counting
//                  fewer bags than recorded means bags were used without being
//                  declared, so a downward inventory counts as consumption:
//                  a user who never taps "−1 bag" and only counts the stock
//                  every other week still gets a consumption rate.
// `before`/`after` freeze the stock around the movement, so undoing the last
// movement is exact and the chart never recomputes the past.
// -----------------------------------------------------------------------------

import { DAY_MS, LIMITS, MAX_LEDGER_MOVEMENTS, MOVEMENT_TYPES } from './constants.js';

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
  const { t, type, bags, before, after } = movement;
  return (
    typeof t === 'string' &&
    !Number.isNaN(Date.parse(t)) &&
    Object.values(MOVEMENT_TYPES).includes(type) &&
    [bags, before, after].every((value) => Number.isInteger(value) && value >= 0)
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
 * @returns {number} The count, as an integer.
 * @throws {StockError} When the count is not an integer within the range.
 * @example
 * readBagCount('3', LIMITS.movementBags); // -> 3
 */
function readBagCount(raw, { min, max }) {
  const value = typeof raw === 'string' && raw.trim() !== '' ? Number(raw) : raw;
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new StockError('invalid_count', { min, max });
  }
  return value;
}

/**
 * @description Record a movement and return the new ledger.
 * @param {{movements: Array<object>}} ledger - The current ledger.
 * @param {{type: string, bags: unknown}} movement - The movement to record.
 * @param {Date} now - The time of the movement.
 * @returns {{version: number, movements: Array<object>}} The new ledger.
 * @throws {StockError} On an invalid count, or a consumption above the stock.
 * @example
 * const next = recordMovement(ledger, { type: 'consumption', bags: 1 }, new Date());
 */
function recordMovement(ledger, { type, bags: rawBags }, now) {
  const before = currentStock(ledger);
  let bags;
  let after;
  if (type === MOVEMENT_TYPES.INVENTORY) {
    bags = readBagCount(rawBags, LIMITS.stockBags);
    after = bags;
  } else if (type === MOVEMENT_TYPES.DELIVERY) {
    bags = readBagCount(rawBags, LIMITS.movementBags);
    after = before + bags;
    if (after > LIMITS.stockBags.max) {
      throw new StockError('invalid_count', LIMITS.movementBags);
    }
  } else if (type === MOVEMENT_TYPES.CONSUMPTION) {
    bags = readBagCount(rawBags, LIMITS.movementBags);
    if (bags > before) {
      // Consuming bags we do not have means the recorded stock is wrong: the
      // user must count it (inventory), we never go negative silently.
      throw new StockError('not_enough_stock', { stock: before });
    }
    after = before - bags;
  } else {
    throw new StockError('unknown_movement');
  }
  const movements = [...ledger.movements, { t: now.toISOString(), type, bags, before, after }];
  return { version: 1, movements: movements.slice(-MAX_LEDGER_MOVEMENTS) };
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
  if (ledger.movements.length === 0) {
    throw new StockError('nothing_to_undo');
  }
  const movement = ledger.movements[ledger.movements.length - 1];
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
 * @description Derive the figures shown everywhere (widget, device, scenes).
 * The daily consumption is averaged over the last `consumptionWindow` days,
 * or over the known history when it is shorter — and stays unknown (`null`)
 * under one day of history, where a single tap would extrapolate wildly.
 * @param {{movements: Array<object>}} ledger - The ledger.
 * @param {Date} now - The current time.
 * @param {{consumptionWindow: number}} config - The normalized config.
 * @returns {{stock: number, dailyRate: number|null, autonomyDays: number|null,
 *   emptyDate: Date|null, lastDelivery: object|null, referenceStock: number,
 *   consumedInWindow: number, hasHistory: boolean}} The stock figures.
 * @example
 * const stats = computeStats(ledger, new Date(), { consumptionWindow: 14 });
 */
function computeStats(ledger, now, { consumptionWindow }) {
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

  const lastDelivery =
    [...movements].reverse().find((movement) => movement.type === MOVEMENT_TYPES.DELIVERY) || null;

  // The gauge reference: the stock right after the last refill (a delivery,
  // or an inventory that raised the stock), so "full" means "as full as the
  // last time it was filled" — whatever the size of the storage room.
  const lastRefill = [...movements]
    .reverse()
    .find(
      (movement) => movement.after > movement.before || movement.type === MOVEMENT_TYPES.DELIVERY,
    );
  const referenceStock = Math.max(stock, lastRefill ? lastRefill.after : stock);

  return {
    stock,
    dailyRate,
    autonomyDays,
    emptyDate,
    lastDelivery,
    referenceStock,
    consumedInWindow,
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
  recordMovement,
  undoLastMovement,
  consumedBags,
  computeStats,
};
