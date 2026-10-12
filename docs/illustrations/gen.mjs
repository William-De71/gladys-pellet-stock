// Builds the widget contents of the illustrations with the integration's own
// code: node gen.mjs <repo> <out.json> (run by render.sh)
import { writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const [repo, out] = process.argv.slice(2);
const load = (path) => import(pathToFileURL(`${repo}/${path}`).href);
const { normalizeConfig, withStockSettings } = await load('src/config.js');
const { computeStats, createLedger, recordMovement } = await load('src/ledger.js');
const { buildWidgetContent } = await load('src/widget.js');
const { buildSiloContent } = await load('src/silo-widget.js');
const { buildPriceContent } = await load('src/price-widget.js');

// A winter evening: the illustrations are dated mid-January 2027.
const NOW = new Date('2027-01-18T18:30:00');
const DAY = 86400000;
const at = (daysAgo, hour = 19) => {
  const date = new Date(NOW.getTime() - daysAgo * DAY);
  date.setHours(hour, 0, 0, 0);
  return date;
};

// Bags: two earlier winters (a pallet whenever the stock runs low, at the
// price of its year), then this one: a pallet in October, one in December, a
// few bags bought on their own, about one bag a day in autumn and two in the
// cold weeks. Seeded, so the illustrations are reproducible.
let seed = 7;
const random = () => {
  seed = (seed * 16807) % 2147483647;
  return seed / 2147483647;
};
let ledger = createLedger();
const add = (movement, date, type = 'bags') => {
  ledger = recordMovement(ledger, movement, date, type);
};
// Bags a day, per month (January first): nothing out of the heating season.
const MONTHLY_RATE = [1.8, 1.5, 1.0, 0.5, 0, 0, 0, 0, 0, 0.5, 1.0, 1.6];
const priceOfYear = (date) => (date < new Date('2025-06-01') ? 6.75 : 6.55);
let stock = 10;
add({ type: 'inventory', bags: stock }, at(840));
for (let d = 839; d > 110; d -= 1) {
  const date = at(d);
  if (stock < 10 && MONTHLY_RATE[date.getMonth()] > 0) {
    add({ type: 'delivery', bags: 66, price: 66 * priceOfYear(date), bagWeight: 15 }, at(d, 10));
    stock += 66;
  }
  const used = Math.min(
    stock,
    Math.max(0, Math.round(MONTHLY_RATE[date.getMonth()] + (random() - 0.5) * 1.6)),
  );
  if (used > 0) {
    add({ type: 'consumption', bags: used }, date);
    stock -= used;
  }
}
add({ type: 'inventory', bags: 12 }, at(110));
add({ type: 'delivery', bags: 66, price: 445.5, bagWeight: 15 }, at(105, 10));
for (let d = 104; d >= 0; d -= 1) {
  if (d === 31) add({ type: 'delivery', bags: 66, price: 471.9, bagWeight: 15 }, at(31, 11));
  if (d === 58) add({ type: 'delivery', bags: 5, bagPrice: 7.4, purchase: true }, at(58, 15));
  const rate = d > 70 ? 0.6 : d > 40 ? 1.0 : 1.6;
  const bags = Math.max(0, Math.round(rate + (random() - 0.5) * 1.6));
  if (bags > 0) add({ type: 'consumption', bags }, at(d, d === 0 ? 17 : 19));
}
const bags = ledger;
const bagsConfig = normalizeConfig({ pallet_price: 445.5 });

// Silo: a truck in September, readings every week or so.
ledger = createLedger();
add({ type: 'delivery', bags: 3500, price: 1365 }, at(130, 9), 'bulk');
let level = 3500 + 400;
for (let d = 126; d >= 2; d -= 8) {
  level -= d > 70 ? 140 : 230;
  if (d === 46) {
    add({ type: 'delivery', bags: 3000, price: 1194 }, at(46, 9), 'bulk');
    level += 3000;
  }
  add({ type: 'inventory', bags: Math.round(level / 10) * 10 }, at(d, 18), 'bulk');
}
const silo = ledger;
const siloConfig = withStockSettings(
  normalizeConfig({ bulk_capacity: 6000, bulk_tonne_price: 390 }),
  {},
  'bulk',
);

const contents = {};
for (const language of ['en', 'fr', 'de', 'es']) {
  const statsOf = (l, c) => computeStats(l, NOW, c);
  contents[language] = {
    stock: buildWidgetContent({
      ledger: bags,
      stats: statsOf(bags, bagsConfig),
      config: bagsConfig,
      settings: { chart_view: 'stock', chart_period: '90', season_start: '10' },
      language,
      now: NOW,
    }),
    consumption: buildWidgetContent({
      ledger: bags,
      stats: statsOf(bags, bagsConfig),
      config: bagsConfig,
      settings: {
        chart_view: 'consumption',
        chart_period: '90',
        season_start: '10',
        show_buttons: false,
      },
      language,
      now: NOW,
    }),
    prices: buildPriceContent({
      ledger: bags,
      config: bagsConfig,
      settings: { chart_period: '1095', season_start: '10' },
      language,
      now: NOW,
    }),
    silo: buildSiloContent({
      ledger: silo,
      stats: statsOf(silo, siloConfig),
      config: siloConfig,
      settings: { chart_view: 'stock', chart_period: '365', season_start: '9' },
      language,
      stockName: { en: 'House', fr: 'Maison', de: 'Haus', es: 'Casa' }[language],
      now: NOW,
    }),
  };
}
writeFileSync(out, JSON.stringify({ now: NOW.getTime(), contents }, null, 1));
console.log('ok', Object.keys(contents.en.stock.components.map((c) => c.type)).length);
