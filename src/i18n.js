// -----------------------------------------------------------------------------
// Texts of the integration, in French and English.
//
// Two ways out:
//   - `message(key, params)` builds a multi-language object `{ en, fr }`: the
//     core picks the user's language (action results, toasts, the widget's
//     static labels);
//   - `translate(language, key, params)` resolves ONE language, for the texts
//     where numbers or dates must be formatted in that language.
// -----------------------------------------------------------------------------

const MESSAGES = {
  en: {
    // Action results and errors
    invalid_count: 'Enter a whole number of bags between {min} and {max}.',
    not_enough_stock: 'Only {stock} bag(s) in stock: count your stock first ("Correct the stock").',
    unknown_movement: 'Unknown stock operation.',
    nothing_to_undo: 'Nothing to undo.',
    delivery_recorded: '{bags} bag(s) added — {stock} in stock.',
    consumption_recorded: '{bags} bag(s) used — {stock} left.',
    inventory_recorded: 'Stock set to {stock} bag(s).',
    undo_done: 'Last operation undone — {stock} bag(s) in stock.',
    // Widget
    stock: 'Stock',
    autonomy: 'Autonomy',
    per_day: 'Per day',
    unit_bags: 'bags',
    unit_days: 'd',
    unit_per_day: 'bag/d',
    remaining_weight: 'Remaining weight',
    last_delivery: 'Last delivery',
    empty_around: 'Empty around',
    no_consumption: 'No consumption',
    low_stock: 'Low stock',
    order_now: 'Time to order',
    chart_title: 'Stock (bags)',
    empty_state:
      'No stock recorded yet. Tap "+1 bag" or "Pallet delivered", or set your current stock from the integration configuration ("Correct the stock").',
    button_consume: '−1 bag',
    button_add_bag: '+1 bag',
    button_delivery: 'Pallet delivered',
    button_undo: 'Undo',
    last_delivery_value: '{date} (+{bags})',
    // Device
    device_name: 'Pellet stock',
    feature_stock: 'Pellet stock',
    feature_autonomy: 'Pellet autonomy',
  },
  fr: {
    invalid_count: 'Indiquez un nombre entier de sacs entre {min} et {max}.',
    not_enough_stock:
      'Seulement {stock} sac(s) en stock : recomptez votre stock (« Corriger le stock »).',
    unknown_movement: 'Opération de stock inconnue.',
    nothing_to_undo: 'Rien à annuler.',
    delivery_recorded: '{bags} sac(s) ajouté(s) — {stock} en stock.',
    consumption_recorded: '{bags} sac(s) utilisé(s) — il en reste {stock}.',
    inventory_recorded: 'Stock fixé à {stock} sac(s).',
    undo_done: 'Dernière opération annulée — {stock} sac(s) en stock.',
    stock: 'Stock',
    autonomy: 'Autonomie',
    per_day: 'Par jour',
    unit_bags: 'sacs',
    unit_days: 'j',
    unit_per_day: 'sac/j',
    remaining_weight: 'Poids restant',
    last_delivery: 'Dernière livraison',
    empty_around: 'Vide vers le',
    no_consumption: 'Aucune conso',
    low_stock: 'Stock bas',
    order_now: 'Pensez à commander',
    chart_title: 'Stock (sacs)',
    empty_state:
      "Aucun stock enregistré. Appuyez sur « +1 sac » ou « Palette livrée », ou indiquez votre stock actuel depuis la configuration de l'intégration (« Corriger le stock »).",
    button_consume: '−1 sac',
    button_add_bag: '+1 sac',
    button_delivery: 'Palette livrée',
    button_undo: 'Annuler',
    last_delivery_value: '{date} (+{bags})',
    device_name: 'Stock de pellets',
    feature_stock: 'Stock de pellets',
    feature_autonomy: 'Autonomie pellets',
  },
};

const LANGUAGES = Object.keys(MESSAGES);

/**
 * @description Pick a supported language, English being the fallback.
 * @param {string} [language] - An ISO 639-1 code.
 * @returns {string} `fr` or `en`.
 * @example
 * resolveLanguage('fr-FR'); // -> 'fr'
 */
function resolveLanguage(language) {
  const code = typeof language === 'string' ? language.slice(0, 2).toLowerCase() : 'en';
  return LANGUAGES.includes(code) ? code : 'en';
}

/**
 * @description Translate a message into one language.
 * @param {string} language - An ISO 639-1 code.
 * @param {string} key - The message key.
 * @param {object} [params] - Values substituted for `{name}` placeholders.
 * @returns {string} The translated text (the key itself when unknown).
 * @example
 * translate('fr', 'inventory_recorded', { stock: 40 }); // -> 'Stock fixé à 40 sac(s).'
 */
function translate(language, key, params = {}) {
  const template = MESSAGES[resolveLanguage(language)][key] ?? MESSAGES.en[key] ?? key;
  return template.replace(/\{(\w+)\}/g, (match, name) =>
    params[name] === undefined ? match : String(params[name]),
  );
}

/**
 * @description Build a multi-language message, the core picking the language.
 * @param {string} key - The message key.
 * @param {object} [params] - Values substituted for `{name}` placeholders.
 * @returns {{en: string, fr: string}} The multi-language message.
 * @example
 * message('nothing_to_undo'); // -> { en: 'Nothing to undo.', fr: 'Rien à annuler.' }
 */
function message(key, params = {}) {
  return Object.fromEntries(
    LANGUAGES.map((language) => [language, translate(language, key, params)]),
  );
}

export { MESSAGES, resolveLanguage, translate, message };
