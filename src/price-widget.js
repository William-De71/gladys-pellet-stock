// -----------------------------------------------------------------------------
// The "Pellet prices" widget: what the pellets cost over the years.
//
// For a stock of bags or a silo (prices per bag, or per tonne):
//   - tiles: the last price paid, and how it moved over one year;
//   - a step line of the price in force, from one priced delivery to the next,
//     over 1, 3 or 5 years;
//   - one row per heating season, the newest first: what the pellets used
//     cost (first in, first out), how many, and the average price of one.
//
// Read only, recomputed from the ledger like every other figure: an undone
// delivery leaves the history with it.
// -----------------------------------------------------------------------------

import { MOVEMENT_TYPES, STOCK_TYPES } from './constants.js';
import { costOver, pricePerBag, seasonStart } from './cost.js';
import { resolveLanguage, translate } from './i18n.js';
import { formatKg } from './silo-widget.js';
import {
  TTL_SECONDS,
  formatEuros,
  formatNumber,
  formatUnitPrice,
  readSeasonMonth,
} from './widget.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const YEAR_MS = 365 * DAY_MS;
const TONNE_KG = 1000;

// The chart periods offered in the widget settings, in days.
const PRICE_PERIODS = [365, 1095, 1825];
const DEFAULT_PRICE_PERIOD = 1095;

// The seasons compared, the current one included.
const MAX_SEASONS = 5;

// A price that moved by less than this share over a year is "stable".
const STABLE_SHARE = 0.005;

/**
 * @description Read the chart period of a widget instance.
 * @param {object} settings - The widget instance settings.
 * @returns {number} The period in days, 3 years when not set.
 * @example
 * readPricePeriod({ chart_period: '365' }); // -> 365
 */
function readPricePeriod(settings) {
  const days = Number(settings.chart_period);
  return PRICE_PERIODS.includes(days) ? days : DEFAULT_PRICE_PERIOD;
}

/**
 * @description The prices entered with the movements, oldest first: a
 * delivery with its price, or bags found by a count with theirs.
 * @param {Array<object>} movements - The ledger movements, oldest first.
 * @param {string} type - The stock type: a silo is priced per tonne.
 * @returns {Array<{t: number, price: number}>} When, and the price of a bag
 *   (of a tonne for a silo).
 * @example
 * priceHistory(ledger.movements, 'bags'); // -> [{ t: 1790000000000, price: 7.15 }]
 */
function priceHistory(movements, type = STOCK_TYPES.BAGS) {
  const scale = type === STOCK_TYPES.BULK ? TONNE_KG : 1;
  return movements
    .filter((movement) =>
      [MOVEMENT_TYPES.DELIVERY, MOVEMENT_TYPES.INVENTORY].includes(movement.type),
    )
    .map((movement) => ({ t: Date.parse(movement.t), price: pricePerBag(movement) }))
    .filter(({ price }) => price !== null)
    .map(({ t, price }) => ({ t, price: price * scale }));
}

/**
 * @description The price in force at a date: the last one entered before it.
 * @param {Array<{t: number, price: number}>} history - From priceHistory().
 * @param {number} t - The date, in ms.
 * @returns {number|null} The price, null when none was entered yet.
 */
function priceAt(history, t) {
  let price = null;
  for (const entry of history) {
    if (entry.t > t) {
      break;
    }
    price = entry.price;
  }
  return price;
}

/**
 * @description How the last price moved over one year: compared with the
 * price in force one year before it was entered.
 * @param {Array<{t: number, price: number}>} history - From priceHistory().
 * @returns {number|null} The change, as a share (0.06 for +6 %), null without
 *   a price one year earlier.
 * @example
 * yearlyChange(history); // -> 0.06
 */
function yearlyChange(history) {
  const last = history.at(-1);
  if (!last) {
    return null;
  }
  const before = priceAt(history, last.t - YEAR_MS);
  return before > 0 ? last.price / before - 1 : null;
}

/**
 * @description The points of the price chart: the price in force at the
 * start of the period, each price entered since, and the last one again now,
 * so the step line reaches today.
 * @param {Array<{t: number, price: number}>} history - From priceHistory().
 * @param {Date} now - The current time.
 * @param {number} days - The period, in days.
 * @returns {Array<{t: string, v: number}>} The points, empty without any price.
 */
function buildPricePoints(history, now, days) {
  const end = now.getTime();
  const start = end - days * DAY_MS;
  const points = [];
  const opening = priceAt(history, start);
  if (opening !== null) {
    points.push({ t: start, v: opening });
  }
  for (const entry of history) {
    if (entry.t > start && entry.t <= end) {
      points.push({ t: entry.t, v: entry.price });
    }
  }
  if (points.length > 0) {
    points.push({ t: end, v: points.at(-1).v });
  }
  return points.map(({ t, v }) => ({ t: new Date(t).toISOString(), v: Math.round(v * 100) / 100 }));
}

/**
 * @description The heating seasons to compare, the current one first: those
 * the ledger covers, up to MAX_SEASONS.
 * @param {Array<object>} movements - The ledger movements, oldest first.
 * @param {object} config - The effective config of the stock.
 * @param {number} month - The month the seasons start (1-12).
 * @param {Date} now - The current time.
 * @returns {Array<{start: Date, end: Date|null, bags: number, kg: number,
 *   cost: number, unpricedBags: number}>} The seasons, `end` null for the
 *   current one.
 */
function seasonCosts(movements, config, month, now) {
  if (movements.length === 0) {
    return [];
  }
  const first = Date.parse(movements[0].t);
  const seasons = [];
  let end = null;
  let start = seasonStart(now, month);
  for (let i = 0; i < MAX_SEASONS; i += 1) {
    if (end !== null && end.getTime() <= first) {
      break;
    }
    seasons.push({ start, end, ...costOver(movements, start, end, config) });
    end = start;
    start = new Date(start.getFullYear() - 1, start.getMonth(), 1);
  }
  return seasons;
}

/**
 * @description The name of a season: "2026-27", or "2026" for a season
 * starting in January.
 * @param {Date} start - The start of the season.
 * @returns {string} The name.
 * @example
 * seasonName(new Date(2026, 9, 1)); // -> '2026-27'
 */
function seasonName(start) {
  const year = start.getFullYear();
  return start.getMonth() === 0 ? `${year}` : `${year}-${String(year + 1).slice(-2)}`;
}

/**
 * @description Build the content of the "Pellet prices" widget.
 * @param {object} params - Parameters.
 * @param {object} params.ledger - The ledger.
 * @param {object} params.config - The effective config of the stock.
 * @param {object} [params.settings] - The widget instance settings.
 * @param {string} [params.language] - The language of the requesting user.
 * @param {string|null} [params.stockName] - The name of an added stock.
 * @param {string} [params.type] - The stock type.
 * @param {Date} params.now - The current time.
 * @returns {object} The widget content.
 */
function buildPriceContent({
  ledger,
  config,
  settings = {},
  language,
  stockName = null,
  type = STOCK_TYPES.BAGS,
  now,
}) {
  const lang = resolveLanguage(language);
  const t = (key, params) => translate(lang, key, params);
  const isBulk = type === STOCK_TYPES.BULK;
  const history = priceHistory(ledger.movements, type);
  if (history.length === 0) {
    return {
      ttl_seconds: TTL_SECONDS,
      components: [
        { type: 'text', variant: 'body', text: t(isBulk ? 'prices_empty_silo' : 'prices_empty') },
      ],
    };
  }

  const unit = t(isBulk ? 'unit_per_tonne' : 'unit_per_bag');
  const components = [
    {
      type: 'value',
      label: t('price_last'),
      value: formatUnitPrice(history.at(-1).price, lang),
      unit,
      icon: 'tag',
      color: 'primary',
    },
  ];
  const change = yearlyChange(history);
  if (change !== null) {
    const stable = Math.abs(change) < STABLE_SHARE;
    components.push({
      type: 'value',
      label: t('price_change_year'),
      value: new Intl.NumberFormat(lang, {
        style: 'percent',
        maximumFractionDigits: 0,
        signDisplay: stable ? 'never' : 'always',
      }).format(stable ? 0 : change),
      icon: stable ? 'minus' : change > 0 ? 'trending-up' : 'trending-down',
      color: stable ? 'neutral' : change > 0 ? 'warning' : 'success',
    });
  }

  const title = t(isBulk ? 'price_chart_tonne' : 'price_chart_bag');
  components.push({
    type: 'chart',
    chart_type: 'stepline',
    title: stockName ? `${stockName} · ${title}` : title,
    series: [
      {
        name: t(isBulk ? 'price_series_tonne' : 'price_series_bag'),
        points: buildPricePoints(history, now, readPricePeriod(settings)),
      },
    ],
  });

  const items = seasonCosts(ledger.movements, config, readSeasonMonth(settings), now)
    .filter((season) => season.bags > 0)
    .map((season) => {
      const priced = season.bags - season.unpricedBags;
      const quantity = isBulk
        ? formatKg(season.bags, lang)
        : `${formatNumber(season.bags, lang)} ${t(season.bags === 1 ? 'unit_bag' : 'unit_bags')}`;
      const average =
        priced > 0
          ? `${formatUnitPrice((season.cost / priced) * (isBulk ? TONNE_KG : 1), lang)}${unit}`
          : null;
      const parts = [formatEuros(season.cost, lang), quantity, average].filter(Boolean);
      const unpriced =
        season.unpricedBags > 0
          ? ` (${t('price_unpriced', {
              count: isBulk
                ? formatKg(season.unpricedBags, lang)
                : formatNumber(season.unpricedBags, lang),
            })})`
          : '';
      return {
        // The current season stands out by its color: a longer label would
        // cut its figures on a narrow card.
        label: seasonName(season.start),
        value: `${parts.join(' · ')}${unpriced}`,
        icon: 'thermometer',
        ...(season.end === null && { color: 'info' }),
      };
    });
  if (items.length > 0) {
    components.push({ type: 'status', items });
  }
  return { ttl_seconds: TTL_SECONDS, components };
}

export {
  MAX_SEASONS,
  PRICE_PERIODS,
  buildPriceContent,
  buildPricePoints,
  priceHistory,
  readPricePeriod,
  seasonCosts,
  seasonName,
  yearlyChange,
};
