# Price Lists — Simple Guide

This explains how pricing works in the admin panel, in plain language.

## The idea in one line

Each product has a fixed **MRP**. Each **price list** (T1, T2, T3…) just decides the **discount margins** for dealers and distributors. You assign a price list to a dealer, and the system works out their prices automatically.

## How prices are worked out

- **Dealer Price** = MRP minus the Dealer Margin.
  - Example: MRP ₹100, Dealer Margin 50% → Dealer Price ₹50.
- **Distributor Price** = Dealer Price divided by (1 + Distributor Margin).
  - Example: Dealer ₹50, Distributor Margin 20% → ₹50 ÷ 1.20 = ₹42.

Prices are rounded to the nearest rupee (0.50 and above rounds up).

## Step 1 — Set the MRP (once per product)

1. Go to **Products** and open a product.
2. Open the **Pricing** tab.
3. Enter the **MRP**. This is the same for every dealer and every price list. You only set it here.

## Step 2 — Create your price lists

1. Go to **Products → Price lists** (or **Pricing → Price lists**).
2. Click **Add price list**, give it a code (e.g. `T2`) and a name.
3. Save. You can create as many as you need (T1, T2, T3, …).

Tip: The margin box on this page is only a **default**. The real margins are set per product in Step 3.

## Step 3 — Set margins per product

1. Open a product → **Pricing** tab.
2. You'll see a row for each price list with:
   - **Dealer Margin %** — the discount the dealer gets off MRP.
   - **Distributor Margin %** — the distributor's margin.
3. Type the two percentages. The **Dealer Price** and **Distributor Price** update on screen so you can check them.
4. Save.

You can enter any percentage (35%, 45%, 52%, etc.).

## Step 4 — Assign a price list to a dealer

1. Go to the dealer's profile (Users/Dealers) and edit it.
2. Choose their **Price List** (e.g. T1).
3. Save.

From now on, that dealer automatically gets the margins from that price list for **every** product. No need to set prices dealer by dealer.

## Good to know

- **MRP never changes between price lists.** Only the margins change. So the same product can be ₹100 MRP everywhere, but T1 gives 50% off and T2 gives 45% off.
- **New products** show up automatically in every price list — just fill in their margins.
- **Bigger mattress sizes cost more.** MRP and prices are for the standard size and scale up with the ordered size automatically.

## Quick example

Product A, MRP ₹100.

| Price list | Dealer margin | Dealer price | Distributor margin | Distributor price |
|---|---|---|---|---|
| T1 | 50% | ₹50 | 20% | ₹42 |
| T2 | 45% | ₹55 | 22% | ₹45 |

Assign T1 to a dealer and they pay ₹50; assign T2 and they pay ₹55 — all from the same ₹100 MRP.
