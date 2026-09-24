// -----------------------------------------------------------------------------
// Content of the "Pellet stock" dashboard widget.
//
// The core renders a declarative vocabulary (SDK 0.14, contract "dashboard
// widgets"): we only describe WHAT to show. Everything is computed inline from
// the ledger — never bound to the device features — so the widget works even
// when the user never added the device from the Discovery screen.
//
// Budget reminders (the core drops components beyond them, in content order):
// 8 components, 1 focal (the chart), 6 tiles, 2 texts, 1 status, 4 buttons.
// The four buttons take half of it, so the content is always exactly 2
// tiles + chart + status + 4 buttons: the secondary figures (daily rate,
// low-stock reminder, cost…) go into the status rows, which hold up to 10 —
// 9 at most here (the low-stock reminder replaces the order date).
// -----------------------------------------------------------------------------

import { DAY_MS, MOVEMENT_TYPES, WIDGET_ACTIONS } from './constants.js';
import { resolveLanguage, translate } from './i18n.js';
import { consumedBags, isPalletDelivery } from './ledger.js';

// The two views of the chart, picked per widget instance.
const CHART_VIEWS = {
  // A step function: each movement jumps, nothing in between.
  STOCK: 'stock',
  // Bars of the bags used per day (per week over a year).
  CONSUMPTION: 'consumption',
};
// Beyond this period the consumption bars are weekly: 365 daily bars would
// exceed the 300 points of an inline series, and would be unreadable anyway.
const MAX_DAILY_BARS_DAYS = 90;
// Contract bound of an inline series.
const MAX_CHART_POINTS = 300;
// Contract bound of the chart annotations.
const MAX_ANNOTATIONS = 8;

// The stock moves a few times a day at most, and every change we make nudges
// the core (requestWidgetRefresh): the TTL only has to cover the slow drift
// of the autonomy, recomputed hourly.
const TTL_SECONDS = 3600;

const DEFAULT_CHART_DAYS = 90;

// The monthly cost is the daily rate over an average month.
const DAYS_PER_MONTH = 30;

/**
 * @description Read the chart period of a widget instance.
 * @param {object} settings - The widget instance settings.
 * @returns {number} The period, in days.
 * @example
 * readChartDays({ chart_period: '30' }); // -> 30
 */
function readChartDays(settings) {
  const days = Number(settings.chart_period);
  return Number.isInteger(days) && days > 0 ? days : DEFAULT_CHART_DAYS;
}

/**
 * @description Read the chart view of a widget instance.
 * @param {object} settings - The widget instance settings.
 * @returns {string} One of CHART_VIEWS, the stock by default.
 * @example
 * readChartView({ chart_view: 'consumption' }); // -> 'consumption'
 */
function readChartView(settings) {
  return settings.chart_view === CHART_VIEWS.CONSUMPTION
    ? CHART_VIEWS.CONSUMPTION
    : CHART_VIEWS.STOCK;
}

/**
 * @description Format a date as "23 Sept" in the requested language.
 * @param {Date} date - The date.
 * @param {string} language - `fr` or `en`.
 * @returns {string} The short date.
 * @example
 * formatShortDate(new Date('2026-09-23'), 'fr'); // -> '23 sept.'
 */
function formatShortDate(date, language) {
  return new Intl.DateTimeFormat(language, { day: 'numeric', month: 'short' }).format(date);
}

/**
 * @description Format a number with the separators of the language.
 * @param {number} value - The number.
 * @param {string} language - `fr` or `en`.
 * @returns {string} The formatted number.
 * @example
 * formatNumber(1080, 'fr'); // -> '1 080'
 */
function formatNumber(value, language) {
  return new Intl.NumberFormat(language, { maximumFractionDigits: 1 }).format(value);
}

/**
 * @description Format an amount in euros, rounded to the euro.
 * @param {number} value - The amount.
 * @param {string} language - `fr` or `en`.
 * @returns {string} The formatted amount.
 * @example
 * formatEuros(1234.4, 'fr'); // -> '1 234 €'
 */
function formatEuros(value, language) {
  return new Intl.NumberFormat(language, {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
  }).format(value);
}

/**
 * @description Format how long ago a date was, in the largest fitting unit.
 * @param {Date} date - The past date.
 * @param {Date} now - The current time.
 * @param {string} language - `fr` or `en`.
 * @returns {string} The relative time.
 * @example
 * formatAgo(new Date(Date.now() - 3 * 86400000), new Date(), 'fr'); // -> 'il y a 3 jours'
 */
function formatAgo(date, now, language) {
  const format = new Intl.RelativeTimeFormat(language, { numeric: 'auto' });
  const minutes = Math.max(0, Math.floor((now.getTime() - date.getTime()) / 60000));
  if (minutes < 1) {
    return format.format(0, 'second');
  }
  if (minutes < 60) {
    return format.format(-minutes, 'minute');
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return format.format(-hours, 'hour');
  }
  return format.format(-Math.floor(hours / 24), 'day');
}

/**
 * @description Semantic color of the stock level.
 * @param {number} stock - The stock, in bags.
 * @param {number} threshold - The low-stock threshold.
 * @returns {string} A widget color.
 * @example
 * stockColor(3, 10); // -> 'warning'
 */
function stockColor(stock, threshold) {
  if (stock === 0) {
    return 'danger';
  }
  return stock <= threshold ? 'warning' : 'success';
}

/**
 * @description Build the inline stock series over the chosen period: one
 * point where the period starts, one per movement, one at `now` — so the
 * step line always reaches the present. A history opened by an inventory
 * starts at the counted stock: the zero before it was never a real stock.
 * @param {Array<object>} movements - The ledger movements, oldest first.
 * @param {Date} now - The current time.
 * @param {number} days - The period, in days.
 * @returns {Array<{t: string, v: number}>} The chart points.
 * @example
 * const points = buildStockPoints(ledger.movements, new Date(), 90);
 */
function buildStockPoints(movements, now, days) {
  const start = now.getTime() - days * DAY_MS;
  const inPeriod = movements.filter((movement) => Date.parse(movement.t) >= start);
  const points = [];
  const before = movements[movements.length - inPeriod.length - 1];
  if (before) {
    points.push({ t: new Date(start).toISOString(), v: before.after });
  } else if (inPeriod.length > 0 && inPeriod[0].type !== MOVEMENT_TYPES.INVENTORY) {
    // The history starts inside the period: start from the stock before it.
    points.push({ t: inPeriod[0].t, v: inPeriod[0].before });
  }
  inPeriod.forEach((movement) => points.push({ t: movement.t, v: movement.after }));
  const last = points[points.length - 1];
  if (last) {
    points.push({ t: now.toISOString(), v: last.v });
  }
  // Keep the most recent points: the first one carries the period start.
  return points.length > MAX_CHART_POINTS
    ? [points[0], ...points.slice(-(MAX_CHART_POINTS - 1))]
    : points;
}

/**
 * @description The start of the day of a date, in the local time zone.
 * @param {number} ms - A timestamp.
 * @returns {Date} Midnight of that day.
 * @example
 * startOfDay(Date.now());
 */
function startOfDay(ms) {
  const date = new Date(ms);
  date.setHours(0, 0, 0, 0);
  return date;
}

/**
 * @description The start of the week (Monday) of a date, in the local time zone.
 * @param {number} ms - A timestamp.
 * @returns {Date} Midnight of that Monday.
 * @example
 * startOfWeek(Date.now());
 */
function startOfWeek(ms) {
  const date = startOfDay(ms);
  date.setDate(date.getDate() - ((date.getDay() + 6) % 7));
  return date;
}

/**
 * @description Build the consumption bars over the chosen period: the bags
 * used per day, or per week beyond 3 months. Every day (week) of the period
 * has its bar, 0 included, so the gaps read as days without a fill. A
 * downward recount has no date for its missing bags: they land on the day of
 * the recount.
 * @param {Array<object>} movements - The ledger movements, oldest first.
 * @param {Date} now - The current time.
 * @param {number} days - The period, in days.
 * @returns {Array<{t: string, v: number}>} The chart points, one per bar.
 * @example
 * const points = buildConsumptionPoints(ledger.movements, new Date(), 30);
 */
function buildConsumptionPoints(movements, now, days) {
  const weekly = days > MAX_DAILY_BARS_DAYS;
  const bucketOf = weekly ? startOfWeek : startOfDay;
  const bars = new Map();
  const cursor = bucketOf(now.getTime() - days * DAY_MS);
  while (cursor.getTime() <= now.getTime()) {
    bars.set(cursor.getTime(), 0);
    cursor.setDate(cursor.getDate() + (weekly ? 7 : 1));
  }
  movements.forEach((movement) => {
    const bucket = bucketOf(Date.parse(movement.t)).getTime();
    if (bars.has(bucket)) {
      bars.set(bucket, bars.get(bucket) + consumedBags(movement));
    }
  });
  return [...bars].map(([t, v]) => ({ t: new Date(t).toISOString(), v }));
}

/**
 * @description Mark the deliveries of the period on the chart. Single bags
 * (the "+1 bag" button) are left out: a few of them would push the pallet
 * deliveries out of the 8 annotations the chart allows.
 * @param {Array<object>} movements - The ledger movements, oldest first.
 * @param {Date} now - The current time.
 * @param {number} days - The period, in days.
 * @returns {Array<object>} The chart annotations (the most recent ones).
 * @example
 * const annotations = buildDeliveryAnnotations(ledger.movements, new Date(), 90);
 */
function buildDeliveryAnnotations(movements, now, days) {
  const start = now.getTime() - days * DAY_MS;
  return movements
    .filter((movement) => isPalletDelivery(movement) && Date.parse(movement.t) >= start)
    .slice(-MAX_ANNOTATIONS)
    .map((movement) => ({
      t: movement.t,
      value: movement.after,
      label: `+${movement.bags}`,
      color: 'info',
    }));
}

/**
 * @description Build the widget content.
 * @param {object} params - The inputs.
 * @param {{movements: Array<object>}} params.ledger - The ledger.
 * @param {object} params.stats - The figures computed by computeStats().
 * @param {object} params.config - The normalized config.
 * @param {object} [params.settings] - The widget instance settings.
 * @param {string} [params.language] - The language of the requesting user.
 * @param {string|null} [params.stockName] - The name of an added stock, shown in the chart title.
 * @param {Date} params.now - The current time.
 * @returns {{ttl_seconds: number, components: Array<object>}} The widget content.
 * @example
 * const content = buildWidgetContent({ ledger, stats, config, settings, language: 'fr', now: new Date() });
 */
function buildWidgetContent({ ledger, stats, config, settings = {}, language, stockName, now }) {
  const lang = resolveLanguage(language);
  const t = (key, params) => translate(lang, key, params);
  const showButtons = settings.show_buttons !== false;

  const deliveryButton = {
    type: 'button',
    label: t('button_delivery'),
    icon: 'truck',
    style: 'secondary',
    action: {
      key: WIDGET_ACTIONS.DELIVERY,
      params: { bags: config.palletSize },
      confirm: true,
    },
  };

  const addBagButton = {
    type: 'button',
    label: t('button_add_bag'),
    icon: 'arrow-up-circle',
    style: 'secondary',
    action: { key: WIDGET_ACTIONS.ADD_BAG, params: { bags: 1 } },
  };

  if (!stats.hasHistory) {
    return {
      ttl_seconds: TTL_SECONDS,
      components: [
        { type: 'text', variant: 'body', text: t('empty_state') },
        ...(showButtons ? [addBagButton, deliveryButton] : []),
      ],
    };
  }

  const components = [];
  const color = stockColor(stats.stock, config.lowStockThreshold);

  components.push({
    type: 'value',
    label: t('stock'),
    value: stats.stock,
    unit: t('unit_bags'),
    icon: 'package',
    color,
  });

  if (stats.autonomyDays !== null) {
    components.push({
      type: 'value',
      label: t('autonomy'),
      value: stats.autonomyDays,
      unit: t('unit_days'),
      icon: 'clock',
      color: stats.stock === 0 ? 'danger' : 'neutral',
    });
  } else {
    components.push({ type: 'value', label: t('autonomy'), value: '—', icon: 'clock' });
  }

  const days = readChartDays(settings);
  // The core owns the widget header: the chart title is where an added
  // stock says which house it is — with a short title, to fit 40 characters.
  const chartTitle = (long, short) => (stockName ? `${stockName} · ${t(short)}` : t(long));
  if (readChartView(settings) === CHART_VIEWS.CONSUMPTION) {
    const weekly = days > MAX_DAILY_BARS_DAYS;
    components.push({
      type: 'chart',
      chart_type: 'bar',
      title: weekly
        ? chartTitle('chart_used_week', 'chart_used_week_short')
        : chartTitle('chart_used_day', 'chart_used_day_short'),
      series: [
        { name: t('bags_used'), points: buildConsumptionPoints(ledger.movements, now, days) },
      ],
    });
  } else {
    const points = buildStockPoints(ledger.movements, now, days);
    if (points.length >= 2) {
      components.push({
        type: 'chart',
        chart_type: 'stepline',
        title: chartTitle('chart_title', 'chart_title'),
        series: [{ name: t('stock'), points }],
        annotations: buildDeliveryAnnotations(ledger.movements, now, days),
      });
    }
  }

  const statusItems = [];
  if (stats.stock <= config.lowStockThreshold) {
    statusItems.push({
      label: t('low_stock'),
      value: t('order_now'),
      icon: 'alert-triangle',
      color,
    });
  }
  let rateValue = t('rate_pending');
  if (stats.dailyRate === 0) {
    rateValue = t('no_consumption');
  } else if (stats.dailyRate !== null) {
    rateValue = `${formatNumber(stats.dailyRate, lang)} ${t('unit_per_day')}`;
  }
  statusItems.push({ label: t('per_day'), value: rateValue, icon: 'trending-down' });
  if (stats.lastConsumption) {
    statusItems.push({
      label: t('last_bag'),
      value: formatAgo(new Date(stats.lastConsumption.t), now, lang),
      icon: 'arrow-down-circle',
    });
  }
  statusItems.push({
    label: t('remaining_weight'),
    value: `${formatNumber(stats.stock * config.bagWeight, lang)} kg`,
    icon: 'box',
    color,
  });
  if (config.bagPrice !== null) {
    statusItems.push({
      label: t('stock_value'),
      value: formatEuros(stats.stock * config.bagPrice, lang),
      icon: 'tag',
    });
    if (stats.dailyRate > 0) {
      statusItems.push({
        label: t('monthly_cost'),
        value: formatEuros(stats.dailyRate * DAYS_PER_MONTH * config.bagPrice, lang),
        icon: 'credit-card',
      });
    }
  }
  if (stats.lastDelivery) {
    statusItems.push({
      label: t('last_delivery'),
      value: t('last_delivery_value', {
        date: formatShortDate(new Date(stats.lastDelivery.t), lang),
        bags: stats.lastDelivery.bags,
      }),
      icon: 'truck',
      color: 'info',
    });
    const used = stats.consumedSinceDelivery;
    const usedUnit = new Intl.PluralRules(lang).select(used) === 'one' ? 'unit_bag' : 'unit_bags';
    statusItems.push({
      label: t('used_since_delivery'),
      value: `${formatNumber(used, lang)} ${t(usedUnit)} · ${formatNumber(used * config.bagWeight, lang)} kg`,
      icon: 'bar-chart-2',
    });
  }
  if (stats.orderDate) {
    statusItems.push({
      label: t('order_before'),
      value: formatShortDate(stats.orderDate, lang),
      icon: 'shopping-cart',
      color: 'info',
    });
  }
  if (stats.emptyDate && stats.stock > 0) {
    statusItems.push({
      label: t('empty_around'),
      value: formatShortDate(stats.emptyDate, lang),
      icon: 'calendar',
      color,
    });
  }
  components.push({ type: 'status', items: statusItems });

  if (showButtons) {
    if (stats.stock > 0) {
      components.push({
        type: 'button',
        label: t('button_consume'),
        icon: 'arrow-down-circle',
        // Not `primary`: the core draws its icon too dark to be seen.
        style: 'secondary',
        action: { key: WIDGET_ACTIONS.CONSUME, params: { bags: 1 } },
      });
    }
    components.push(addBagButton);
    components.push(deliveryButton);
    components.push({
      type: 'button',
      label: t('button_undo'),
      icon: 'rotate-ccw',
      style: 'secondary',
      action: { key: WIDGET_ACTIONS.UNDO, confirm: true },
    });
  }

  return { ttl_seconds: TTL_SECONDS, components };
}

/**
 * @description The content of a widget whose stock was removed.
 * @param {string} [language] - The language of the requesting user.
 * @returns {{ttl_seconds: number, components: Array<object>}} The widget content.
 * @example
 * const content = buildUnknownStockContent('fr');
 */
function buildUnknownStockContent(language) {
  return {
    ttl_seconds: TTL_SECONDS,
    components: [
      {
        type: 'text',
        variant: 'body',
        text: translate(resolveLanguage(language), 'widget_unknown_stock'),
      },
    ],
  };
}

export {
  buildWidgetContent,
  buildUnknownStockContent,
  buildStockPoints,
  buildConsumptionPoints,
  readChartView,
  buildDeliveryAnnotations,
  readChartDays,
  stockColor,
  TTL_SECONDS,
};
