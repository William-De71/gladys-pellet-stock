# Gladys Pellet Stock

External [Gladys Assistant](https://gladysassistant.com) integration that tracks a **wood pellet stock**:
deliveries, consumption, average daily consumption and autonomy — with a **dashboard widget** built on the
widgets of `@gladysassistant/integration-sdk` 0.14.

No hardware and no cloud account: the integration keeps a ledger of bag movements and derives everything from it.

## Features

- **Dashboard widget** "Pellet stock": stock and autonomy tiles, a step chart of the stock with the deliveries
  marked, bags per day, remaining weight, last delivery and estimated empty date, and four buttons — **−1 bag**,
  **+1 bag**, **Pallet delivered** (asks for confirmation) and **Undo**. The buttons can be hidden per widget, for a
  read-only wall display.
- **Configuration actions**: correct the stock (counted bags), record a delivery or a consumption of any size,
  undo the last operation.
- **Scene action** "Use pellet bags": a Zigbee button next to the stove can decrement the stock through a scene.
  It returns the bags left and the autonomy to the next actions of the scene.
- **Virtual device** "Pellet stock" (offered on the Discovery screen, optional): stock (bags) and autonomy (days)
  features with history — for the chart box and for scenes such as "stock below 10 bags → send me a message".

## How the figures are computed

- A **downward correction** of the stock counts as consumption: counting the stock every other week is enough to
  get a consumption rate, tapping "−1 bag" is not mandatory.
- The **daily consumption** is averaged over the last _N_ days (14 by default, configurable), or over the known
  history when it is shorter. Under one day of history it stays unknown rather than extrapolating a single tap.
- The **autonomy** is the stock divided by that rate. Without any consumption in the window (summer), it is
  unknown — shown as a dash, never published as 0 (a 0 would fire the "empty stock" scenes).

## Storage

The ledger (last 500 movements) is stored in the integration config through `setConfig()`, under a key outside
the `config_schema`. It lives in the Gladys database, so it is part of the Gladys backups and survives a
container rebuild.

## Requirements

A Gladys version with dashboard widgets and scene actions support for external integrations (`gladys_version`
`>=5.2.0`).

## Development

```bash
npm install
npm test          # unit tests (node --test)
npm run lint      # eslint
npm run format    # prettier
```

`DEBUG=gladys-integration-sdk` makes the SDK validate every widget content against the core vocabulary and
budget, and log what the core would drop.

## License

[Apache-2.0](LICENSE)
