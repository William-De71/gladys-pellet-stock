// -----------------------------------------------------------------------------
// Scene actions outputs and scene triggers.
//
// Every scene action returns the same figures, so a scene can chain any of
// them with a message ("{{stock}} bags left, order within {{days}} days").
// An unknown figure is left out, never sent as 0: a 0 would read as "empty"
// or "order now" in the conditions that follow.
//
// The triggers fire on a TRANSITION only (the stock crosses the threshold,
// reaches 0, a pallet arrives), never once per bag below the threshold. The
// SDK doctrine is "no event as a consequence of a received scene action", or
// a scene bound to the event could loop through the integration: a pallet
// added by a scene never fires "pallet delivered". The stock-level triggers
// still fire whatever the origin (a Zigbee button goes through a scene): they
// only fire on a DOWNWARD crossing, which no scene can repeat by itself.
// -----------------------------------------------------------------------------

import { DAY_MS } from './constants.js';
import { isPalletDelivery } from './ledger.js';

// Keys of the manifest `scene_triggers`.
const SCENE_TRIGGERS = {
  LOW_STOCK: 'low_stock',
  STOCK_EMPTY: 'stock_empty',
  PALLET_DELIVERED: 'pallet_delivered',
};

/**
 * @description Build the outputs of a scene action from the stock figures.
 * @param {object} stats - The figures computed by computeStats().
 * @param {{bagWeight: number, lowStockThreshold: number}} config - The normalized config.
 * @param {Date} now - The current time.
 * @returns {{stock: number, remaining_kg: number, autonomy_days?: number,
 *   daily_rate?: number, days_before_order?: number}} The outputs.
 * @example
 * const outputs = buildSceneOutputs(store.getStats(), config, new Date());
 */
function buildSceneOutputs(stats, config, now) {
  const outputs = {
    stock: stats.stock,
    remaining_kg: Math.round(stats.stock * config.bagWeight * 10) / 10,
  };
  if (stats.autonomyDays !== null) {
    outputs.autonomy_days = stats.autonomyDays;
  }
  if (stats.dailyRate !== null) {
    outputs.daily_rate = Math.round(stats.dailyRate * 10) / 10;
  }
  if (config.lowStockThreshold > 0 && stats.stock <= config.lowStockThreshold) {
    outputs.days_before_order = 0;
  } else if (stats.orderDate) {
    outputs.days_before_order = Math.round((stats.orderDate.getTime() - now.getTime()) / DAY_MS);
  }
  return outputs;
}

/**
 * @description The scene triggers a change of the stock fires.
 * @param {object} params - The change.
 * @param {number} params.before - The stock before, in bags.
 * @param {number} params.after - The stock after, in bags.
 * @param {object} [params.recorded] - The movement recorded (none for an undo).
 * @param {boolean} [params.fromScene] - Whether a scene action made the change.
 * @param {number} params.lowStockThreshold - The low-stock threshold.
 * @returns {Array<string>} The keys of the triggers to fire.
 * @example
 * detectSceneTriggers({ before: 11, after: 10, lowStockThreshold: 10 }); // -> ['low_stock']
 */
function detectSceneTriggers({ before, after, recorded, fromScene = false, lowStockThreshold }) {
  const triggers = [];
  if (lowStockThreshold > 0 && before > lowStockThreshold && after <= lowStockThreshold) {
    triggers.push(SCENE_TRIGGERS.LOW_STOCK);
  }
  if (before > 0 && after === 0) {
    triggers.push(SCENE_TRIGGERS.STOCK_EMPTY);
  }
  if (recorded && isPalletDelivery(recorded) && !fromScene) {
    triggers.push(SCENE_TRIGGERS.PALLET_DELIVERED);
  }
  return triggers;
}

/**
 * @description The data of a scene trigger: the stock (its device, matched
 * against the trigger's "Stock" field) and the figures, as scene variables.
 * @param {string} stockExternalId - The external id of the stock's device.
 * @param {object} outputs - The buildSceneOutputs() result.
 * @param {object} [recorded] - The movement recorded, for the delivered bags.
 * @returns {object} The flat event data.
 * @example
 * buildSceneEventData('ext:pellet-stock:pellet:stock', outputs);
 */
function buildSceneEventData(stockExternalId, outputs, recorded) {
  const { stock, ...figures } = outputs;
  return {
    stock: stockExternalId,
    bags_left: stock,
    ...figures,
    ...(recorded && recorded.type === 'delivery' && { bags_delivered: recorded.bags }),
  };
}

export { buildSceneOutputs, buildSceneEventData, detectSceneTriggers, SCENE_TRIGGERS };
