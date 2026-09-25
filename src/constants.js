// -----------------------------------------------------------------------------
// Shared constants of the Pellet Stock integration.
// -----------------------------------------------------------------------------

// Keys of the manifest `config_schema`, filled by the user.
const CONFIG_KEYS = {
  BAG_WEIGHT: 'bag_weight',
  PALLET_SIZE: 'pallet_size',
  LOW_STOCK_THRESHOLD: 'low_stock_threshold',
  CONSUMPTION_WINDOW: 'consumption_window',
  PALLET_PRICE: 'pallet_price',
};

// Key stored through setConfig() OUTSIDE the config_schema: the ledger of
// stock movements. Config values live in the Gladys database (t_variable), so
// the stock survives a container rebuild and travels in the Gladys backups —
// which a file in /data would not.
const LEDGER_CONFIG_KEY = 'stock_ledger';

// Key stored the same way: the stocks added next to the default one, as
// `[{ id, name }]`. Each one keeps its ledger under `stock_ledger_<id>`.
const STOCKS_CONFIG_KEY = 'stocks';

const DEFAULTS = {
  // The common retail bag in France: 15 kg.
  bagWeight: 15,
  // A standard pallet of 15 kg bags: 66 bags, about one tonne.
  palletSize: 66,
  lowStockThreshold: 10,
  // Days of history used to compute the average consumption: long enough to
  // smooth a cold weekend, short enough to follow the season.
  consumptionWindow: 14,
  // No price until the user enters one: the cost rows stay hidden. Derived
  // from the pallet price, which is a whole number of euros.
  bagPrice: null,
};

const LIMITS = {
  bagWeight: { min: 1, max: 50 },
  palletSize: { min: 1, max: 200 },
  lowStockThreshold: { min: 0, max: 1000 },
  consumptionWindow: { min: 3, max: 90 },
  palletPrice: { min: 0, max: 5000 },
  // Upper bound of a single movement, to catch a typo (660 instead of 66).
  movementBags: { min: 1, max: 1000 },
  stockBags: { min: 0, max: 10000 },
  // Fits the chart title (40) next to "· Stock (bags)".
  stockName: { min: 1, max: 24 },
  // Stocks added next to the default one.
  extraStocks: { max: 9 },
};

// Movement types of the ledger.
const MOVEMENT_TYPES = {
  DELIVERY: 'delivery',
  CONSUMPTION: 'consumption',
  INVENTORY: 'inventory',
};

// Oldest movements are dropped beyond this count: a season of daily taps
// fits, and the stored JSON stays a few tens of KB.
const MAX_LEDGER_MOVEMENTS = 500;

// Key of the dashboard widget declared in the manifest.
const WIDGET_KEY = 'pellet_stock';

// Keys of the widget buttons (`^[a-z0-9_]{2,32}$`).
const WIDGET_ACTIONS = {
  CONSUME: 'consume',
  ADD_BAG: 'add_bag',
  DELIVERY: 'delivery',
  UNDO: 'undo',
};

// One device per stock. There is no hardware behind it: the default stock
// has the fixed platform id below (the one of the single-stock versions, so
// an existing device keeps its history), the added ones a random id.
const DEVICE_TYPE = 'pellet';
const DEVICE_ID = 'stock';
const FEATURE_KEYS = {
  STOCK: 'bags',
  AUTONOMY: 'autonomy',
};

// The autonomy moves with time even without any movement (the consumption
// window slides): it is recomputed on this period.
const REFRESH_INTERVAL_MS = 60 * 60 * 1000;

const DAY_MS = 24 * 60 * 60 * 1000;

export {
  CONFIG_KEYS,
  LEDGER_CONFIG_KEY,
  STOCKS_CONFIG_KEY,
  DEFAULTS,
  LIMITS,
  MOVEMENT_TYPES,
  MAX_LEDGER_MOVEMENTS,
  WIDGET_KEY,
  WIDGET_ACTIONS,
  DEVICE_TYPE,
  DEVICE_ID,
  FEATURE_KEYS,
  REFRESH_INTERVAL_MS,
  DAY_MS,
};
