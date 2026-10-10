// -----------------------------------------------------------------------------
// Content of the "Pellet silo" dashboard widget: a stock filled in bulk.
//
// A silo counts in kg: deliveries by the truckload, and level readings (in
// kg, or in % of its capacity) instead of a tap per bag. A reading lower than
// the previous one is the consumption between them — the same inventory
// movement as a recount of bags — so the daily rate, the autonomy, the order
// date and the FIFO cost work as for the bags (see src/config.js: a silo's
// unit is 1 kg).
//
// Same budget as the bag widget: 2 tiles + chart + status + 3 buttons, the
// status at 9 rows at most.
// -----------------------------------------------------------------------------

import { LIMITS, MOVEMENT_TYPES, READING_UNITS, SILO_ACTIONS } from './constants.js';
import { costOver, seasonStart } from './cost.js';
import { fillPercent } from './device.js';
import { message, resolveLanguage, translate } from './i18n.js';
import { StockError } from './ledger.js';
import {
  CHART_VIEWS,
  DAYS_PER_MONTH,
  MAX_DAILY_BARS_DAYS,
  TTL_SECONDS,
  buildConsumptionPoints,
  buildDeliveryAnnotations,
  buildStockPoints,
  formatAgo,
  formatEuros,
  formatNumber,
  formatShortDate,
  formatUnitPrice,
  readChartDays,
  readChartView,
  readSeasonMonth,
  roundCents,
  stockColor,
  withinField,
} from './widget.js';

// Beyond a tonne, the level reads better in tonnes.
const TONNE_KG = 1000;

/**
 * @description Format a weight in kg, or in tonnes from 1,000 kg.
 * @param {number} kg - The weight.
 * @param {string} language - `fr` or `en`.
 * @returns {string} The weight with its unit.
 * @example
 * formatKg(2450, 'fr'); // -> '2,5 t'
 */
function formatKg(kg, language) {
  return kg >= TONNE_KG
    ? `${formatNumber(kg / TONNE_KG, language)} t`
    : `${formatNumber(kg, language)} kg`;
}

/**
 * @description Read a level typed in the reading form.
 * @param {{kg?: unknown, percent?: unknown}} values - The form values.
 * @param {{bulkCapacity: number|null}} config - The effective config of the silo.
 * @returns {unknown} The level in kg: from a % of the capacity (rounded to the
 *   kg), or the kg typed, left to the ledger to check.
 * @throws {StockError} On a % without a capacity, or out of 0-100.
 * @example
 * readLevel({ percent: 40 }, { bulkCapacity: 4000 }); // -> 1600
 */
function readLevel(values, config) {
  if (values.percent === undefined || values.percent === null || values.percent === '') {
    return values.kg;
  }
  if (!(config.bulkCapacity > 0)) {
    throw new StockError('silo_no_capacity');
  }
  const percent = Number(values.percent);
  if (!Number.isFinite(percent) || percent < LIMITS.percent.min || percent > LIMITS.percent.max) {
    throw new StockError('invalid_percent', LIMITS.percent);
  }
  return Math.round((config.bulkCapacity * percent) / 100);
}

/**
 * @description Build the content of the silo widget.
 * @param {object} params - The inputs, as for buildWidgetContent().
 * @param {{movements: Array<object>}} params.ledger - The ledger, in kg.
 * @param {object} params.stats - The figures computed by computeStats().
 * @param {object} params.config - The effective config of the silo.
 * @param {object} [params.settings] - The widget instance settings.
 * @param {string} [params.language] - The language of the requesting user.
 * @param {string|null} [params.stockName] - The name of the silo's house.
 * @param {Date} params.now - The current time.
 * @returns {{ttl_seconds: number, components: Array<object>}} The widget content.
 * @example
 * const content = buildSiloContent({ ledger, stats, config, language: 'fr', now: new Date() });
 */
function buildSiloContent({ ledger, stats, config, settings = {}, language, stockName, now }) {
  const lang = resolveLanguage(language);
  const t = (key, params) => translate(lang, key, params);
  const showButtons = settings.show_buttons !== false;
  const capacity = config.bulkCapacity;
  const byPercent = config.bulkReadingUnit === READING_UNITS.PERCENT && capacity > 0;

  const deliveryButton = {
    type: 'button',
    label: t('button_silo_delivery'),
    icon: 'truck',
    style: 'secondary',
    action: {
      key: SILO_ACTIONS.DELIVERY,
      fields: [
        {
          key: 'kg',
          type: 'number',
          label: message('field_silo_kg_delivered'),
          required: true,
          min: LIMITS.movementKg.min,
          max: LIMITS.movementKg.max,
          default: withinField(config.palletSize, LIMITS.movementKg),
        },
        {
          key: 'price',
          type: 'number',
          label: message('field_price'),
          description: message('field_price_description'),
          required: false,
          min: LIMITS.deliveryPrice.min,
          max: LIMITS.deliveryPrice.max,
          ...(config.bagPrice !== null && {
            default: withinField(
              roundCents(config.bagPrice * config.palletSize),
              LIMITS.deliveryPrice,
            ),
          }),
        },
      ],
    },
  };
  const readingButton = {
    type: 'button',
    label: t('button_silo_reading'),
    icon: 'eye',
    style: 'secondary',
    action: {
      key: SILO_ACTIONS.READING,
      fields: [
        byPercent
          ? {
              key: 'percent',
              type: 'number',
              label: message('field_silo_percent'),
              required: true,
              min: LIMITS.percent.min,
              max: LIMITS.percent.max,
            }
          : {
              key: 'kg',
              type: 'number',
              label: message('field_silo_kg_read'),
              required: true,
              min: LIMITS.stockKg.min,
              max: capacity > 0 ? capacity : LIMITS.stockKg.max,
            },
      ],
    },
  };

  if (!stats.hasHistory) {
    return {
      ttl_seconds: TTL_SECONDS,
      components: [
        { type: 'text', variant: 'body', text: t('silo_empty_state') },
        ...(showButtons ? [deliveryButton, readingButton] : []),
      ],
    };
  }

  const components = [];
  const color = stockColor(stats.stock, config.lowStockThreshold);
  const tonnes = stats.stock >= TONNE_KG;
  components.push({
    type: 'value',
    label: t('silo_level'),
    value: tonnes ? Math.round(stats.stock / 100) / 10 : stats.stock,
    unit: tonnes ? 't' : 'kg',
    icon: 'database',
    color,
  });
  components.push(
    stats.autonomyDays === null
      ? { type: 'value', label: t('autonomy'), value: '—', icon: 'clock' }
      : {
          type: 'value',
          label: t('autonomy'),
          value: stats.autonomyDays,
          unit: t('unit_days'),
          icon: 'clock',
          color: stats.stock === 0 ? 'danger' : 'neutral',
        },
  );

  const days = readChartDays(settings);
  const chartTitle = (key) => (stockName ? `${stockName} · ${t(`${key}_short`)}` : t(key));
  if (readChartView(settings) === CHART_VIEWS.CONSUMPTION) {
    const weekly = days > MAX_DAILY_BARS_DAYS;
    components.push({
      type: 'chart',
      chart_type: 'bar',
      title: chartTitle(weekly ? 'silo_chart_used_week' : 'silo_chart_used_day'),
      series: [
        { name: t('silo_kg_used'), points: buildConsumptionPoints(ledger.movements, now, days) },
      ],
    });
  } else {
    const points = buildStockPoints(ledger.movements, now, days);
    if (points.length >= 2) {
      components.push({
        type: 'chart',
        chart_type: 'stepline',
        title: chartTitle('silo_chart_title'),
        series: [{ name: t('silo_level'), points }],
        annotations: buildDeliveryAnnotations(
          ledger.movements,
          now,
          days,
          (movement) => `+${formatKg(movement.bags, lang)}`,
        ),
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
  const fill = fillPercent(stats.stock, capacity);
  if (fill !== null) {
    statusItems.push({ label: t('silo_fill'), value: `${fill} %`, icon: 'percent', color });
  }
  let rateValue = t('rate_pending');
  if (stats.dailyRate === 0) {
    rateValue = t('no_consumption');
  } else if (stats.dailyRate !== null) {
    rateValue = `${formatNumber(stats.dailyRate, lang)} kg/${t('unit_days')}`;
  }
  statusItems.push({ label: t('per_day'), value: rateValue, icon: 'trending-down' });
  const lastReading = [...ledger.movements]
    .reverse()
    .find((movement) => movement.type === MOVEMENT_TYPES.INVENTORY);
  if (lastReading) {
    statusItems.push({
      label: t('silo_last_reading'),
      value: formatAgo(new Date(lastReading.t), now, lang),
      icon: 'eye',
    });
  }
  if (stats.lastDelivery) {
    statusItems.push({
      label: t('last_delivery'),
      value: t('last_delivery_value', {
        date: formatShortDate(new Date(stats.lastDelivery.t), lang),
        bags: formatKg(stats.lastDelivery.bags, lang),
      }),
      icon: 'truck',
      color: 'info',
    });
  }
  if (config.bagPrice !== null || stats.bagPrice !== null) {
    const kgPrice = stats.bagPrice ?? config.bagPrice;
    statusItems.push({
      label: t('stock_value'),
      value: `${formatEuros(stats.stock * kgPrice, lang)} · ${formatUnitPrice(kgPrice, lang)}/kg`,
      icon: 'tag',
    });
    if (stats.dailyRate > 0) {
      statusItems.push({
        label: t('monthly_cost'),
        value: formatEuros(stats.dailyRate * DAYS_PER_MONTH * kgPrice, lang),
        icon: 'credit-card',
      });
    }
    const season = costOver(
      ledger.movements,
      seasonStart(now, readSeasonMonth(settings)),
      null,
      config,
    );
    if (season.bags > 0) {
      statusItems.push({
        label: t('season_cost'),
        value: t(season.unpricedBags > 0 ? 'silo_season_value_unpriced' : 'silo_season_value', {
          cost: formatEuros(season.cost, lang),
          kg: formatKg(season.kg, lang),
          unpriced: formatKg(season.unpricedBags, lang),
        }),
        icon: 'thermometer',
      });
    }
  }
  if (stats.orderDate) {
    statusItems.push({
      label: t('order_before'),
      value: formatShortDate(stats.orderDate, lang),
      icon: 'shopping-cart',
      color: 'info',
    });
  }
  components.push({ type: 'status', items: statusItems });

  if (showButtons) {
    components.push(deliveryButton, readingButton, {
      type: 'button',
      label: t('button_undo'),
      icon: 'rotate-ccw',
      style: 'secondary',
      action: { key: SILO_ACTIONS.UNDO, confirm: true },
    });
  }
  return { ttl_seconds: TTL_SECONDS, components };
}

export { buildSiloContent, formatKg, readLevel };
