# Pellet Stock

This integration tracks your **wood pellet stock**: deliveries, consumption, average daily consumption and remaining autonomy. It adds a **dashboard widget**, a virtual device for history and scenes, and a scene action.

No hardware and no online account are needed: the integration keeps a ledger of bag movements and derives everything from it.

## Getting started

1. Open the integration's **Configuration** tab and check the bag weight (15 kg by default) and the number of bags per pallet (66 by default).
2. Run the **"Correct the stock"** action and enter the number of bags you currently have.
3. Add the **"Pellet stock"** widget to your dashboard (edit the dashboard → add a box → Pellet stock).

## Day to day

- Tap **"−1 bag"** in the widget each time you fill the stove.
- Tap **"+1 bag"** for each bag bought on its own (at a store, say).
- Tap **"Pallet delivered"** when a pallet is delivered: the number of bags per pallet is added (a confirmation is asked).
- Wrong tap? **"Undo"** removes the last operation.
- To add several bags at once (half a pallet, a batch of 10 bags…), use the **"Record a delivery"** action of the configuration.

You do not have to tap for every bag: **counting the stock** from time to time with "Correct the stock" is enough. The bags missing since the last count are counted as consumed.

## What the widget shows

- **Stock** in bags: green, then orange under the low stock threshold (10 bags by default), red at zero. A "Time to order" reminder then appears.
- **Autonomy** in days.
- A **chart**, picked in the widget settings: the **stock over time**, with the deliveries marked, or the **bags used per day** as bars (per week over 1 year). Period: 1 month, 3 months, 1 year. To see both, put two widgets side by side. The bags found missing by a recount are counted on the day of the recount.
- The **average consumption per day**, the **last bag used** ("2 days ago"), the **remaining weight**, the **last delivery** and the **use since** (in bags and kg).
- The date to **order by** (when the stock will reach the low stock threshold) and the **estimated date** the stock runs out.
- If you enter the **pallet price** in the configuration: the **stock value** and the **cost per month**.

Only deliveries of several bags (a pallet, a batch…) count as deliveries: bags added one by one are neither marked on the chart nor used for "Last delivery" and the use since.

In the widget settings, you can **hide the buttons**, for instance for a read-only wall display.

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

To follow the pellets of another house (a holiday home, a chalet…), run the **"Add a stock"** action in the configuration and give it a name. Each stock has its own history and its own device:

1. In the **Discovery** tab, add the **"Pellet stock – Chalet"** device (with the name you chose) and put it in a room of that house.
2. Run **"Correct the stock"** with this stock selected, to enter its current bags.
3. Add a **"Pellet stock"** widget and pick this stock in its settings. Its name shows in the chart title.

The configuration actions and the scene action have a **Stock** field: left empty, they apply to the main stock. A Zigbee button in the chalet can thus count down the chalet's stock only.

The settings (bag weight, bags per pallet, threshold, price…) are shared by all the stocks. **"Remove a stock"** removes an added stock and its history; the main stock cannot be removed.

## Scenes

### Actions

- **"Use pellet bags"** removes bags from the stock. Example: a Zigbee button next to the stove, triggering a scene that removes one bag at each press. The action fails when the recorded stock is too low: count your stock again.
- **"Add pellet bags"** adds bags (a delivery, bags bought on their own).
- **"Correct the pellet stock"** sets the stock to the number of bags counted.
- **"Read the pellet stock"** changes nothing: it gets the figures for the rest of the scene, for instance a weekly message.

Each action has a **Stock** field (empty: the main stock) and returns to the next actions the **bags left**, the **autonomy** (days), the **bags per day**, the **days before ordering** and the **remaining weight** (kg). A figure still unknown (the autonomy with no consumption yet, say) is left out rather than sent as 0.

### Triggers

- **"Pellet stock low"**: the stock falls to the low stock threshold of the configuration. It fires once, when crossing the threshold, not at every bag below it.
- **"Pellet stock empty"**: the last bag was used.
- **"Pellet pallet delivered"**: a delivery of several bags was recorded from the widget or the configuration.

Each trigger has a **Stock** field (empty: every stock) and gives the same figures as the actions, plus the **bags delivered** for the pallet. Example: "Pellet stock low → send me "{{triggerEvent.data.bags_left}} bags left, time to order"".

A delivery added by a scene does not fire "Pallet delivered", so that a scene can never restart itself in a loop. The low and empty stock triggers fire whatever the origin, a Zigbee button going through a scene included.

## Backup

The movement ledger (the last 500) is stored in the Gladys database: it is part of the **Gladys backups** and survives an update of the integration. It is deleted if you uninstall the integration.
