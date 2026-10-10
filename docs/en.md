# Pellet Stock

This integration tracks your **wood pellet stock**: deliveries, consumption, average daily consumption and remaining autonomy. It adds a **dashboard widget**, a virtual device for history and scenes, and a scene action.

No hardware and no online account are needed: the integration keeps a ledger of bag movements and derives everything from it.

## Getting started

1. Open the integration's **Configuration** tab and check the bag weight (15 kg by default) and the number of bags per pallet (66 by default).
2. Run the **"Correct the stock"** action and enter the number of bags you currently have.
3. Add the **"Pellet stock"** widget to your dashboard (edit the dashboard → add a box → Pellet stock).

## Day to day

- Tap **"Remove bag(s)"** in the widget each time you fill the stove. A short form opens, filled in with 1 bag: send it, or enter another count.
- Tap **"Add bag(s)"** for bags bought on their own (at a store, say). The form asks for the bags and the **price per bag**, filled in with the last known price; the price is optional.
- Tap **"Pallet delivered"** when a pallet is delivered. The form is filled in with the bags per pallet, the price of a pallet at the last price paid per bag and the **bag weight** of the configuration: correct them if needed, then send. The price is optional; enter 0 for a delivery without a price.
- On a Gladys version without these forms, the buttons remove or add 1 bag, and "Pallet delivered" adds the bags per pallet (a confirmation is asked).
- Wrong tap? **"Undo"** removes the last operation.
- To add several bags at once (half a pallet, a batch of 10 bags…), use the **"Record a delivery"** action of the configuration, where the price paid can be entered too.

You do not have to tap for every bag: **counting the stock** from time to time with "Correct the stock" is enough. The bags missing since the last count are counted as consumed.

## What the widget shows

- **Stock** in bags: green, then orange under the low stock threshold (10 bags by default), red at zero. A "Time to order" reminder then appears.
- **Autonomy** in days.
- A **chart**, picked in the widget settings: the **stock over time**, with the deliveries marked, or the **bags used per day** as bars (per week over 1 year). Period: 1 month, 3 months, 1 year. To see both, put two widgets side by side. The bags found missing by a recount are counted on the day of the recount.
- The **average consumption per day**, the **last bag used** ("2 days ago"), the **remaining weight**, the **last delivery** and the **use since** (in bags and kg).
- The date to **order by** (when the stock will reach the low stock threshold) and the **estimated date** the stock runs out.
- Once a price is known: the **stock value**, with the **price per bag and per kg**, and the **cost per month**. The price paid for the last delivery counts, or else the **pallet price** of the configuration. The price per kg follows the weight of the bags of that delivery.
- The **season cost**: what the bags used since the heating season started cost (October by default, set in the widget settings), with their count.

Only deliveries ("Pallet delivered", the "Record a delivery" action) count as deliveries: bags added with "Add bag(s)", even several at once, are neither marked on the chart nor used for "Last delivery" and the use since. They do enter the stock and its cost.

In the widget settings, you can **hide the buttons**, for instance for a read-only wall display.

## Heating cost

The oldest bags go first ("first in, first out"): each bag used costs the price it was bought at. If you bought 40 bags at €6 then 60 bags at €8, the first 40 bags used count €6 each, the next ones €8.

- A delivery entered without a price takes the **last price per bag known**.
- The stock entered at first with "Correct the stock" has no price: it takes the **pallet price** of the configuration or, without one, is told apart ("12 unpriced"). "Correct the stock" takes an optional **price per bag** for the bags counted above the recorded stock.
- The **remaining weight** and the use in kg follow the weight of the bags of each delivery.

For a given period, run the **"Analyze the cost"** action with a start and an end date (DD/MM/YYYY): "From 01/10/2026 to 01/06/2027: 100 bags, 1,500 kg, €712 (€0.47/kg)".

## How the autonomy is computed

The average consumption is computed over the **last 14 days** (3 to 90 days, set in the configuration). Shorter follows the weather faster; longer is steadier.

- With **less than one day of history**, the autonomy stays unknown (a dash is shown): a single bag used is not enough to extrapolate.
- With **no consumption at all** over the period (in summer, say), the autonomy is unknown too.

## "Pellet stock" device (optional)

From the **Discover** tab, you can add the **"Pellet stock"** device. It exposes two values with history:

- **Pellet stock** (number of bags);
- **Pellet autonomy** (days).

It lets you show the history in a regular chart box and, above all, build **scenes**: for instance "when the stock drops below 10 bags, send me a message". An unknown autonomy is never sent as 0, so an "empty stock" scene never fires by mistake.

The widget works without this device.

## Several houses

To follow the pellets of another house (a holiday home, a chalet…), run the **"Add a stock"** action in the configuration and pick the house in the list of the houses of Gladys. The stock takes the name of the house, one stock per house. Each stock has its own history and its own device:

1. In the **Discovery** tab, add the **"Pellet stock – Chalet"** device (with the name of the house) and put it in a room of that house.
2. Run **"Correct the stock"** with this stock selected, to enter its current bags.
3. Add a **"Pellet stock"** widget and pick this stock in its settings. Its name shows in the chart title.

The configuration actions and the scene action have a **Stock** field: left empty, they apply to the main stock. A Zigbee button in the chalet can thus count down the chalet's stock only.

The settings of the configuration (bag weight, bags per pallet, threshold, window, pallet price) are the **default settings** of every stock. For a stock to have others (10 kg bags at the chalet, say), run **"Set up a stock"**: fill in only the settings to change, the others keep their value. The answer lists the settings in use, the stock's own or the defaults. The **"Back to the defaults"** option drops the stock's own settings.

The main stock, and the stocks added with a name in an earlier version, can be attached to a house with **"Attach a stock to a house"**: they take the name of the house, and keep their device and their history.

To read the names of the houses, the integration asks for access to the houses of Gladys (shown on install); it does not use their coordinates.

**"Remove a stock"** removes an added stock and its history; the main stock cannot be removed.

## Silo (bulk pellets)

For a boiler fed from a silo, run **"Add a stock"** with the **Silo (bulk)** type and the house. A silo counts in **kg** and has its own widget, **"Pellet silo"**, and its own device, **"Pellet silo – House"** (level in kg, fill in %, autonomy). A house may have a stock of bags and a silo.

- **"Delivery"**: the kg delivered (filled in with the usual delivery) and the price paid.
- **"Level reading"**: the level read on the silo, in kg or in % of its capacity (the "Level reading" setting). A level lower than the last one counts as consumption: the use per day, the autonomy, the order date and the season cost work as for the bags.
- **"Undo"** removes the last operation.

The widget shows the level (in tonnes from 1,000 kg), the autonomy, the level over time or the kg used per day, the fill, the last reading, the last delivery, the stock value and the price per kg, the cost per month and of the season, and the date to order by.

The defaults of the silos are in the **"Silo"** section of the configuration: capacity, low stock threshold (kg), usual delivery, price per tonne, reading in kg or in %. "Set up a stock" changes them for one silo. Without a stock picked, the silo widget and scene actions take the only silo.

Two scene actions, **"Record a silo delivery"** and **"Read the silo level"**, can for instance feed the level from a sensor. The scene triggers count in bags and leave the silos out: for an alert, use the silo's device ("silo level below…").

## Scenes

### Actions

- **"Use pellet bags"** removes bags from the stock. Example: a Zigbee button next to the stove, triggering a scene that removes one bag at each press. The action fails when the recorded stock is too low: count your stock again.
- **"Add pellet bags"** adds bags (a delivery, bags bought on their own), with an optional price per bag and bag weight.
- **"Correct the pellet stock"** sets the stock to the number of bags counted.
- **"Read the pellet stock"** changes nothing: it gets the figures for the rest of the scene, for instance a weekly message. It also returns the **type** of the stock (`bags` or `bulk`), its **unit** (`bag` or `kg`) and the **season cost**: the cost (€), the bags (kg for a silo) and kg used since the season started (October by default, set in the action), and those without a known price.

Each action has a **Stock** field (empty: the main stock) and returns to the next actions the **bags left**, the **autonomy** (days), the **bags per day**, the **days before ordering** and the **remaining weight** (kg). A figure still unknown (the autonomy with no consumption yet, say) is left out rather than sent as 0.

### Triggers

- **"Pellet stock low"**: the stock falls to the low stock threshold of the configuration. It fires once, when crossing the threshold, not at every bag below it.
- **"Pellet stock empty"**: the last bag was used.
- **"Pellet pallet delivered"**: a delivery of several bags was recorded from the widget or the configuration.

Each trigger has a **Stock** field (empty: every stock) and gives the same figures as the actions, plus the **bags delivered** for the pallet. Example: "Pellet stock low → send me "{{triggerEvent.data.bags_left}} bags left, time to order"".

A delivery added by a scene does not fire "Pallet delivered", so that a scene can never restart itself in a loop. The low and empty stock triggers fire whatever the origin, a Zigbee button going through a scene included.

## Backup

The movement ledger (the last 2,000; beyond, the oldest ones are summed up, keeping the price of the bags still in stock) is stored in the Gladys database: it is part of the **Gladys backups** and survives an update of the integration. It is deleted if you uninstall the integration.
