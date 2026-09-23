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
// low-stock reminder) go into the status rows, which hold up to 10.
// -----------------------------------------------------------------------------

import { DAY_MS, WIDGET_ACTIONS } from './constants.js';
import { resolveLanguage, translate } from './i18n.js';

// A stock chart is a step function: each movement jumps, nothing in between.
const CHART_TYPE = 'stepline';
// Contract bound of an inline series.
const MAX_CHART_POINTS = 300;
// Contract bound of the chart annotations.
const MAX_ANNOTATIONS = 8;

// The stock moves a few times a day at most, and every change we make nudges
// the core (requestWidgetRefresh): the TTL only has to cover the slow drift
// of the autonomy, recomputed hourly.
const TTL_SECONDS = 3600;

const DEFAULT_CHART_DAYS = 90;

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
 * step line always reaches the present.
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
  } else if (inPeriod.length > 0) {
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
    .filter(
      (movement) =>
        movement.type === 'delivery' && movement.bags > 1 && Date.parse(movement.t) >= start,
    )
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
 * @param {Date} params.now - The current time.
 * @returns {{ttl_seconds: number, components: Array<object>}} The widget content.
 * @example
 * const content = buildWidgetContent({ ledger, stats, config, settings, language: 'fr', now: new Date() });
 */
function buildWidgetContent({ ledger, stats, config, settings = {}, language, now }) {
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
    icon: 'plus',
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
  const points = buildStockPoints(ledger.movements, now, days);
  if (points.length >= 2) {
    components.push({
      type: 'chart',
      chart_type: CHART_TYPE,
      title: t('chart_title'),
      series: [{ name: t('stock'), points }],
      annotations: buildDeliveryAnnotations(ledger.movements, now, days),
    });
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
  let rateValue = '—';
  if (stats.dailyRate === 0) {
    rateValue = t('no_consumption');
  } else if (stats.dailyRate !== null) {
    rateValue = `${formatNumber(stats.dailyRate, lang)} ${t('unit_per_day')}`;
  }
  statusItems.push({ label: t('per_day'), value: rateValue, icon: 'trending-down' });
  statusItems.push({
    label: t('remaining_weight'),
    value: `${formatNumber(stats.stock * config.bagWeight, lang)} kg`,
    icon: 'box',
    color,
  });
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
        icon: 'minus',
        style: 'primary',
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

export {
  buildWidgetContent,
  buildStockPoints,
  buildDeliveryAnnotations,
  readChartDays,
  stockColor,
  TTL_SECONDS,
};
