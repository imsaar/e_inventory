# Electronics Inventory Management System

A comprehensive web-based inventory management system designed specifically for electronics hobbyists to organize, categorize, and track their collection of electronic components.

## Features

✨ **Component Management**
- Detailed component database with electrical specifications
- Multi-level categorization (categories, subcategories, custom tags)
- Photo attachments with secure image upload and management
- Advanced search and filtering capabilities
- Component history and audit trail
- Clickable links in descriptions for datasheets and documentation

🗂️ **Storage Organization**
- Hierarchical storage location system (Room → Cabinet → Drawer → Compartment)
- Advanced QR code system with dedicated printing page and individual size controls
- Professional detail views with breadcrumb navigation and comprehensive information display
- Photo attachments for locations with secure upload handling
- Tag-based organization with multi-tag support
- Visual location mapping and navigation

📋 **Project Integration**
- Project component assignment and tracking
- Tag-based project organization and categorization
- Bill of Materials (BOM) generation
- Component availability checking
- Usage analytics and cost tracking

📊 **Inventory Tracking**
- Real-time quantity tracking
- Low stock alerts and notifications
- Purchase history and cost analysis
- Component status management

🗑️ **Bulk Operations**
- Multi-select functionality across all pages
- Intelligent dependency checking before deletion
- Safe bulk deletion with detailed confirmation dialogs
- Prevents orphaned data by checking relationships

🔐 **Security Features**
- JWT-based authentication with role-based access control
- Input validation and SQL injection protection
- Rate limiting and security headers
- File upload security and XSS prevention
- Comprehensive audit logging

## Recent Enhancements

📦 **Complete Data Backup System (September 2025)** - Full system export/import functionality that creates comprehensive backups including database and all uploaded files in a single zip archive. Features automatic backup creation before imports, metadata tracking, intelligent compression, and separated UI controls for database-only vs full system operations.

🎨 **UI/UX Refinements (September 2025)** - List view now default for components page, reduced grid view image sizes for better content balance, added thumbnails to list view, removed disruptive alert popups from bulk operations, and improved dashboard reliability with better error handling.

🚀 **AliExpress Import System (September 2025)** - Complete HTML-based order import functionality with intelligent component recognition, automatic categorization, cost tracking, and comprehensive import history. Features advanced MHTML parsing with embedded image extraction, smart URL mapping for local image storage, and component thumbnail display in both grid and list views. Supports AliExpress order page parsing with smart component tagging and real-time progress tracking. Now also accepts Safari `.webarchive` exports of the My Orders page (binary plist parsing, embedded images extracted automatically).

🔬 **Order Detail Enrichment** - Upload an AliExpress order *detail* page (webarchive / MHTML / HTML) from the Order edit form to fill in the per-item data that the My Orders list page collapses on multi-product orders. The enrich endpoint validates the order number matches, handles multiple SKU variants of the same product ID, spreads "Store discount" and "Coin credit" proportionally across items so line totals sum to the actual item cost, stores the pre-discount list price alongside the paid price (`list_unit_cost`), auto-creates missing components and missing order item rows so nothing is silently dropped, and writes the authoritative order total back to the parent order. An "Open on AliExpress" button next to the upload deep-links to the order's detail page so you can save it in one click. **Bonus** (gift-card balance from prior refunds) is counted toward cost, not discount. **Additional charges** is parsed as **tax** and stored separately on the order so item unit costs stay post-discount / pre-tax — the items table shows Subtotal + Tax = Total. The upload UI reminds you to expand the collapsed price breakdown on the AliExpress page before saving, and the server warns + clamps `Total > Subtotal` gaps when the breakdown wasn't captured.

🆕 **One-click order creation from a detail page** - In "Add Order" the form has two shortcut buttons — "AliExpress detail page" and "Amazon detail page" — that accept an order detail webarchive/MHTML/HTML and create the order (number, date, supplier, items, totals, tax) in one step. Amazon detail parsing uses authoritative `data-component="shipments"` / `purchasedItems` / `orderDate` anchors to avoid recommendation carousels. When editing an existing order, the matching "Import detail page" button shows up automatically (label + endpoint depend on the order's `importSource`).

📦 **Multipack awareness** - When a listing bought in qty 1 contains N physical units ("10 PCS", "Pack of 5", "5 sets", "Set of 10", etc.), the importer now detects N from the product title and/or the AliExpress SKU variation, stores it on `order_items.pack_size`, and contributes `quantity × pack_size` to the linked component's stock. Variation text wins over title (so a title like "1 - 100PCS" with variation "30PCS" yields 30, not 1 or 100). Re-uploading a detail page via "Import detail page" retroactively corrects existing rows' pack size and rebalances component quantity by the delta.

💸 **List vs paid per-unit pricing** - The component detail page now shows **Unit Cost (paid)** — per physical unit after all AliExpress discounts — and the pre-discount **list unit cost** beneath (as muted strikethrough) when they differ. Derived from `SUM(order_items.quantity × list_unit_cost)` and `SUM(order_items.total_cost)` across delivered orders, divided by units-in-stock.

↩️ **Returned order status** - New `returned` status alongside `cancelled`. Both exclude the order from Dashboard spend totals (all-time / 7d / 30d / 12mo) and from the Orders page Total chip. Transitioning into or out of `returned`/`cancelled` via the order edit form rebalances the linked components' quantity by `± quantity × pack_size`.

🛒 **Components page sorted by most-recently-acquired** - `GET /api/components` default ordering is now most recent active order date first (falling back to component `createdAt`), so the components you just ordered float to the top. The search filter panel offers "Most Recently Acquired" (default), Unit Cost, and the previous options (Name, Category, Quantity, Last Updated, Created Date, Location) with direction-aware defaults — date-like sorts start DESC, textual start ASC.

⌨️ **Keyboard shortcuts and gestures** - **Esc** dismisses any open modal (Order/Component/Location/Project forms, detail views, bulk-delete dialog, AliExpress importer). **Cmd+S / Ctrl+S** saves the current edit form (fires the same `handleSubmit` the Save button uses, respects native form validation). **Double-click** on an order card or component card opens that record's detail view. Clicking through an order number from a component's detail view deep-links to `/orders?orderId=…` which auto-opens that order's detail modal.

🔓 **Authentication Removal (September 2025)** - Streamlined system for development and testing by removing authentication requirements from all endpoints. All API routes are now publicly accessible while maintaining core security features like rate limiting and input validation.

⚡ **Performance & Network Improvements (September 2025)** - Fixed Vite development server network accessibility, achieved sub-millisecond API response times, and implemented comprehensive testing suite with 230+ tests including full AliExpress import functionality coverage.

🛒 **Order Management System (January 2025)** - Complete order tracking with supplier management, comprehensive order forms with real-time cost calculations, advanced search and filtering (including a "Multi-item orders only" filter for isolating imported AliExpress orders with more than one product), and detailed order views with full component breakdowns.

🔍 **Enhanced Search Experience (January 2025)** - Advanced search functionality across all pages with real-time filtering, multi-parameter search on components and orders, intelligent sorting options, and responsive search interfaces optimized for mobile and desktop.

📊 **Dashboard Enhancements (January 2025)** - Added comprehensive order statistics, recent orders display with interactive cards, enhanced database management section with detailed metrics, and improved visual design with better stat card styling. Order value is now broken down in a single card across rolling windows: last 7 days, last 30 days, last 12 months, and all-time. All four totals use the same formula — `SUM(order_items.total_cost) + orders.tax` across non-cancelled orders — so manual line-item edits are reflected immediately and tax is counted but refunded (cancelled) money is not. Pending Orders similarly excludes cancelled.

🎨 **UI/UX Improvements (January 2025)** - Refined component forms by removing redundant quantity/cost fields (now calculated from orders), improved button contrast and accessibility, enhanced responsive grid layouts, and consistent visual styling across all components.

✨ **Enhanced User Interface (September 2025)** - Complete UI/UX overhaul with modern flexbox-based layouts, professional visual hierarchy, and mobile-responsive design. Enhanced detail views with comprehensive information display and intuitive navigation.

🖨️ **Dedicated QR Printing Page** - Moved from modal-based QR printing to a standalone page with individual size controls per location. Features card-based layout, advanced generation logic, and optimal printing workflows for mixed container sizes.

👁️ **Professional Detail Views** - Completely redesigned component and location detail views with rich information sections, category icons, status badges, electrical specifications, and comprehensive sidebar statistics. Full responsive design with mobile optimization.

💰 **Enhanced Cost Management** - Full cost tracking implementation with unit costs, total costs, and proper financial calculations. Fixed cost saving functionality with comprehensive validation.

📸 **Complete Photo Management** - Drag-and-drop photo upload with secure file handling, automatic validation, and cleanup. Photos display in detail views and forms with error handling and proper security measures.

🗄️ **Database Evolution** - Advanced migration system (v1→v6) with proper schema versioning, field additions, and backward compatibility. Automatic upgrades without data loss.

## Prerequisites

- **Node.js 24.x** — pinned in [`.nvmrc`](./.nvmrc). Other versions are not tested; `better-sqlite3` ships prebuilt binaries for active Node releases, so off-version Node may force a from-source rebuild.
- **SQLite 3.40+** — only needed for the direct CLI access shown below (`sqlite3 data/inventory.db`). The app itself embeds its own SQLite through `better-sqlite3`, so the application does not depend on a system install.

### macOS

```bash
# Node.js 24 via nvm (recommended — auto-selects the version from .nvmrc)
brew install nvm
nvm install 24
nvm use                # reads .nvmrc and switches to Node 24

# SQLite CLI — only if `sqlite3 --version` is missing or older than 3.40
brew install sqlite    # keg-only; invoke via $(brew --prefix sqlite)/bin/sqlite3
```

macOS Sonoma and newer ship a system `sqlite3` ≥ 3.43, so the Homebrew install is usually unnecessary.

### Ubuntu / Debian

```bash
# Node.js 24 via NodeSource
curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -
sudo apt-get install -y nodejs

# SQLite CLI
sudo apt-get install -y sqlite3
```

### Verify

```bash
node --version       # v24.x.x
sqlite3 --version    # 3.40 or newer
```

### Upgrading an existing checkout

If you already have the project cloned on Node 20 (or any earlier version), switching to Node 24 requires rebuilding the native bindings. `better-sqlite3` is compiled against the Node ABI it was installed under, so an existing `node_modules` will fail at startup with `NODE_MODULE_VERSION` mismatch (e.g. *"compiled against … 115. This version of Node.js requires … 137"*).

```bash
nvm install 24
nvm use                          # picks up .nvmrc

# Rebuild the native modules under the new Node:
npm rebuild better-sqlite3       # fastest path

# …or do a clean re-install if you also want to clear stale transitives:
rm -rf node_modules package-lock.json
npm install
```

## Quick Start

1. **Install dependencies**
   ```bash
   npm install
   ```

2. **Start the development server**
   ```bash
   npm run dev
   ```
   
   This will start both the backend API server (port 3001) and frontend development server (port 5173).

3. **Access the application**
   - Frontend: http://localhost:5173
   - API: http://localhost:3001/api
   - Default admin login: `admin` / `admin123456` ⚠️ **Change immediately!**

## Project Structure

```
├── src/                    # React frontend
│   ├── components/         # Reusable UI components
│   ├── pages/             # Page components (Dashboard, Components, Locations, QRPrinting, Projects)
│   ├── types/             # TypeScript type definitions
│   └── utils/             # Utility functions
├── server/                # Express.js backend
│   ├── routes/            # API route handlers
│   ├── middleware/        # Security and validation middleware
│   └── database.ts        # Database configuration
├── data/                  # SQLite database storage
│   └── inventory.db       # Main application database
├── uploads/               # Component images and documents
└── tests/                 # Test files and test databases
```

## API Endpoints

### Components
- `GET /api/components` - List all components with filtering
- `POST /api/components` - Create new component
- `PUT /api/components/:id` - Update component
- `DELETE /api/components/:id` - Delete component
- `POST /api/components/bulk-delete` - Bulk delete with dependency checking
- `POST /api/components/check-dependencies` - Check deletion dependencies
- `GET /api/components/:id/history` - Component history
- `GET /api/components/alerts/low-stock` - Low stock alerts

### Storage Locations
- `GET /api/locations` - List all locations (hierarchical)
- `GET /api/locations/:id` - Get location details with full path and statistics
- `POST /api/locations` - Create new location with QR code generation and photo
- `PUT /api/locations/:id` - Update location with QR size and photo management
- `DELETE /api/locations/:id` - Delete location
- `POST /api/locations/bulk-delete` - Bulk delete with dependency checking
- `POST /api/locations/check-dependencies` - Check deletion dependencies
- `GET /api/locations/:id/components` - Components in location
- `GET /api/locations/qr-codes/pdf` - Generate QR codes for printing with individual size selection per location

### Projects
- `GET /api/projects` - List all projects
- `POST /api/projects` - Create new project
- `PUT /api/projects/:id` - Update project
- `DELETE /api/projects/:id` - Delete project
- `POST /api/projects/bulk-delete` - Bulk delete with dependency checking
- `POST /api/projects/check-dependencies` - Check deletion dependencies
- `POST /api/projects/:id/components` - Add component to project
- `DELETE /api/projects/:projectId/components/:componentId` - Remove component
- `POST /api/projects/:id/bom` - Generate BOM
- `GET /api/projects/:id/boms` - List project BOMs

### Orders
- `GET /api/orders` - List all orders with advanced search and filtering. Query params: `term`, `status`, `supplier`, `dateFrom`, `dateTo`, `minAmount`, `maxAmount`, `minItemCount` (e.g. `minItemCount=2` returns only multi-item orders), `sortBy`, `sortOrder`
- `GET /api/orders/:id` - Get order details with all order items
- `POST /api/orders` - Create new order with component items
- `PUT /api/orders/:id` - Update order information
- `DELETE /api/orders/:id` - Delete order and reverse inventory changes

### AliExpress Import
See [ALIEXPRESS_IMPORT_FLOW.md](./ALIEXPRESS_IMPORT_FLOW.md) for the full pipeline and [AMAZON_IMPORT_FLOW.md](./AMAZON_IMPORT_FLOW.md) for the Amazon variant.
- `GET /api/import/test` - Test import system endpoint
- `GET /api/import/history` - Get import history with statistics
- `POST /api/import/aliexpress/preview` - Upload and preview AliExpress HTML, MHTML, or .webarchive file
- `POST /api/import/aliexpress/import` - Import parsed orders and create components
- `POST /api/import/aliexpress/fetch-title` - Fetch a product title from AliExpress for a given product URL (used by the order edit form to enrich placeholder titles from multi-product imports)
- `POST /api/import/aliexpress/enrich-order/:orderId` - Upload an order detail page (webarchive/MHTML/HTML) and update the existing order's items in place. Matches items by product ID (with positional fallback for orphan rows), spreads the discount factor across items, creates any missing rows, factors bonus into cost (not discount), stores tax separately, clamps Total to Subtotal when the breakdown was collapsed, and overwrites `orders.total_amount` with items + tax.
- `POST /api/import/aliexpress/create-from-detail` - Create a brand-new order from an uploaded detail page. 409 if an order with that `order_number` already exists (returns `existingOrderId` so the UI can suggest enrichment instead).
- `POST /api/import/amazon/create-from-detail` - Create a brand-new order from an uploaded Amazon detail page. Same cost decomposition and 409 behaviour as AliExpress.
- `POST /api/import/amazon/enrich-order/:orderId` - Enrich an existing Amazon-sourced order with a detail-page upload (same semantics as the AliExpress enrich endpoint; matches items by ASIN).

### Database Management
- `GET /api/database/info` - Get database information and statistics
- `GET /api/database/export` - Export database backup (.db file)
- `POST /api/database/import` - Import database from backup file (.db)
- `GET /api/database/export-all` - Export complete backup (database + uploads as .zip)
- `POST /api/database/import-all` - Import complete backup from .zip file

### File Uploads
- `POST /api/uploads/photo` - Upload component/location photos (multipart/form-data)
- `DELETE /api/uploads/photo` - Delete uploaded photo by URL

### Authentication (Public Access)
**Note**: All authentication endpoints are now publicly accessible without requiring tokens.
- `POST /api/auth/login` - User login (public)
- `GET /api/auth/me` - Get current user info (public)
- `POST /api/auth/change-password` - Change password (public)
- `POST /api/auth/register` - Register new user (public)
- `GET /api/auth/users` - List all users (public)

## Database Storage

> **Full layout, env-var overrides, static-serve security rules, and backup / restore endpoints are documented in [STORAGE.md](./STORAGE.md).** The summary below covers the common cases.

### Database Location
The application uses **SQLite** for data storage with files located at:
```
data/
├── inventory.db          # Main application database (production, auto-created)
├── inventory-dev.db      # Dev-mode database when NODE_ENV=development
└── (backup files)        # Manual backups (recommended)
```

Images and other binary assets live under `uploads/` (`imported-images/`, `component-images/`, `imports/`, `backups/`) — see [STORAGE.md](./STORAGE.md) for the full map.

### Database Schema
The SQLite database includes these main tables:
- `components` - Electronic component information and specifications
- `storage_locations` - Hierarchical storage location structure (Room → Cabinet → Drawer → Box)
- `projects` - Project information and status
- `project_components` - Many-to-many relationship between projects and components
- `component_history` - Audit trail for component changes and quantity updates
- `boms` - Generated Bills of Materials with versioning
- `users` - User accounts with authentication and role-based permissions

### File Storage
Component images and documents are stored in:
```
uploads/
├── component-images/     # Component photos (JPG, PNG, etc.)
├── datasheets/          # PDF datasheets and documentation
└── documents/           # Other related files
```

### Database Access
You can directly access the SQLite database using standard tools:
```bash
# Using SQLite command line
sqlite3 data/inventory.db

# View all tables
.tables

# View component data
SELECT name, quantity, category FROM components LIMIT 10;

# View storage hierarchy
SELECT id, name, type, parentId FROM storage_locations;
```

### Backup Recommendations
**Important**: Regular backups are essential for data safety:
```bash
# Create backup
cp data/inventory.db data/inventory-backup-$(date +%Y%m%d).db

# Automated backup (add to crontab)
0 2 * * * cp /path/to/data/inventory.db /path/to/backups/inventory-$(date +\%Y\%m\%d).db
```

### Database Security
- Database files are excluded from version control (`.gitignore`)
- Set proper file permissions in production: `chmod 600 data/inventory.db`
- Consider encryption for sensitive environments
- Implement regular backup and recovery procedures

## Development

### Environment Setup
1. **Copy environment configuration**
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

2. **Database initialization** (automatic on first run)
   - Creates `data/inventory.db` with all required tables
   - Sets up default admin user: `admin` / `admin123456`
   - Configures foreign key constraints and indexes

### Running Tests
```bash
npm test                 # Run all tests (150+ test cases)
npm run test:watch       # Run tests in watch mode
npm run test:coverage    # Run tests with coverage report

# Run specific test suites
npm test qr-code-size.test.ts          # QR code functionality tests
npm test photo-management.test.ts      # Photo upload and management tests  
npm test location-detail-view.test.ts  # Detail view functionality tests
```

### Code Quality
```bash
npm run typecheck        # TypeScript type checking
npm run lint             # ESLint code analysis
npm run build            # Production build
```

### Security
- See `SECURITY.md` for comprehensive security guidelines
- Default credentials must be changed in production
- Configure proper environment variables for production deployment

## Usage Examples

### AliExpress Import Workflow
1. Go to AliExpress → Account → My Orders and scroll to load all orders you want to import
2. Save the page in one of these formats:
   - **Chrome/Edge:** Right-click → "Save As" → "Webpage, Single File" (`.mhtml`)
   - **Safari:** File → Save As → Format "Web Archive" (`.webarchive`)
   - **Firefox / fallback:** Right-click → "Save As" → "Webpage, Complete" (`.html` + folder)
3. In the app, go to Orders → "Import from AliExpress" and upload the saved file (50 MB max)
4. Review parsed order data with automatic component recognition
5. Confirm import to create orders and components automatically
6. Check import history for tracking and statistics

> Both `.mhtml` and `.webarchive` bundle product images into the file itself, so no external image fetching is needed during import.
>
> **Multi-product orders:** AliExpress collapses orders containing more than one product to a thumbnail strip on the My Orders page — per-item titles, quantities, and unit prices are not rendered there. The importer creates one item per thumbnail with a placeholder title (`AliExpress item <product-id>`) and an even split of the order total; review and edit these in the order detail view after import.
>
> **Fetch real titles on demand:** In the order edit form, placeholder items get a "Fetch title" button next to the name. Clicking it asks the backend to fetch the AliExpress product page (following the .com → login → .us cookie-set redirect chain) and updates the linked component name + order item title. AliExpress's anti-bot may occasionally block — failures surface inline so you can retry or rename manually.
>
> **Best path for multi-product orders: upload the order detail page.** The order edit form has an "Open on AliExpress" button that opens the order's detail page in a new tab — save that page as a `.webarchive` (Safari) or `.mhtml` (Chrome) and upload it via "Import detail page". The server pulls per-item titles, quantities, list prices, and SKU variants, spreads the Store discount + Coin credit proportionally so line totals sum to the paid amount, and creates any rows the original My Orders import collapsed.

### Adding Components
1. Navigate to the Components page
2. Click "Add Component"
3. Fill in component details including:
   - Basic info (name, part number, manufacturer)
   - Electrical specifications (voltage, current, protocols)
   - Storage location assignment (quantities/costs now handled via orders)

### Organizing Storage
1. Go to Locations page
2. Create hierarchical storage structure:
   - Workshop (Room) → Electronics Cabinet (Cabinet) → IC Drawer (Drawer) → 74HC Series (Box)
3. Generate QR codes for physical labeling
4. Assign components to specific locations

### Managing Projects
1. Create a new project in Projects page
2. Add required components from inventory
3. Generate Bill of Materials (BOM)
4. Track component usage and project costs

### Using Bulk Operations
1. Navigate to any listing page (Components, Locations, or Projects)
2. Click "Bulk Select" to enter selection mode
3. Select multiple items using checkboxes
4. Click "Delete Selected" to review dependencies
5. The system will show:
   - Items that can be safely deleted (green indicators)
   - Items blocked by dependencies (red indicators with explanations)
   - Detailed dependency information (child locations, assigned components, etc.)
6. Confirm deletion of safe items while blocked items remain protected

## Customization

The system is designed to be flexible and customizable:
- Add custom component categories in `ComponentForm.tsx`
- Modify electrical specifications fields in `types/index.ts`
- Extend search filters in `Components.tsx`
- Add custom fields to the database schema

## Production Deployment

### Quick Deployment Checklist
1. **Security Setup**
   ```bash
   # Change default admin password immediately
   # Set strong environment variables
   JWT_SECRET=your-super-secure-64-character-secret-key
   SESSION_SECRET=your-super-secure-64-character-session-key
   NODE_ENV=production
   ```

2. **Database Setup**
   ```bash
   # Ensure data directory exists with proper permissions
   mkdir -p data
   chmod 700 data
   
   # Database will be created automatically on first run
   # Set proper permissions after creation
   chmod 600 data/inventory.db
   ```

3. **File Permissions**
   ```bash
   # Secure upload directory
   mkdir -p uploads
   chmod 755 uploads
   
   # Set process owner
   chown -R app:app data/ uploads/
   ```

4. **Reverse Proxy Setup**
   - Configure nginx/Apache for HTTPS termination
   - Set up proper security headers
   - Enable rate limiting at proxy level

5. **Monitoring**
   - Set up log rotation for application logs
   - Monitor database file size and growth
   - Implement automated backup strategy

See `SECURITY.md` for comprehensive production deployment guidance.

## Troubleshooting

### Common Issues

**Database locked error**
```bash
# Check for running processes
lsof data/inventory.db
# Kill any hanging processes and restart
```

**Permission denied on database**
```bash
# Fix file permissions
chmod 600 data/inventory.db
chown app:app data/inventory.db
```

**Upload directory errors**
```bash
# Ensure upload directory exists and is writable
mkdir -p uploads
chmod 755 uploads
```

## License

MIT License - Feel free to modify and distribute for personal or commercial use.

---

**📞 Support & Security**
- Report security issues: See `SECURITY.md` for responsible disclosure
- Documentation: Check `SECURITY.md` for deployment and security guidelines
- Default admin credentials: `admin` / `admin123456` ⚠️ **Change immediately!**