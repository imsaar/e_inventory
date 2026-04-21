# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A production-ready web-based inventory management system for electronics hobbyists with comprehensive order tracking and AliExpress import capabilities.

**Tech Stack**: React + TypeScript frontend, Express.js + SQLite backend (authentication removed for public access)

## Development Commands

```bash
# Core Development
npm run dev        # Start both frontend (5173) and backend (3001)  
npm run client     # Frontend dev server only (Vite)
npm run server     # Backend API server only (Express + nodemon with ts-node)

# Code Quality
npm run lint       # ESLint code analysis
npm run typecheck  # TypeScript type checking
npm run build      # Production build (TSC + Vite)

# Testing
npm test           # Run all tests (16 test suites, 230+ tests)
npm run test:watch # Run tests in watch mode  
npm run test:coverage # Run tests with coverage

# Single test execution examples
npm test -- --testPathPattern=aliexpress-import  # AliExpress import tests
npm test qr-generation.test.ts                   # QR code functionality
npm test photo-management.test.ts                # Photo upload tests
npm test location-detail-view.test.ts            # Detail view tests
npm test qr-code-size.test.ts                    # QR code size tests

# Database Development
# Database files: data/inventory.db (dev), data/inventory-test-*.db (test)
sqlite3 data/inventory.db                        # Direct database access
```

## Architecture Overview

### Current Security Status
**IMPORTANT**: Authentication has been removed from all endpoints for public access. All API endpoints are now public and do not require authentication tokens.

### Backend Architecture
```
server/
├── index.ts                # Main server with security middleware stack
├── database.ts             # SQLite configuration with foreign keys
├── middleware/             # Security and validation layers
│   ├── auth.ts            # Auth functions (unused - routes are public)
│   ├── security.ts        # Headers, rate limiting, CORS, logging
│   └── validation.ts      # Zod schemas, sanitization, request limits
├── routes/                # API endpoints (all public)
│   ├── auth.ts           # Authentication endpoints (public)
│   ├── components.ts     # Component CRUD with bulk operations
│   ├── locations.ts      # Storage location hierarchy
│   ├── projects.ts       # Project management with BOMs
│   ├── orders.ts         # Order management system
│   └── import.ts         # AliExpress HTML import functionality
└── utils/                # Utility functions
    ├── aliexpressParser.ts  # AliExpress HTML parsing logic
    ├── mhtmlParser.ts       # MHTML file format support  
    └── htmlQR.ts           # QR code generation utilities
```

### Database Design
**SQLite** with strict foreign key constraints:
- `users` (authentication tables exist but not enforced)
- `storage_locations` (hierarchical: Room → Cabinet → Drawer → Box)
- `components` (with electrical specifications and cost tracking)
- `projects` (with component assignments)
- `project_components` (many-to-many with quantities)
- `component_history` (audit trail)
- `boms` (versioned bills of materials)
- `orders` (comprehensive order tracking system)
- `order_items` (detailed order line items with component linking)

### AliExpress Import System
Complete HTML parsing and import workflow:
- **File Upload**: Handles HTML, MHTML (Chrome/Edge), and `.webarchive` (Safari) files from AliExpress order pages
- **HTML Parsing**: Extracts order data, items, prices, and specifications
- **Component Creation**: Auto-generates components from parsed product data
- **Order Integration**: Creates orders with proper cost calculations and component linking
- **Progress Tracking**: Real-time parsing progress with SSE support
- **Import History**: Tracks all import activities with statistics

### Frontend Architecture
- **Pages**: Dashboard, Components, Locations, Projects, Orders, QR Printing
- **Components**: Reusable UI with bulk operations and AliExpress import interface
- **Types**: Comprehensive TypeScript definitions for all entities
- **Routing**: React Router with public access (no auth guards)
- **Hooks**: Custom dashboard refresh system with pause/resume for import operations

## Critical Implementation Details

### Component ID Format Validation
**IMPORTANT**: Components have two ID formats that must be handled in validation:
- **Standard UUIDs**: `^[a-fA-F0-9]{32}$|^[a-fA-F0-9-]{36}$` 
- **AliExpress Import IDs**: `^cmp_[a-zA-Z0-9_]+$` (e.g., `cmp_1756799695785_64fv53eh7`)

The validation middleware in `server/middleware/validation.ts` handles both formats. When adding new routes that accept component IDs, ensure regex patterns include both formats.

### MHTML / Webarchive / HTML Parsing Architecture
The AliExpress import system has three sibling parsers feeding into one orchestrator:
- **MHTMLParser** (`server/utils/mhtmlParser.ts`): Extracts embedded images + HTML from Chrome/Edge `.mhtml` files (MIME multipart text format)
- **WebarchiveParser** (`server/utils/webarchiveParser.ts`): Extracts embedded images + HTML from Safari `.webarchive` files (binary plist via `bplist-parser`)
- **AliExpressHTMLParser** (`server/utils/aliexpressParser.ts`): Detects format from the input (Buffer starting with `bplist00` → webarchive; text containing `MIME-Version` + `multipart/related` → MHTML; otherwise raw HTML), runs the right extractor, then parses order data with cheerio

**Critical**: The import route reads uploads as **Buffer** (not `utf-8`) so binary `.webarchive` files survive intact. `parseOrderHTML` accepts `string | Buffer`.

**Critical**: Image URLs from MHTML/webarchive parsing use `/uploads/` prefix (not `/api/uploads/`) to work with Vite proxy configuration.

**Multi-product order layout**: On AliExpress's My Orders page, single-product orders render a `.order-item-content-body` with `.order-item-content-info-name` (title), `.order-item-content-info-number` (price/qty), and `.order-item-content-img` (one image). Multi-product orders use a different layout: a single `.order-item-content-body` containing `.order-item-content-img-list > a` (one anchor per product) — **no per-item title, quantity, or unit price is rendered** (those would only appear on the order detail page). The parser detects `.order-item-content-img-list > a` count > 1 and emits one `ParsedOrderItem` per link via `parseItemsFromImgList`, with placeholder title `AliExpress item <id>`, the order total split evenly across items, and a `specifications.Note` flagging it for manual review.

**On-demand title enrichment**: The order edit form (`OrderForm.tsx`) shows a "Fetch title" button on rows whose displayed name matches `^AliExpress item \d+`. The button calls `POST /api/import/aliexpress/fetch-title` with the row's `productUrl`, `componentId`, and `orderItemId`. The endpoint:
- Validates the host is `aliexpress.com|.us|.ru`.
- Uses `fetchAliExpressPage()` which follows redirects manually (up to 20) with a per-request cookie jar — necessary because AliExpress bounces `.com` URLs through `login.aliexpress.com/sync_cookie_read` setting cookies on each hop. node-fetch's automatic follower hits its 20-redirect cap because it doesn't carry Set-Cookie forward.
- Extracts title from `og:title` → `twitter:title` → `meta name=title` → `<title>`, strips `" - AliExpress"` / `" | aliexpress.com"` suffixes, decodes HTML entities.
- Updates `components.name` and `order_items.product_title` server-side.
- Returns 502 on anti-bot blocks, 504 on timeouts, 4xx on bad input. Frontend treats failures as non-fatal and surfaces inline.

**Order item images**: `mapOrderItemRow` in `server/routes/orders.ts` returns `productTitle, productUrl, imageUrl, localImagePath`; the `/api/orders/:id` query also joins `c.image_url as component_image_url`. The shared frontend helper `src/utils/orderItemImage.ts#resolveOrderItemImage()` resolves the best thumbnail via `localImagePath → imageUrl → component image_url`, used by both `OrderDetailView` and `OrderForm`.

**Shared table grid pitfall**: `OrderDetailView` uses 7 columns (Image / Component / Part / Qty / Unit / Total / Notes) while `OrderForm` uses 5 (Component / Qty / Unit / Total / Actions). They share `.order-items-table > .table-header / .table-row` CSS. The detail view scopes its 7-column grid via the `.order-items-table--detail` modifier on its outer div — keep this scoping if you change either grid, or the cells will overlap.

**Status updates on re-import**: When an order already exists (matched on `order_number`), the importer does not create a duplicate but *will* advance its status if the freshly-parsed status is further along the lifecycle. Policy lives in `shouldUpdateStatus` in `server/routes/import.ts`: forward progression only through `pending → ordered → shipped → delivered`, `cancelled` is always accepted (user cancelled), and `cancelled`/`delivered` never regress to earlier states. The endpoint bumps `results.statusUpdated` for surfaced counts.

**Order detail enrichment (`POST /api/import/aliexpress/enrich-order/:orderId`)**: The My Orders list page hides per-item data for multi-product orders (no title/qty/unit price rendered in thumbnail strips). Uploading the order's *detail* page recovers that data. Key mechanics in `server/routes/import.ts` + `AliExpressHTMLParser.parseOrderDetail`:

- **Parser** returns `{ orderNumber, items, subtotal, total }`. Order number is pulled from `orderId=<digits>` in tracking URLs; Subtotal/Total come from `data-pl="order_price_item_*"` pairs.
- **Order-number guard**: rejects with 409 if the uploaded detail's order number doesn't match the URL-scoped order being edited.
- **Matching is group-by-productId on both sides**, not a single-entry Map (the old bug). Multi-variant orders are common — e.g. 7 SKU colors sharing one product ID — and they're paired positionally within each productId group. `Map<productId, row[]>` + `Map<productId, detail[]>` → inner positional pair.
- **Pass 2 (orphan positional)**: leftover detail items left after Pass 1 are paired with existing rows whose `product_url` has no parseable product ID (placeholder "AliExpress item unknown-N" rows from the original multi-item parser). The paired row has its `product_url` backfilled so it's matchable by ID on future enrichments.
- **Missing-row creation**: detail items still unmatched after both passes get INSERTed as fresh `order_items` with new `components`. Nothing is silently discarded; this is how orders that were collapsed to fewer rows than the detail page reality get healed.
- **Missing-component creation**: if a paired row's `component_id` is NULL (old data), a new component is inserted and the `order_items.component_id` gets linked — guarantees component-rename never silently skips.
- **Discount spread**: `discountFactor = total / subtotal` (when subtotal > total). Each item's paid `unit_cost` is `rawListPrice × discountFactor`, so sum of line totals equals the actually-paid order total. The raw list price is stored separately in `order_items.list_unit_cost` (migration v9). `order_items.total_cost` is a GENERATED column from `quantity * unit_cost` — do NOT include it in UPDATE statements (SQLite errors).
- **Authoritative total**: after all item writes, `orders.total_amount` gets rewritten to the detail page's Total.
- **Unit-cost form precision**: the OrderForm's Unit Cost input uses `step="0.0001"` because discount-factor math produces 4-decimal values that `step="0.01"` would reject as "Please enter a valid value".

**`list_unit_cost` column**: nullable REAL on `order_items`. Pre-existing rows stay NULL; only rows enriched via detail-page upload get the pre-discount list price populated. The OrderDetailView shows it as a muted strikethrough beneath the paid `unit_cost` when list > paid.

### Vite Proxy Configuration
Frontend development requires proxying both API and static file requests:
```typescript
// vite.config.ts
server: {
  proxy: {
    '/api': 'http://localhost:3001',      // API endpoints
    '/uploads': 'http://localhost:3001'   // Static file serving (CRITICAL for image display)
  }
}
```

### Database Schema Evolution
Current schema version: 9 (automatic migrations handle upgrades)
- **Database Path Logic**: Test environment uses unique DB per run, dev uses `inventory-dev.db`, production uses `inventory.db`
- **Migration System**: Located in `server/database.ts`, automatically runs on startup
- **Foreign Keys**: ENABLED - all deletions must check dependencies via `project_components`, `order_items` tables
- **Image Storage**: Components link to images via `image_url` field pointing to `imported-images/filename.ext`

### Bulk Operations Security
All bulk operations include:
- Input validation (max 100 items)
- Dependency checking to prevent orphaned data (components used in projects cannot be deleted)
- **SQL Pattern**: Use `GROUP_CONCAT(column, ', ')` not `GROUP_CONCAT(column, ", ")` (SQLite syntax)
- Transaction support for data integrity

### Dashboard Refresh System
**Real-time Stats Updates**: The dashboard automatically refreshes stats when data changes across the application:
- **Global Hook**: `useDashboardRefresh()` provides `triggerRefresh()`, `pauseRefresh()`, `resumeRefresh()` functions
- **Event-Driven**: Uses custom DOM events (`dashboardRefresh`) for cross-component communication
- **Smart Suspension**: Import operations pause dashboard updates to prevent unnecessary calculations during bulk operations
- **Auto-Resume**: Dashboard updates resume automatically when imports complete or components unmount

### File Upload Security  
- HTML/MHTML parsing for import functionality with embedded image extraction
- Photo upload with type validation and size limits (10MB)
- Static serving via Express with CSP headers: `default-src 'none'; img-src 'self'`
- Prevention of script execution in upload directories

### Factory Reset System
**Complete Data Wipe**: Secure factory reset functionality with multiple safety measures:
- **Multi-Step Confirmation**: Requires typing "FACTORY RESET" to proceed
- **Comprehensive Deletion**: Removes all database records and uploaded files
- **Transaction Safety**: Uses SQLite transactions to ensure complete cleanup

## Testing Architecture

- **Unit Tests**: Individual route and middleware testing
- **Integration Tests**: Full API endpoint testing with isolated test databases
- **Import Tests**: AliExpress HTML parsing and import functionality
- **Security Tests**: Input validation, rate limiting (auth tests disabled)
- **Performance Tests**: API response times and load handling
- **Test Isolation**: Each test uses unique SQLite database files

## Development Workflow

When working on this codebase:
1. **No Authentication Required**: All endpoints are public - no need for auth tokens in tests or requests
2. **Database Changes**: Always consider foreign key constraints and migration requirements
3. **Import Functionality**: Test HTML parsing with realistic AliExpress data structures
4. **Type Safety**: Run `npm run typecheck` before commits
5. **Test Coverage**: Run specific test suites for areas being modified
6. **Performance**: API endpoints should respond within 50ms for good user experience

### Common Development Patterns

**Adding New Component Routes:**
```typescript
// Always include both ID validation patterns
router.get('/:id', validateParams(['id']), (req, res) => {
  // Handles both UUID and cmp_* formats automatically
});
```

**Working with Images:**
- Components store images as `image_url` in database (relative path like `imported-images/filename.png`)
- Frontend accesses via `/uploads/imported-images/filename.png` (proxied to backend)
- MHTML parser creates local images and returns `/uploads/` URLs for component storage

**Dashboard Stats Management:**
- Always call `triggerRefresh()` after data modifications (create, update, delete operations)
- Use `pauseRefresh()` at start of bulk operations, `resumeRefresh()` when complete
- Dashboard automatically listens via `useDashboardRefreshListener(callback)`

**Bulk Operations:**
- Always use `GROUP_CONCAT(column, ', ')` syntax for SQLite
- Check dependencies before deletion: `project_components`, `order_items` tables
- Implement detailed error reporting with dependency lists

### Debugging Common Issues

**Images Not Displaying:**
1. Check Vite proxy includes `/uploads` route
2. Verify CSP headers allow `img-src 'self'`
3. Confirm component `image_url` field is populated (not null)
4. Test direct image access: `http://localhost:5173/uploads/imported-images/filename.png`

**AliExpress Import Failures:**
1. Check MHTML parsing logs for boundary detection issues
2. Verify image URL mapping uses `/uploads/` not `/api/uploads/`
3. Confirm `order-item-content-img` class parsing in HTML
4. **Database Schema Issues**: If seeing "no column named X" errors:
   - Check component creation SQL uses only existing columns
   - Avoid problematic columns like `voltage` or `part_number` in INSERT statements
   - Use simplified column set: `id, name, description, category, quantity, min_threshold, image_url, status, created_at, updated_at`

**Component Creation Problems:**
- **"Unknown Component" in orders**: Usually indicates component creation failure during import
- Check server logs for database constraint violations or missing columns
- Verify component classification is working (`parsedComponent` object exists)
- Test with simplified component creation SQL

**Import Process Troubleshooting:**
1. Check if orders are created but components missing (database schema issue)
2. Verify dashboard refresh hooks aren't interfering (should be paused during import)
3. Monitor both frontend and backend logs during import process
4. Test with small HTML files first to isolate parsing issues

**Bulk Delete Failures:**
1. Check SQL syntax for `GROUP_CONCAT` function
2. Verify dependency checking logic includes all relationship tables
3. Test with components that have project dependencies


## Environment Configuration

**Development** (current state):
```bash
NODE_ENV=development
DATABASE_PATH=./data/inventory-dev.db
# No auth secrets needed - all endpoints public
```

**Production Considerations**:
- Consider re-implementing authentication if deploying publicly
- Set up proper HTTPS and security headers
- Configure rate limiting appropriate for expected load
- Implement backup strategy for SQLite database

## Data Management & Backup

### Database Files
- **Development**: `data/inventory-dev.db`
- **Production**: `data/inventory.db`
- **Testing**: `data/inventory-test-*.db` (unique per test run)

### Backup System
**Complete Data Backup**: The system includes comprehensive backup/restore functionality:
- `GET /api/database/export` - Database only (.db file)
- `GET /api/database/export-all` - Complete backup (database + uploads as .zip)
- `POST /api/database/import` - Restore database from .db file
- `POST /api/database/import-all` - Restore complete backup from .zip file
- **Auto-backup**: System creates automatic backups before major operations like imports

### Manual Database Backup
```bash
# Create backup
cp data/inventory.db data/inventory-backup-$(date +%Y%m%d).db

# Direct SQLite access
sqlite3 data/inventory.db
.tables                    # List all tables
.schema components         # View table schema
SELECT * FROM components LIMIT 5;  # Query data
```

### File Storage Structure
```
uploads/
├── imported-images/       # AliExpress import images
├── component-images/      # Manual component photos
└── backups/              # System-generated backups
```

## Import System Usage

### AliExpress HTML Import
1. **Upload**: POST `/api/import/aliexpress/preview` with HTML file
2. **Parse**: System extracts orders, items, and creates component data
3. **Review**: Preview parsed data before import
4. **Import**: POST `/api/import/aliexpress/import` with parsed data
5. **Track**: GET `/api/import/history` for import statistics

### Supported Import Formats
- HTML files from AliExpress order pages
- MHTML archives with embedded images
- Automatic component categorization based on product titles
- Cost calculations and inventory integration

### Import Flow Documentation
**Comprehensive Technical Documentation**: See `ALIEXPRESS_IMPORT_FLOW.md` for complete import process flow diagram including:
- 10-phase technical flow from file upload to database import
- Real-time SSE progress updates
- Database transaction handling and rollback scenarios
- Component classification algorithms
- Error handling and recovery mechanisms
- Key data structures and database schemas
- Performance considerations and batching strategies

## UI/UX Architecture

### Theme System
**PCB Green Theme**: The application uses a professional electronics-inspired color scheme:
- **Primary Color**: `#1B5E20` (Dark PCB Green)
- **Accent Color**: `#2E7D32` (Medium PCB Green) 
- **Success Color**: `#4caf50` (Light Green)
- **CSS Variables**: All colors defined in `:root` for consistent theming

### Responsive Design Patterns
- **Grid/List Views**: Toggle between card grid and compact list layouts
- **Icon Alignment**: All button icons use flexbox with `align-items: center` and `vertical-align: middle`
- **Mobile Optimization**: Responsive breakpoints with text truncation and wrapping
- **Thumbnail System**: Component images display as small thumbnails (28px) with error handling

### Component Architecture Patterns
- **Bulk Operations**: Checkbox selection with bulk action bars and confirmation dialogs
- **Empty States**: Standardized empty state components with call-to-action buttons
- **Status Indicators**: Color-coded status badges with consistent styling
- **Modal Dialogs**: Overlay dialogs for forms, details, and import workflows