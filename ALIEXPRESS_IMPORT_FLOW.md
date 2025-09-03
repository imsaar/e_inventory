# AliExpress Import Process Flow

## Complete Technical Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           FRONTEND (React/TypeScript)                       │
└─────────────────────────────────────────────────────────────────────────────┘

1. File Upload Phase
┌──────────────┐    ┌─────────────────┐    ┌─────────────────────────────────────┐
│ User selects │────│ HTML/MHTML file │────│ File validation:                   │
│ file         │    │ via input       │    │ - Max 50MB size                     │
└──────────────┘    └─────────────────┘    │ - .html/.mhtml/.mht extensions      │
                                           │ - MIME type checking                │
                                           └─────────────────────────────────────┘
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
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────────────────┐
│ Multer          │────│ File stored in   │────│ Read file content as UTF-8   │
│ middleware      │    │ ./uploads/imports│    │                             │
│ - Storage conf  │    │ with timestamp   │    │                             │
│ - Size limits   │    │ prefix           │    │                             │
└─────────────────┘    └──────────────────┘    └─────────────────────────────┘
                                                            │
                                                            ▼
4. HTML Parsing Engine (server/utils/aliexpressParser.ts)
┌─────────────────────────────────────────────────────────────────────────────┐
│ AliExpressHTMLParser Class                                                   │
│                                                                             │
│ constructor(imageDir: string, progressCallback?: Function)                  │
│ ├── Sets up image storage directory                                         │
│ ├── Initializes progress tracking                                           │
│ └── Creates component classification system                                 │
│                                                                             │
│ parseOrderHTML(htmlContent: string): Promise<ParsedOrder[]>                 │
│ ├── Load HTML with cheerio ($)                                              │
│ ├── Extract order containers                                                │
│ ├── For each order:                                                         │
│ │   ├── Extract order metadata (number, date, status, total)               │
│ │   ├── Find all order items                                               │
│ │   ├── For each item:                                                     │
│ │   │   ├── Extract product title                                          │
│ │   │   ├── Extract quantities and prices                                  │
│ │   │   ├── Extract specifications/variations                              │
│ │   │   ├── Extract and download product images                           │
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
│ ├── Check for existing order (by order_number + supplier)                  │
│ ├── Skip if duplicate and allowDuplicates = false                          │
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