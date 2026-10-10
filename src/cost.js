// -----------------------------------------------------------------------------
// The cost of the pellets used, first in, first out.
//
// Every bag that enters the stock joins a lot with the price it was bought
// at; every bag used is taken from the oldest lot. The cost of a period is
// then the price of the bags used during it — a stove burning the 2025 bags
// first costs the 2025 price, then the 2026 one — and the remaining weight
// is exact when the bags of two deliveries do not weigh the same.
//
// Pure functions, recomputed from the ledger at every call: an undone
// movement simply is no longer there. A lot is `{ t, units, unitPrice,
// unitWeight }`, a price or a weight being null when it is unknown — the
// defaults of the stock (pallet price, bag weight) then apply when it is
// valued, so changing a default never rewrites the ledger.
//
// Where a lot gets its price:
//   - a delivery: the price paid for it; without one, the last price per bag
//     known at that time (the next bags likely cost the same);
//   - a counted stock above the recorded one (bags found): the price entered
//     with the count, else the last price per bag known;
//   - the stock before the first movement kept (a long history compacted
//     away, or a first count): no price, unless the opening movement kept it.
// -----------------------------------------------------------------------------

import { MOVEMENT_TYPES } from './constants.js';

/**
 * @description The bags a movement puts into the stock.
 * @param {object} movement - A ledger movement.
 * @returns {number} The bags added, 0 when it adds none.
 * @example
 * addedBags({ type: 'inventory', before: 10, after: 14 }); // -> 4
 */
function addedBags(movement) {
  if (movement.type === MOVEMENT_TYPES.DELIVERY) {
    return movement.bags;
  }
  if (movement.type === MOVEMENT_TYPES.INVENTORY) {
    return Math.max(0, movement.after - movement.before);
  }
  return 0;
}

/**
 * @description The price per bag a movement was entered with.
 * @param {object} movement - A ledger movement.
 * @returns {number|null} The price of one of the bags it added, or null.
 * @example
 * pricePerBag({ type: 'delivery', bags: 66, price: 462 }); // -> 7
 */
function pricePerBag(movement) {
  const added = addedBags(movement);
  return movement.price !== undefined && added > 0 ? movement.price / added : null;
}

/**
 * @description Take bags from the oldest lots.
 * @param {Array<object>} lots - The lots, oldest first; changed in place.
 * @param {number} bags - The bags to take.
 * @param {string} t - When they were used.
 * @param {Array<object>} used - Receives what was taken, per lot.
 */
function takeOldest(lots, bags, t, used) {
  let left = bags;
  while (left > 0 && lots.length > 0) {
    const lot = lots[0];
    const units = Math.min(left, lot.units);
    used.push({ t, units, unitPrice: lot.unitPrice, unitWeight: lot.unitWeight });
    lot.units -= units;
    left -= units;
    if (lot.units === 0) {
      lots.shift();
    }
  }
}

/**
 * @description Walk the ledger, lot by lot.
 * @param {Array<object>} movements - The ledger movements, oldest first.
 * @returns {{lots: Array<object>, used: Array<object>, lastBagPrice: number|null}}
 *   The lots left in stock (oldest first), the bags used (per movement and
 *   lot, `{ t, units, unitPrice, unitWeight }`) and the last price per bag known.
 * @example
 * const { lots, used } = walkLots(ledger.movements);
 */
function walkLots(movements) {
  let lots = [];
  const used = [];
  let lastBagPrice = null;
  const total = () => lots.reduce((sum, lot) => sum + lot.units, 0);

  movements.forEach((movement) => {
    if (movement.type === MOVEMENT_TYPES.OPENING) {
      lots = movement.lots.map((lot) => ({ ...lot }));
      lastBagPrice = movement.bagPrice ?? lastBagPrice;
      return;
    }
    // The lots always hold the stock before the movement: what the history
    // does not explain (its first stock) is a lot of unknown price.
    const missing = movement.before - total();
    if (missing > 0) {
      lots.push({ t: movement.t, units: missing, unitPrice: null, unitWeight: null });
    } else if (missing < 0) {
      takeOldest(lots, -missing, movement.t, []);
    }

    const added = addedBags(movement);
    if (added > 0) {
      const ownPrice = pricePerBag(movement);
      lots.push({
        t: movement.t,
        units: added,
        unitPrice: ownPrice ?? lastBagPrice,
        unitWeight: movement.bagWeight ?? null,
      });
      if (ownPrice !== null) {
        lastBagPrice = ownPrice;
      }
    } else {
      takeOldest(lots, movement.before - movement.after, movement.t, used);
    }
  });
  return { lots, used, lastBagPrice };
}

/**
 * @description Value bags taken from lots, with the defaults of the stock
 * for what a lot does not know.
 * @param {Array<{units: number, unitPrice: number|null, unitWeight: number|null}>} parts - The bags.
 * @param {{bagPrice: number|null, bagWeight: number}} config - The effective config of the stock.
 * @returns {{bags: number, kg: number, cost: number, unpricedBags: number}} The
 *   bags, their weight, the cost of those with a price, and the bags without one.
 * @example
 * valueBags(lots, config);
 */
function valueBags(parts, config) {
  return parts.reduce(
    (sum, part) => {
      const unitPrice = part.unitPrice ?? config.bagPrice;
      return {
        bags: sum.bags + part.units,
        kg: sum.kg + part.units * (part.unitWeight ?? config.bagWeight),
        cost: sum.cost + (unitPrice === null ? 0 : part.units * unitPrice),
        unpricedBags: sum.unpricedBags + (unitPrice === null ? part.units : 0),
      };
    },
    { bags: 0, kg: 0, cost: 0, unpricedBags: 0 },
  );
}

/**
 * @description The bags used over a period, their weight and their cost.
 * @param {Array<object>} movements - The ledger movements, oldest first.
 * @param {Date} start - The start of the period (included).
 * @param {Date|null} end - The end of the period (excluded); null for "until now",
 *   the movements just recorded included.
 * @param {{bagPrice: number|null, bagWeight: number}} config - The effective config of the stock.
 * @returns {{bags: number, kg: number, cost: number, unpricedBags: number}} See valueBags().
 * @example
 * costOver(ledger.movements, new Date('2026-10-01'), new Date(), config);
 */
function costOver(movements, start, end, config) {
  const from = start.getTime();
  const to = end ? end.getTime() : Infinity;
  const { used } = walkLots(movements);
  return valueBags(
    used.filter((part) => {
      const t = Date.parse(part.t);
      return t >= from && t < to;
    }),
    config,
  );
}

/**
 * @description The start of the heating season holding a date: the first day
 * of the season's month, this year or the last, at midnight local time.
 * @param {Date} now - The date.
 * @param {number} month - The month the season starts (1-12).
 * @returns {Date} The start of the season.
 * @example
 * seasonStart(new Date('2026-02-10'), 10); // -> 2025-10-01
 */
function seasonStart(now, month) {
  const start = new Date(now.getFullYear(), month - 1, 1);
  if (start.getTime() > now.getTime()) {
    start.setFullYear(start.getFullYear() - 1);
  }
  return start;
}

/**
 * @description Parse a date typed as DD/MM/YYYY (or DD/MM/YY, with `-` or `.`).
 * @param {unknown} raw - The text.
 * @returns {Date|null} Midnight of that day, local time, or null when not a date.
 * @example
 * parseDay('1/10/26'); // -> 2026-10-01
 */
function parseDay(raw) {
  const match =
    typeof raw === 'string' && raw.trim().match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/);
  if (!match) {
    return null;
  }
  const [day, month] = [Number(match[1]), Number(match[2])];
  const year = match[3].length === 2 ? 2000 + Number(match[3]) : Number(match[3]);
  const date = new Date(year, month - 1, day);
  // 31/02 rolls over to March: not a date.
  return date.getDate() === day && date.getMonth() === month - 1 ? date : null;
}

/**
 * @description The day after a date, at midnight: the excluded end of a
 * period whose last day is included.
 * @param {Date} date - Midnight of the last day.
 * @returns {Date} Midnight of the next day.
 * @example
 * nextDay(new Date(2027, 5, 1)); // -> 2027-06-02
 */
function nextDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1);
}

export { addedBags, pricePerBag, walkLots, valueBags, costOver, seasonStart, parseDay, nextDay };
