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

// Key stored the same way: the stocks, as `[{ id, type, house, settings,
// ledger }]` (see src/stocks.js). The main stock is listed only once it has a
// house or settings of its own.
const STOCKS_CONFIG_KEY = 'stocks';

// What a stock holds. A silo (`bulk`, in kg) is to come.
const STOCK_TYPES = {
  BAGS: 'bags',
};

const DEFAULTS = {
  // The common retail bag in France: 15 kg.
  bagWeight: 15,
  // A standard pallet of 15 kg bags: 66 bags, about one tonne.
  palletSize: 66,
  lowStockThreshold: 10,
  // Days of history used to compute the average consumption: long enough to
  // smooth a cold weekend, short enough to follow the season.
  consumptionWindow: 14,
  // No price until the user enters one: the cost rows stay hidden. The price
  // of the last delivery entered with one wins over this configured one.
  palletPrice: null,
  bagPrice: null,
};

const LIMITS = {
  bagWeight: { min: 1, max: 50 },
  palletSize: { min: 1, max: 200 },
  lowStockThreshold: { min: 0, max: 1000 },
  consumptionWindow: { min: 3, max: 90 },
  palletPrice: { min: 0, max: 5000 },
  // The price paid for a whole delivery: up to the 1,000 bags of a movement.
  deliveryPrice: { min: 0, max: 20000 },
  // The price of one bag, for bags bought on their own.
  bagPrice: { min: 0, max: 100 },
  // Upper bound of a single movement, to catch a typo (660 instead of 66).
  movementBags: { min: 1, max: 1000 },
  stockBags: { min: 0, max: 10000 },
  // The name of a stock added before the houses (versions up to 1.2).
  stockName: { min: 1, max: 24 },
  // Stocks added next to the default one: a house may hold two (bags, silo).
  extraStocks: { max: 19 },
};

// Movement types of the ledger.
const MOVEMENT_TYPES = {
  DELIVERY: 'delivery',
  CONSUMPTION: 'consumption',
  INVENTORY: 'inventory',
  // Stands for the movements compacted away: the stock and its lots then.
  OPENING: 'opening',
};

// Beyond this count, the oldest movements are compacted into an opening one
// that keeps the lots still in stock (see src/cost.js): a year of heavy use
// (5 taps a day all winter) fits, so the last pallet and the one-year chart
// are never cut. About 200 KB of JSON: the core stores it as TEXT, and its host
// API takes bodies up to 20 MB.
const MAX_LEDGER_MOVEMENTS = 2000;

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
// an existing device keeps its history), a stock added for a house the id
// `<house selector>:<type>`, and one added before the houses a random id,
// kept when it is attached to a house: Gladys cannot change the external id
// of a device, and its history hangs on it.
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
  STOCK_TYPES,
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
