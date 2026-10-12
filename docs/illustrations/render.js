// Renders integration widget contents the way the Gladys front does
// (front/src/components/boxs/external-widget, ExternalWidgetBox +
// WidgetComponents), in plain DOM, with the same class names and the same
// ApexCharts options. Query: ?lang=fr&cards=stock,consumption&form=stock:delivery&theme=dark
/* global ApexCharts, DATA */
const params = new URLSearchParams(location.search);
const LANG = params.get('lang') || 'en';
const CARDS = (params.get('cards') || 'stock').split(',');
// `<card>:<action key>`: the form open on that card only, e.g. stock:delivery
const [FORM_CARD, FORM] = (params.get('form') || ':').split(':');
const TITLES = {
  stock: { en: 'Pellet stock', fr: 'Stock de pellets', de: 'Pelletvorrat', es: 'Stock de pellets' },
  silo: { en: 'Pellet silo', fr: 'Silo de pellets', de: 'Pelletsilo', es: 'Silo de pellets' },
};
const ICONS = { stock: 'package', silo: 'database' };
const FORM_BUTTONS = {
  en: ['Close', 'Send'],
  fr: ['Fermer', 'Envoyer'],
  de: ['Schließen', 'Senden'],
  es: ['Cerrar', 'Enviar'],
};

// The "now" of the contents: the chart markers and relative dates match it.
const realNow = Date.now;
Date.now = () => DATA.now;

const text = (value) =>
  value && typeof value === 'object' ? (value[LANG] ?? value.en ?? '') : (value ?? '');
const formatNumber = (value) =>
  typeof value === 'number'
    ? new Intl.NumberFormat(LANG, { maximumFractionDigits: 2 }).format(value)
    : (value ?? '');
const COLOR = {
  neutral: 'colorNeutral',
  primary: 'colorPrimary',
  success: 'colorSuccess',
  warning: 'colorWarning',
  danger: 'colorDanger',
  info: 'colorInfo',
};
const el = (tag, cls, children = []) => {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  for (const child of [].concat(children)) {
    if (child === null || child === undefined || child === false) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
};
const icon = (name, cls = '') => el('i', `fe fe-${name} ${cls}`);

function splitIntoSlots(components) {
  const slots = { header: [], tiles: [], focal: null, body: null, status: null, buttons: [] };
  for (const c of components) {
    if (c.type === 'text') c.variant === 'body' ? (slots.body = c) : slots.header.push(c);
    else if (c.type === 'value' || c.type === 'gauge') slots.tiles.push(c);
    else if (['chart', 'card-list', 'image'].includes(c.type)) slots.focal = c;
    else if (c.type === 'status') slots.status = c;
    else if (c.type === 'button') slots.buttons.push(c);
  }
  return slots;
}

function tiles(components) {
  return el(
    'div',
    'tilesBox',
    el(
      'div',
      `tiles tilesCount${Math.min(components.length, 6)}`,
      components.map((c) =>
        el('div', 'tile', [
          c.icon ? icon(c.icon, `tileIcon ${COLOR[c.color] || ''}`) : null,
          el('span', `tileValue ${COLOR[c.color] || ''}`, [
            formatNumber(c.value),
            c.unit ? el('span', 'tileUnit', text(c.unit)) : null,
          ]),
          c.label ? el('span', 'tileLabel', text(c.label)) : null,
        ]),
      ),
    ),
  );
}

const ANNOTATION_COLORS = {
  neutral: '#667081',
  primary: '#467fcf',
  success: '#2e8f5b',
  warning: '#f68f00',
  danger: '#d63939',
  info: '#45aaf2',
};
const annotationLabel = (label, color, textAnchor = 'middle') => ({
  text: label,
  borderColor: color,
  orientation: 'horizontal',
  position: 'top',
  textAnchor,
  style: {
    background: color,
    color: '#fff',
    fontSize: '10px',
    fontWeight: 600,
    padding: { left: 4, right: 4 },
  },
});

function chart(component) {
  const box = el('div', null, [
    component.title ? el('div', 'caption mb-1', text(component.title)) : null,
  ]);
  const target = el('div');
  box.append(target);
  const series = component.series.map((s, i) => ({
    name: text(s.name) || `${i + 1}`,
    data: s.points.map((p) => [new Date(p.t).getTime(), p.v]),
  }));
  let min = Infinity;
  let max = -Infinity;
  series.forEach((s) =>
    s.data.forEach(([t]) => {
      min = Math.min(min, t);
      max = Math.max(max, t);
    }),
  );
  const anchor = (x) => (x > max - (max - min) * 0.08 ? 'end' : 'middle');
  const xaxis = [];
  const points = [];
  for (const a of component.annotations || []) {
    const x = new Date(a.t).getTime();
    const color = ANNOTATION_COLORS[a.color] || ANNOTATION_COLORS.neutral;
    const label = text(a.label);
    if (typeof a.value === 'number') {
      points.push({
        x,
        y: a.value,
        marker: { size: 4, fillColor: '#fff', strokeColor: color, strokeWidth: 2 },
        ...(label ? { label: annotationLabel(label, color, anchor(x)) } : {}),
      });
    } else {
      xaxis.push({
        x,
        borderColor: color,
        strokeDashArray: 0,
        ...(label ? { label: annotationLabel(label, color, anchor(x)) } : {}),
      });
    }
  }
  const yAxisFormatter = (value) => {
    if (value === null || value === undefined || Number.isNaN(value)) return value;
    if (value === 0) return '0';
    const rounded = parseFloat(value.toPrecision(4));
    if (Math.abs(rounded) < 0.001 || Math.abs(rounded) >= 1e9) return rounded.toExponential(2);
    return value.toFixed(2);
  };
  const isBar = component.chart_type === 'bar';
  const options = {
    chart: {
      locales: window.APEX_LOCALES,
      defaultLocale: LANG,
      type: isBar ? 'bar' : 'line',
      fontFamily: 'inherit',
      height: 200,
      parentHeightOffset: 0,
      sparkline: { enabled: false },
      toolbar: { show: false },
      animations: { enabled: false },
      ...(isBar ? { stacked: true, zoom: { enabled: true } } : {}),
    },
    ...(isBar ? { plotOptions: { bar: { columnWidth: '90%' } } } : {}),
    dataLabels: { enabled: false },
    fill: { opacity: 1 },
    ...(isBar ? {} : { stroke: { width: 2, curve: 'stepline' } }),
    series,
    grid: isBar
      ? {
          padding: { top: -20, right: 0, left: -4, bottom: -4 },
          strokeDashArray: 4,
          xaxis: { lines: { show: true } },
        }
      : { strokeDashArray: 4, padding: { left: -4 } },
    xaxis: {
      labels: { padding: 0, datetimeUTC: false },
      tooltip: { enabled: false },
      axisBorder: { show: false },
      type: 'datetime',
    },
    yaxis: { labels: { padding: 4, formatter: yAxisFormatter } },
    colors: ['#316cbe', '#d63031', '#00b894', '#fdcb6e', '#6c5ce7'],
    legend: { show: true, position: 'bottom' },
    annotations: { xaxis, points },
  };
  requestAnimationFrame(() => {
    window.PENDING_CHARTS += 1;
    new ApexCharts(target, options).render().then(() => {
      window.PENDING_CHARTS -= 1;
    });
  });
  return box;
}

function statusList(component) {
  return el(
    'ul',
    'statusList',
    component.items.map((item) =>
      el('li', 'statusRow', [
        item.icon
          ? icon(item.icon, `statusIcon ${COLOR[item.color || 'neutral']}`)
          : el('span', `statusDot ${COLOR[item.color || 'neutral']}`),
        el('span', 'statusLabel', text(item.label)),
        el('span', 'statusValue', formatNumber(text(item.value))),
      ]),
    ),
  );
}

function buttons(components, formOpen) {
  return el(
    'div',
    'buttons',
    components.map((c) => {
      const open = formOpen && FORM && c.action && c.action.key === FORM;
      const node = el(
        'button',
        `button ${c.style === 'primary' ? 'buttonPrimary' : ''} ${c.style === 'danger' ? 'buttonDanger' : ''} ${open ? 'buttonOpen' : ''}`,
        [
          el('span', 'buttonIcon', icon(c.icon || 'play')),
          el('span', 'buttonLabel', text(c.label)),
        ],
      );
      node.type = 'button';
      return node;
    }),
  );
}

// The config_schema engine renders a number field as a Tabler form group.
function actionForm(component) {
  const fields = component.action.fields.map((field) => {
    const id = `f-${field.key}`;
    const input = el('input', 'form-control');
    input.type = 'number';
    input.id = id;
    if (field.default !== undefined) input.value = field.default;
    const label = el('label', 'form-label', [
      text(field.label),
      field.required ? el('span', 'form-required', ' *') : null,
    ]);
    label.htmlFor = id;
    return el('div', 'form-group', [
      label,
      input,
      field.description ? el('small', 'form-text text-muted', text(field.description)) : null,
    ]);
  });
  const [close, send] = FORM_BUTTONS[LANG];
  return el('form', 'actionForm', [
    el('div', 'actionFormTitle', [
      icon(component.icon || 'play'),
      el('span', null, text(component.label)),
    ]),
    ...fields,
    el('div', 'actionFormButtons', [
      el('button', 'btn btn-secondary', close),
      el('button', 'btn btn-primary', send),
    ]),
  ]);
}

function card(name) {
  const content = DATA.contents[LANG][name];
  const kind = name === 'silo' ? 'silo' : 'stock';
  const slots = splitIntoSlots(content.components);
  const formOpen = FORM_CARD === name;
  const formButton = formOpen && slots.buttons.find((b) => b.action && b.action.key === FORM);
  return el('div', 'card', [
    el(
      'div',
      'card-header',
      el('h3', 'card-title', [icon(ICONS[kind]), el('span', 'm-1', TITLES[kind][LANG])]),
    ),
    el(
      'div',
      'card-body',
      el('div', 'slots', [
        slots.header.length ? null : null,
        slots.tiles.length ? tiles(slots.tiles) : null,
        slots.focal && slots.focal.type === 'chart' ? chart(slots.focal) : null,
        slots.status ? statusList(slots.status) : null,
        slots.buttons.length ? buttons(slots.buttons, formOpen) : null,
        formButton ? actionForm(formButton) : null,
      ]),
    ),
  ]);
}

window.PENDING_CHARTS = 0;
const row = document.getElementById('row');
for (const name of CARDS) {
  row.append(el('div', 'col', card(name)));
}
setTimeout(() => {
  const wait = () => {
    if (window.PENDING_CHARTS === 0) {
      document.body.dataset.ready = '1';
      Date.now = realNow;
    } else setTimeout(wait, 50);
  };
  wait();
}, 100);
