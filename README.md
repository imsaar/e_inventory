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
- QR code generation with multiple sizes (small, medium, large) for different containers
- Selective QR code printing with location chooser and size options
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

🆕 **QR Code System** - Generate printable QR codes in three sizes (small, medium, large) with selective location printing and size customization for different container types.

📸 **Photo Management** - Upload and manage photos for components and locations with secure file handling, automatic resizing, and cleanup functionality.

🏷️ **Enhanced Tagging** - Comprehensive tag support across all entities (components, locations, projects) with intuitive tag input and management.

🔗 **Rich Text Links** - Clickable links in descriptions automatically detected and rendered for easy access to datasheets and documentation.

🗄️ **Database Migrations** - Automatic schema versioning and migration system for seamless upgrades without data loss.

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
│   ├── pages/             # Page components
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
- `POST /api/locations` - Create new location
- `PUT /api/locations/:id` - Update location
- `DELETE /api/locations/:id` - Delete location
- `POST /api/locations/bulk-delete` - Bulk delete with dependency checking
- `POST /api/locations/check-dependencies` - Check deletion dependencies
- `GET /api/locations/:id/components` - Components in location
- `GET /api/locations/qr-codes/pdf` - Generate QR codes with size and location selection

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

### File Uploads
- `POST /api/uploads/photo` - Upload component/location photos (multipart/form-data)
- `DELETE /api/uploads/photo` - Delete uploaded photo by URL

### Authentication
- `POST /api/auth/login` - User login
- `GET /api/auth/me` - Get current user info
- `POST /api/auth/change-password` - Change password
- `POST /api/auth/register` - Register new user (admin only)
- `GET /api/auth/users` - List all users (admin only)

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
npm test                 # Run all tests
npm run test:watch       # Run tests in watch mode
npm run test:coverage    # Run tests with coverage report
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

### Adding Components
1. Navigate to the Components page
2. Click "Add Component"
3. Fill in component details including:
   - Basic info (name, part number, manufacturer)
   - Electrical specifications (voltage, current, protocols)
   - Inventory details (quantity, cost, supplier)
   - Storage location assignment

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