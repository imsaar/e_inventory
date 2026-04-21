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

🔬 **Order Detail Enrichment** - Upload an AliExpress order *detail* page (webarchive / MHTML / HTML) from the Order edit form to fill in the per-item data that the My Orders list page collapses on multi-product orders. The enrich endpoint validates the order number matches, handles multiple SKU variants of the same product ID, spreads the "Store discount" and "Coin credit" proportionally across items so line totals sum to the actual paid amount, stores the pre-discount list price alongside the paid price (`list_unit_cost`), auto-creates missing components and missing order item rows so nothing is silently dropped, and writes the authoritative order total back to the parent order. An "Open on AliExpress" button next to the upload deep-links to the order's detail page so you can save it in one click.

🔓 **Authentication Removal (September 2025)** - Streamlined system for development and testing by removing authentication requirements from all endpoints. All API routes are now publicly accessible while maintaining core security features like rate limiting and input validation.

⚡ **Performance & Network Improvements (September 2025)** - Fixed Vite development server network accessibility, achieved sub-millisecond API response times, and implemented comprehensive testing suite with 230+ tests including full AliExpress import functionality coverage.

🛒 **Order Management System (January 2025)** - Complete order tracking with supplier management, comprehensive order forms with real-time cost calculations, advanced search and filtering (including a "Multi-item orders only" filter for isolating imported AliExpress orders with more than one product), and detailed order views with full component breakdowns.

🔍 **Enhanced Search Experience (January 2025)** - Advanced search functionality across all pages with real-time filtering, multi-parameter search on components and orders, intelligent sorting options, and responsive search interfaces optimized for mobile and desktop.

📊 **Dashboard Enhancements (January 2025)** - Added comprehensive order statistics, recent orders display with interactive cards, enhanced database management section with detailed metrics, and improved visual design with better stat card styling. Order value is now broken down in a single card across rolling windows: last 7 days, last 30 days, last 12 months, and all-time.

🎨 **UI/UX Improvements (January 2025)** - Refined component forms by removing redundant quantity/cost fields (now calculated from orders), improved button contrast and accessibility, enhanced responsive grid layouts, and consistent visual styling across all components.

✨ **Enhanced User Interface (September 2025)** - Complete UI/UX overhaul with modern flexbox-based layouts, professional visual hierarchy, and mobile-responsive design. Enhanced detail views with comprehensive information display and intuitive navigation.

🖨️ **Dedicated QR Printing Page** - Moved from modal-based QR printing to a standalone page with individual size controls per location. Features card-based layout, advanced generation logic, and optimal printing workflows for mixed container sizes.

👁️ **Professional Detail Views** - Completely redesigned component and location detail views with rich information sections, category icons, status badges, electrical specifications, and comprehensive sidebar statistics. Full responsive design with mobile optimization.

💰 **Enhanced Cost Management** - Full cost tracking implementation with unit costs, total costs, and proper financial calculations. Fixed cost saving functionality with comprehensive validation.

📸 **Complete Photo Management** - Drag-and-drop photo upload with secure file handling, automatic validation, and cleanup. Photos display in detail views and forms with error handling and proper security measures.

🗄️ **Database Evolution** - Advanced migration system (v1→v6) with proper schema versioning, field additions, and backward compatibility. Automatic upgrades without data loss.

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
- `GET /api/import/test` - Test import system endpoint
- `GET /api/import/history` - Get import history with statistics
- `POST /api/import/aliexpress/preview` - Upload and preview AliExpress HTML, MHTML, or .webarchive file
- `POST /api/import/aliexpress/import` - Import parsed orders and create components
- `POST /api/import/aliexpress/fetch-title` - Fetch a product title from AliExpress for a given product URL (used by the order edit form to enrich placeholder titles from multi-product imports)
- `POST /api/import/aliexpress/enrich-order/:orderId` - Upload an order detail page (webarchive/MHTML/HTML) and update the existing order's items in place. Matches items by product ID (with positional fallback for orphan rows), spreads the discount factor across items, creates any missing rows, and overwrites `orders.total_amount` with the authoritative paid total.

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

### Database Location
The application uses **SQLite** for data storage with files located at:
```
data/
├── inventory.db          # Main application database (auto-created)
└── (backup files)        # Manual backups (recommended)
```

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