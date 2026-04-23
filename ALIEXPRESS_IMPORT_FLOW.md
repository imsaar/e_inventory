# AliExpress Import Process Flow

## Complete Technical Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           FRONTEND (React/TypeScript)                       │
└─────────────────────────────────────────────────────────────────────────────┘

1. File Upload Phase
┌──────────────┐    ┌──────────────────────┐    ┌─────────────────────────────────────────┐
│ User selects │────│ HTML / MHTML /       │────│ File validation:                        │
│ file         │    │ Safari .webarchive   │    │ - Max 50MB size                         │
└──────────────┘    │ via input or drop    │    │ - .html/.mhtml/.mht/.webarchive ext     │
                    └──────────────────────┘    │ - MIME type checking                    │
                                                └─────────────────────────────────────────┘
                                                            │
                                                            ▼
2. Preview & Parsing Phase (SSE Connection)
┌─────────────────────────────────────────────────────────────────────────────┐
│ POST /api/import/aliexpress/preview                                          │
│ Headers: Accept: text/event-stream                                          │
│ Body: FormData with htmlFile                                                │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           BACKEND (Express/Node.js)                         │
└─────────────────────────────────────────────────────────────────────────────┘

3. File Processing (server/routes/import.ts)
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────────────────────────┐
│ Multer          │────│ File stored in   │────│ Read file as Buffer (binary-safe).  │
│ middleware      │    │ ./uploads/imports│    │ Parser detects format from magic    │
│ - Storage conf  │    │ with timestamp   │    │ bytes / headers and decodes text    │
│ - Size limits   │    │ prefix           │    │ formats as UTF-8.                   │
└─────────────────┘    └──────────────────┘    └─────────────────────────────────────┘
                                                            │
                                                            ▼
4. HTML Parsing Engine (server/utils/aliexpressParser.ts)
┌─────────────────────────────────────────────────────────────────────────────┐
│ AliExpressHTMLParser Class                                                   │
│                                                                             │
│ constructor(imageDir, progressCallback?)                                    │
│ ├── Sets up image storage directory                                         │
│ ├── Initializes progress tracking                                           │
│ ├── Creates component classification system                                 │
│ ├── Holds an MHTMLParser (for Chrome .mhtml)                                │
│ └── Holds a WebarchiveParser (for Safari .webarchive)                       │
│                                                                             │
│ parseOrderHTML(content: string | Buffer): Promise<ParsedOrder[]>            │
│ ├── Format detection:                                                       │
│ │   ├── Buffer starting with "bplist00" → WebarchiveParser path             │
│ │   │   (server/utils/webarchiveParser.ts, uses bplist-parser)              │
│ │   ├── Text containing "MIME-Version" + "multipart/related" → MHTML path   │
│ │   └── Otherwise → treat as raw HTML string                                │
│ ├── For .mhtml / .webarchive:                                               │
│ │   ├── Extract main HTML resource                                          │
│ │   ├── Extract embedded image resources                                    │
│ │   ├── Save images to ./uploads/imported-images                            │
│ │   └── Rewrite img src / background-image URLs to local /uploads/ paths    │
│ ├── Load resulting HTML with cheerio ($)                                    │
│ ├── Extract order containers                                                │
│ ├── For each order:                                                         │
│ │   ├── Extract order metadata (number, date, status, total)               │
│ │   ├── Find all order items (one of two layouts):                         │
│ │   │   ├── Single-product:    .order-item-content-body with title/qty/price│
│ │   │   └── Multi-product:     .order-item-content-img-list > a per item    │
│ │   │                          (no per-item title/qty/price rendered;       │
│ │   │                           order total split evenly, flagged review)   │
│ │   ├── For each item:                                                     │
│ │   │   ├── Extract product title (or synth from URL for multi-product)    │
│ │   │   ├── Extract quantities and prices                                  │
│ │   │   ├── Extract specifications/variations                              │
│ │   │   ├── Use embedded image if present, else download from CDN          │
│ │   │   └── Classify component (resistor, capacitor, IC, etc.)            │
│ │   └── Emit progress updates via SSE                                      │
│ └── Return structured order data                                            │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
5. Real-time Progress Updates (Server-Sent Events)
┌─────────────────────────────────────────────────────────────────────────────┐
│ SSE Stream to Frontend:                                                     │
│ data: {"stage": "parsing", "progress": 25, "message": "Processing orders"} │
│ data: {"stage": "images", "progress": 50, "message": "Downloading images"} │
│ data: {"stage": "complete", "success": true, "preview": [...orders...]}    │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           FRONTEND (React/TypeScript)                       │
└─────────────────────────────────────────────────────────────────────────────┘

6. Preview Display & Selection
┌─────────────────────────────────────────────────────────────────────────────┐
│ AliExpressImport Component State:                                           │
│ ├── previewData: { orders: ParsedOrder[], statistics: ImportStats }        │
│ ├── selectedOrders: Set<string> (order numbers)                            │
│ ├── importOptions: { allowDuplicates, createComponents, updateExisting }   │
│ └── UI renders order cards with:                                           │
│     ├── Order metadata (number, date, total, supplier)                     │
│     ├── Item list with product titles and classifications                  │
│     ├── Checkboxes for selection                                           │
│     └── Import statistics summary                                          │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
7. Import Execution Phase
┌─────────────────────────────────────────────────────────────────────────────┐
│ User clicks "Import Selected Orders" button                                 │
│ ├── Batch selected orders (10 orders per batch)                            │
│ ├── For each batch:                                                        │
│ │   └── POST /api/import/aliexpress/import                                 │
│ │       Body: { orders: ParsedOrder[], importOptions: ImportOptions }     │
│ └── Aggregate results from all batches                                     │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           BACKEND (Express/Node.js)                         │
└─────────────────────────────────────────────────────────────────────────────┘

8. Database Import Transaction (server/routes/import.ts)
┌─────────────────────────────────────────────────────────────────────────────┐
│ Import Process (within SQLite transaction):                                │
│                                                                             │
│ BEGIN TRANSACTION                                                           │
│                                                                             │
│ For each order in batch:                                                   │
│ ├── Check for existing order (by order_number only — supplier renames      │
│ │   on the AliExpress side don't defeat dedup)                             │
│ ├── If duplicate and allowDuplicates = false:                              │
│ │   ├── Compare existing status to freshly parsed status                   │
│ │   ├── If forward-progress (via shouldUpdateStatus — pending → ordered    │
│ │   │   → shipped → delivered; cancelled always wins; no regression from   │
│ │   │   delivered or cancelled), UPDATE orders.status + updated_at         │
│ │   └── Bump results.statusUpdated, skip item creation, continue           │
│ ├── Generate unique order ID: ord_${timestamp}_${random}                   │
│ ├── Insert into orders table:                                              │
│ │   ├── id, order_date, supplier, order_number                             │
│ │   ├── supplier_order_id, notes, total_amount                             │
│ │   ├── import_source='aliexpress', import_date                            │
│ │   ├── original_data (JSON), status (mapped)                              │
│ │   └── created_at, updated_at                                             │
│ │                                                                           │
│ └── For each item in order:                                                │
│     ├── Component Creation (if parsedComponent exists):                    │
│     │   ├── Check existing by part_number or name                          │
│     │   ├── Generate component ID: cmp_${timestamp}_${random}              │
│     │   ├── Insert into components table:                                  │
│     │   │   ├── id, name, description, category                            │
│     │   │   ├── quantity, min_threshold=0                                  │
│     │   │   ├── image_url, status='available'                              │
│     │   │   └── created_at, updated_at                                     │
│     │   └── Return component_id                                            │
│     │                                                                       │
│     ├── Generate order item ID: oit_${timestamp}_${random}                 │
│     ├── Calculate import confidence (0.5-1.0):                             │
│     │   ├── Base: 0.5                                                      │
│     │   ├── +0.3 if parsedComponent exists                                 │
│     │   ├── +0.1 if partNumber exists                                      │
│     │   └── +0.1 if category classified                                    │
│     │                                                                       │
│     └── Insert into order_items table:                                     │
│         ├── id, order_id, component_id                                     │
│         ├── product_title, product_url, image_url                          │
│         ├── local_image_path, quantity, unit_cost                          │
│         ├── specifications (JSON), variation                               │
│         ├── import_confidence, manual_review flag                          │
│         └── notes with classification info                                 │
│                                                                             │
│ COMMIT TRANSACTION (or ROLLBACK on error)                                  │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
9. Response & UI Update
┌─────────────────────────────────────────────────────────────────────────────┐
│ Import Results Response:                                                    │
│ {                                                                           │
│   success: true,                                                           │
│   results: {                                                               │
│     imported: number,        // Successfully imported orders               │
│     skipped: number,         // Skipped duplicate orders                   │
│     statusUpdated: number,   // Existing orders whose status advanced      │
│     errors: string[],        // Error messages                             │
│     orderIds: string[],      // Generated order IDs                        │
│     componentIds: string[]   // Generated component IDs                    │
│   }                                                                         │
│ }                                                                           │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           FRONTEND (React/TypeScript)                       │
└─────────────────────────────────────────────────────────────────────────────┘

10. Success Handling & Navigation
┌─────────────────────────────────────────────────────────────────────────────┐
│ ├── Display import success message with statistics                         │
│ ├── Reset import state (clear preview data and selections)                 │
│ ├── Navigate to Orders page to show imported data                          │
│ └── Dashboard refresh (if hooks enabled)                                   │
└─────────────────────────────────────────────────────────────────────────────┘

12. Order Detail Enrichment (Optional, Post-Import)
┌─────────────────────────────────────────────────────────────────────────────┐
│ Multi-product orders on the My Orders list render as thumbnail strips with  │
│ no per-item title/qty/unit price. Uploading the order's detail page fills   │
│ in that data.                                                               │
│                                                                             │
│ User flow:                                                                  │
│ ├── Open the order in the Edit form                                         │
│ ├── Click "Open on AliExpress" (deep-links to detail page via orderId)      │
│ ├── Save page as .webarchive (Safari) / .mhtml (Chrome) / .html             │
│ └── Click "Import detail page" and pick the file                            │
│                                                                             │
│ Backend flow (POST /api/import/aliexpress/enrich-order/:orderId):           │
│ ├── AliExpressHTMLParser.parseOrderDetail → { orderNumber, items,           │
│ │   subtotal, total }                                                       │
│ ├── Guard: 409 if detail's orderNumber ≠ the order being edited             │
│ ├── Match existing order_items to detail items:                             │
│ │   ├── Pass 1 — group both sides by productId, pair positionally within    │
│ │   │           each group (handles multi-SKU-variant orders cleanly)       │
│ │   ├── Pass 2 — pair any leftovers with orphan placeholder rows whose      │
│ │   │           product_url has no parseable ID ("unknown-N") positionally  │
│ │   └── Pass 3 — for still-unmatched detail items: INSERT new order_items   │
│ │                + new components, so nothing is dropped                    │
│ ├── Cost decomposition:                                                     │
│ │   itemsCost = total + bonus − tax                                         │
│ │   orders.total_amount = itemsCost + tax = total + bonus                   │
│ │   discountFactor = itemsCost / subtotal                                   │
│ │   Bonus (gift-card from refunds) is added to cost, not discount.          │
│ │   Tax ("Additional charges") is stored separately in orders.tax.          │
│ │   If total > subtotal with no tax row, clamp total=subtotal and warn.     │
│ ├── For each matched pair: UPDATE product_title, quantity, unit_cost       │
│ │   (raw × factor), list_unit_cost (raw), variation, product_url, image;  │
│ │   auto-create component if NULL, else rename unconditionally              │
│ ├── UPDATE orders.total_amount + orders.tax                                 │
│ └── Return { detailItems, matched, updated, created, componentsRenamed,     │
│     pairedByFallback, subtotal, total, bonus, tax, itemsCost,               │
│     effectiveTotal, discountFactor, warnings[] }                            │
│                                                                             │
│ total_cost is a GENERATED column — never included in UPDATE statements.     │
│ list_unit_cost is a nullable REAL column added in migration v9.             │
│ orders.tax is a REAL column added in migration v13.                         │
│                                                                             │
│ UI reminder: click the arrow next to "Total" on AliExpress to expand the    │
│ breakdown (Store discount, Coin credit, Additional charges, Bonus) BEFORE   │
│ saving the webarchive — otherwise those rows aren't in the DOM and tax /    │
│ bonus can't be attributed.                                                  │
└─────────────────────────────────────────────────────────────────────────────┘

13. Order Creation From Detail Page (Add-Order shortcut)
┌─────────────────────────────────────────────────────────────────────────────┐
│ Sibling of #12 for the Add-Order flow. Same parser, same cost math, same    │
│ clamp / warnings.                                                           │
│                                                                             │
│ POST /api/import/aliexpress/create-from-detail                              │
│ ├── Requires a parseable order_number on the page (else 422)                │
│ ├── 409 if an order with that order_number already exists (returns          │
│ │   existingOrderId so the UI can redirect to enrich-order)                 │
│ ├── Creates a new orders row with order_date + supplier pulled from the     │
│ │   page where available, falling back to today / "AliExpress"              │
│ ├── Creates fresh components + order_items for every line; no matching      │
│ │   against existing DB rows                                                │
│ └── Returns { success, orderId, orderNumber, orderDate, supplier,           │
│     itemCount, subtotal, total, bonus, tax, itemsCost, effectiveTotal,      │
│     discountFactor, warnings[] }                                            │
│                                                                             │
│ Frontend: the OrderForm in create mode (Add Order) shows an "Import detail  │
│ page" banner above the manual fields with the same expand-breakdown tip.    │
└─────────────────────────────────────────────────────────────────────────────┘

11. On-Demand Title Enrichment (Optional, Post-Import)
┌─────────────────────────────────────────────────────────────────────────────┐
│ For multi-product orders, items land with placeholder titles like           │
│ "AliExpress item 3256805841460957" because the My Orders page does not      │
│ render per-item titles.                                                     │
│                                                                             │
│ User flow:                                                                  │
│ ├── Open order edit form                                                    │
│ ├── Click "Fetch title" beside a placeholder item                           │
│ └──> POST /api/import/aliexpress/fetch-title                                │
│      Body: { productUrl, componentId?, orderItemId? }                       │
│                                                                             │
│ Backend (server/routes/import.ts#fetchAliExpressPage):                      │
│ ├── Validates host is aliexpress.com / .us / .ru                            │
│ ├── Manually follows redirects with a cookie jar (node-fetch's automatic    │
│ │   follower drops Set-Cookie, so AliExpress's login → sync_cookie_read →   │
│ │   .us redirect chain blows past the 20-redirect cap without cookies)      │
│ ├── Parses og:title → twitter:title → <title>, strips suffixes, decodes     │
│ │   HTML entities                                                           │
│ ├── Updates components.name and order_items.product_title                   │
│ └── Returns { title, productId, success } or 4xx/5xx with error             │
│                                                                             │
│ Failure modes (all non-fatal, surfaced inline in the form):                 │
│ ├── 502: AliExpress returned a non-2xx, or the page is a captcha shell      │
│ ├── 504: Timed out (10s per redirect hop)                                   │
│ └── 4xx: Invalid URL or non-AliExpress host                                 │
└─────────────────────────────────────────────────────────────────────────────┘

```

## Key Data Structures

### ParsedOrder
```typescript
interface ParsedOrder {
  orderNumber: string;        // AliExpress order number
  orderDate: string;          // ISO date string
  totalAmount: number;        // Total order value
  supplier: string;           // "AliExpress"
  status: string;             // Order status from HTML
  items: ParsedOrderItem[];   // Array of order items
}
```

### ParsedOrderItem
```typescript
interface ParsedOrderItem {
  productTitle: string;           // Product name from HTML
  quantity: number;               // Ordered quantity
  unitPrice: number;              // Price per unit
  totalPrice: number;             // quantity * unitPrice
  imageUrl?: string;              // Original image URL
  localImagePath?: string;        // Local downloaded image path
  productUrl?: string;            // Product page URL
  specifications?: Record<string, string>;  // Extracted specs
  parsedComponent?: {             // Auto-classified component
    name: string;                 // Cleaned product name
    category: string;             // resistor, capacitor, etc.
    description?: string;         // Additional details
    partNumber?: string;          // Extracted part number
  };
}
```

### Database Tables Schema

#### orders
```sql
CREATE TABLE orders (
  id TEXT PRIMARY KEY,           -- ord_${timestamp}_${random}
  order_date TEXT NOT NULL,      -- ISO date string
  supplier TEXT NOT NULL,        -- "AliExpress"
  order_number TEXT NOT NULL,    -- AliExpress order number
  supplier_order_id TEXT,        -- Same as order_number
  notes TEXT,                    -- Import metadata
  total_amount REAL,             -- Total order cost
  import_source TEXT,            -- "aliexpress"
  import_date TEXT,              -- Import timestamp
  original_data TEXT,            -- JSON of original parsed data
  status TEXT,                   -- ordered|shipped|delivered|cancelled
  created_at TEXT,               -- Creation timestamp
  updated_at TEXT                -- Last update timestamp
);
```

#### components
```sql
CREATE TABLE components (
  id TEXT PRIMARY KEY,           -- cmp_${timestamp}_${random}
  name TEXT NOT NULL,            -- Component name
  description TEXT,              -- Component description
  category TEXT,                 -- resistor, capacitor, IC, etc.
  quantity INTEGER DEFAULT 0,    -- Current stock
  min_threshold INTEGER DEFAULT 0, -- Minimum stock alert
  image_url TEXT,                -- Component image path
  status TEXT DEFAULT 'available', -- available|discontinued|ordered
  created_at TEXT,               -- Creation timestamp
  updated_at TEXT                -- Last update timestamp
);
```

#### order_items
```sql
CREATE TABLE order_items (
  id TEXT PRIMARY KEY,           -- oit_${timestamp}_${random}
  order_id TEXT REFERENCES orders(id),
  component_id TEXT REFERENCES components(id),
  product_title TEXT NOT NULL,   -- Original product title
  product_url TEXT,              -- Product page URL
  image_url TEXT,                -- Original image URL
  local_image_path TEXT,         -- Downloaded image path
  quantity INTEGER NOT NULL,     -- Ordered quantity
  unit_cost REAL,                -- Cost per unit
  specifications TEXT,           -- JSON specifications
  variation TEXT,                -- Product variation
  import_confidence REAL,        -- 0.0-1.0 parsing confidence
  manual_review INTEGER DEFAULT 0, -- 1 if needs review
  notes TEXT                     -- Import notes
);
```

## Error Handling

### Frontend Error Scenarios
- File upload validation failures
- SSE connection drops during parsing
- Network errors during import requests
- Backend validation errors

### Backend Error Scenarios
- Invalid HTML structure
- Image download failures
- Database constraint violations
- Transaction rollback scenarios

### Recovery Mechanisms
- Automatic retry for network failures
- Transaction rollback on database errors
- Graceful degradation for image failures
- User feedback for validation errors

## Performance Considerations

### Batching Strategy
- Orders processed in batches of 10
- Prevents request timeout issues
- Allows progress tracking
- Enables partial success scenarios

### Database Optimization
- Transaction-based imports for consistency
- Foreign key constraints for data integrity
- Indexed lookups for duplicate detection
- Batch insertions where possible

### Memory Management
- File cleanup after processing
- Streaming for large HTML files
- Progressive image downloads
- Garbage collection of temporary data