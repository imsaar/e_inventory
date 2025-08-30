# Electronics Inventory Management System

A comprehensive web-based inventory management system designed specifically for electronics hobbyists to organize, categorize, and track their collection of electronic components.

## Features

✨ **Component Management**
- Detailed component database with electrical specifications
- Multi-level categorization (categories, subcategories, custom tags)
- Advanced search and filtering capabilities
- Component history and audit trail

🗂️ **Storage Organization**
- Hierarchical storage location system (Room → Cabinet → Drawer → Compartment)
- QR code generation for storage containers
- Visual location mapping and navigation

📋 **Project Integration**
- Project component assignment and tracking
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

## Project Structure

```
├── src/                    # React frontend
│   ├── components/         # Reusable UI components
│   ├── pages/             # Page components
│   ├── types/             # TypeScript type definitions
│   └── utils/             # Utility functions
├── server/                # Express.js backend
│   ├── routes/            # API route handlers
│   ├── models/            # Database models
│   └── database.ts        # Database configuration
├── data/                  # SQLite database storage
└── uploads/               # Component images and documents
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

## Database Schema

The application uses SQLite with the following main tables:
- `components` - Electronic component information and specifications
- `storage_locations` - Hierarchical storage location structure
- `projects` - Project information and status
- `project_components` - Many-to-many relationship between projects and components
- `component_history` - Audit trail for component changes
- `boms` - Generated Bills of Materials

## Development

### Running Tests
```bash
npm test
```

### Type Checking
```bash
npm run typecheck
```

### Linting
```bash
npm run lint
```

### Building for Production
```bash
npm run build
```

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

## License

MIT License - Feel free to modify and distribute for personal or commercial use.