# Amazon Import Flow

Upload an Amazon order detail page (`.webarchive` from Safari, `.mhtml`
from Chrome, or plain `.html`) to seed or enrich an order in one step.
This doc covers the Amazon-specific mechanics. For material shared with
the AliExpress flow (pack-size detection, component-quantity math, status-
transition rollback, list-vs-paid pricing) see
[`ALIEXPRESS_IMPORT_FLOW.md`](./ALIEXPRESS_IMPORT_FLOW.md).

## User flow

1. On Amazon, open **Your Orders** and click into the order you want to
   import. You should see the full "Order Details" page (URL contains
   `/your-orders/order-details/...` or similar).
2. Save the page:
   - **Safari:** File → Save As → Format "Web Archive" (`.webarchive`).
   - **Chrome/Edge:** File → Save As → "Webpage, Single File" (`.mhtml`).
   - Any browser: File → Save As → "Webpage, Complete" (`.html`).
3. In the app, either:
   - **Add Order** → click **"Amazon detail page"** in the shortcut banner
     → pick the saved file. Creates a brand-new order.
   - Or from an existing Amazon order's **Edit** form → click **"Import
     Amazon detail page"** → pick the file. Enriches in place.

The Edit-mode button auto-picks AliExpress vs Amazon based on the order's
`importSource`, so you don't have to think about which parser to invoke.

## Parser mechanics (`server/utils/amazonParser.ts`)

Amazon's HTML classes churn constantly — any selector built on classes
alone tends to break within weeks. We rely on `data-component="..."`
attributes, which Amazon has kept stable across redesigns:

| `data-component`                 | Role                                            |
| -------------------------------- | ----------------------------------------------- |
| `shipments`                      | Wraps the ordered-items section for this order  |
| `purchasedItems`                 | One per product line within shipments           |
| `orderDate`                      | Text node containing the "Order placed" date    |

**Scoping rule:** items are extracted *strictly* from inside the
`data-component="shipments"` block. That excludes recommendation
carousels (`.p13n-*`, "Customers who viewed…", "Pick up where you left
off") which often contain more `/dp/<ASIN>/` links than the actual order
has.

**Order number:** prefers the labeled `Order # XXX-XXXXXXX-XXXXXXX`
occurrence. A naive regex over the whole HTML would match an older "recent
orders" ID in a sidebar; the labeled form is authoritative.

**Title extraction:** the longest product-link text inside a
`purchasedItems` block, falling back to image `alt` text, then
`"Amazon item <ASIN>"` as a last resort.

**Quantity:** `"Qty: N"` / `"Quantity: N"` → N. Amazon omits the qty row
for single-unit lines, so missing = 1.

**Unit price:** first `$X.XX` inside the block (excluding crossed-out "was"
prices where possible). Multi-qty lines show the unit price first and line
total right after, so "first" works.

**Pricing totals:** scans for `Item(s) Subtotal:`, `Grand Total:` /
`Order Total:`, `Estimated tax to be collected:` / `Tax Collected:` with a
~800-char label-to-value gap tolerance (Amazon's summary table uses deeply
nested divs between the label and the dollar figure).

## Cost decomposition

Same math as AliExpress, minus AE's "Bonus" concept. Amazon exposes tax as
"Additional charges" / "Estimated tax to be collected", which gets stored
separately:

```
items_cost  = total − tax                       (post-discount, pre-tax)
total_cost  = items_cost + tax = orders.total_amount
discount_factor = items_cost / subtotal         (applied to raw unit_cost)
```

If `total > subtotal` with no tax row captured, `total` is clamped to
`subtotal` and a warning is returned (same rule as AliExpress — usually
means a shipping/handling line wasn't picked up).

## Endpoints

- **`POST /api/import/amazon/create-from-detail`** — Add-Order shortcut.
  Creates a new `orders` row + fresh components + `order_items`. Rejects
  with **409** if an order with that `order_number` already exists
  (returns `existingOrderId` so the UI can redirect you to enrichment).
- **`POST /api/import/amazon/enrich-order/:orderId`** — Edit-order
  enrichment. Matches existing `order_items` by the ASIN extracted from
  `product_url` (10-char `[A-Z0-9]`). Updates `product_title`, `quantity`,
  `unit_cost`, `list_unit_cost`, `pack_size`, image, and rebalances the
  linked component's `quantity` by the units-in-stock delta. Rejects with
  **409** if the uploaded detail's order number doesn't match the URL-
  scoped order; **422** if no items extracted.

Both endpoints return cost breakdown fields (`subtotal`, `total`, `tax`,
`itemsCost`, `effectiveTotal`, `discountFactor`, `warnings[]`) plus
per-row counts (`matched`, `updated`, `componentsRenamed`).

## Pack-size detection

Amazon listings typically encode pack count in the title (`8 Pack`,
`Pack of 5`, `3-Pack`, `10 PCS`). `parsePackSize` (shared with the
AliExpress flow — see `server/utils/packSize.ts`) handles all of these.

Amazon doesn't have AliExpress's SKU-variation concept, so only the title
is inspected for Amazon rows. The math downstream is identical:
`components.quantity += order_items.quantity × order_items.pack_size`.
See the AliExpress flow doc for the full units-delta rebalancing logic.

## Known Amazon DOM gotchas

- **`ENAMETOOLONG` on inline SVG data URIs.** Amazon pages embed lots of
  inline `<svg>`s with `data:image/svg+xml;...` references. Previously
  those sanitised into 4 KB-long filenames that exceeded the filesystem
  limit. Fixed in `webarchiveParser.ts` — filenames > 80 chars collapse
  to a hashed `img_<md5>.<ext>` stub.
- **Order number appears many times.** The three-dash format
  `XXX-XXXXXXX-XXXXXXX` shows up in sidebar "related orders", reorder
  links, and tracking URLs. The parser's "find `Order #` label" preference
  disambiguates — don't drop it.
- **Recommendation blast radius.** Six ASINs on a single-item order is the
  norm because of `p13n-*` carousels. The `shipments` scoping filter is
  what keeps them out of the order's line items; without it you'd import
  five unrelated products every time.
