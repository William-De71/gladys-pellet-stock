# CLAUDE.md

Project rules for coding assistants (Claude Code reads this file) and for human
contributors.

## What this is

A Gladys Assistant **external integration** tracking a wood pellet stock (bags
or a bulk silo, one per house): a Node.js service (Node 22+, ESM, no build
step) that runs in its own sandboxed Docker container and talks to Gladys
through
[`@gladysassistant/integration-sdk`](https://github.com/GladysAssistant/integration-sdk-js),
its only runtime dependency. No hardware, no cloud: everything is derived from
a ledger of movements.

## Commands

```bash
npm ci
npm test                                  # node --test, the built-in runner
node --test test/widget.test.js           # one file
npm run lint                              # ESLint
npm run format:check                      # Prettier, as the CI runs it
npm run format                            # Prettier, fix in place
npx github:GladysAssistant/integration-store . --skip-image-check   # store checks
node .github/scripts/release.mjs plan     # the version the next release would get
```

## Architecture

```
index.js                SDK wiring and lifecycle, hourly refresh
src/handlers.js         actions, scene actions, widgets, discovery handlers
src/stocks.js           the stocks: the main one, the ones added per house, their settings
src/store.js            one stock: persistence, device states, scene triggers
src/ledger.js           the ledger and every figure derived from it (pure functions)
src/cost.js             first in, first out cost
src/widget.js           "Pellet stock" widget content
src/silo-widget.js      "Pellet silo" widget content
src/price-widget.js     "Pellet prices" widget content (price history, seasons compared)
src/scene.js            scene action outputs, trigger transitions
src/device.js           the devices and their states
src/config.js           config normalization, per-stock settings
src/i18n.js             runtime texts, en / fr / de / es
gladys-assistant-integration.json   manifest
docs/{en,fr,de,es}.md   user documentation, re-hosted by the store
.github/scripts/release.mjs         version, changelog, bump (tested in test/)
docs/illustrations/render.sh        regenerates the widget illustrations (docs/assets)
```

## Rules

- **External ids are forever**, and so is every key users store: device and
  feature external ids, feature `category` / `type` / `unit` / `min` / `max` /
  `step`, the keys of `config_schema`, `actions`, widgets and their settings,
  scene triggers (fields, variables) and scene actions (fields, outputs), and
  the config keys holding the ledgers (`stock_ledger*`, `stocks`).
  `test/structure.test.js` compares them to `test/fixtures/discovery.baseline.json`:
  never update the baseline to make a test pass without a documented migration.
- **The container rootfs is read-only.** Write only under `/data`. The ledgers
  live in Gladys (`setConfig`), not in `/data`.
- **Never publish an unknown figure as 0** (autonomy, rate): a 0 fires the
  "empty" scenes. Never fire a scene trigger as a consequence of a scene action
  (the "no loop" rule).
- **Four languages.** Every user-facing text (manifest, runtime messages in
  `src/i18n.js`, `docs/*.md`, README) exists in English, French, German and
  Spanish. `test/i18n.test.js` checks it, and validates the widget contents in
  each language.
- **Versions belong to the Release workflow**: never edit `version` in
  `package.json`, the lockfile or the manifest, nor the `docker_image` tag.
- **Changelog.** Never edit CHANGELOG.md by hand, it is generated at the
  release. Write the PR title as the line the user will read.
- **Commits and PR titles** follow Conventional Commits, in English: `feat` ->
  minor, `fix` / `perf` -> patch, `!` or `BREAKING CHANGE:` -> major (minor
  below 1.0.0); `docs`, `chore`, `ci`, `test`, `style`, `refactor`, `build`
  release nothing. Scope `security` lands under "Security", a description
  starting with "remove" / "drop" under "Removed".
- **Manifest.** Texts are objects `{ "en", "fr", "de", "es" }`; the catalog
  `description` holds 10 to 100 characters per language, widget labels 3 to 30. A field older cores do not know needs a higher `gladys_version` minimum
  (see `src/constants.js` of the integration-store); it is `>=5.2.0` today
  (widget action forms, `source: "houses"`).
- **Style.** Prettier formats, ESLint catches mistakes. Comments explain why,
  in English. Tests never touch the network.
