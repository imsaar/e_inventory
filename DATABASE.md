# Database Configuration Guide

This document explains the database setup and environment separation for the Electronics Inventory Management System.

## 📁 Database Files by Environment

### **Development Environment**
- **File**: `data/inventory-dev.db`  
- **Environment**: `NODE_ENV=development` (default)
- **Usage**: Local development and testing new features

### **Production Environment**
- **File**: `data/inventory.db`
- **Environment**: `NODE_ENV=production`
- **Usage**: Production deployment with real inventory data

### **Test Environment**
- **Files**: `data/test/test-inventory-{timestamp}.db`
- **Environment**: `NODE_ENV=test`
- **Usage**: Automated testing with isolated databases
- **Cleanup**: Automatically deleted after test runs

## 🔧 Configuration Options

### Environment Variables

```bash
# Node Environment (determines database file)
NODE_ENV=development|production|test

# Custom database path (overrides default logic)
DB_PATH=/path/to/custom/database.db

# Custom data directory (production only)
DATA_DIR=/var/lib/inventory-app/data

# Server port
PORT=3001
```

### Default Paths

| Environment | Database File Path |
|-------------|-------------------|
| Development | `data/inventory-dev.db` |
| Production  | `data/inventory.db` |
| Test        | `data/test/test-inventory-{timestamp}.db` |

## 🧪 Testing Database Features

### **Isolation**
- Each test run gets a **unique database** with timestamp
- Tests **don't interfere** with each other
- **Automatic cleanup** after test completion

### **Reset Function**
```typescript
import { resetDatabase } from '../server/database';

// Only works in test environment
resetDatabase(); // Drops all tables and recreates schema
```

### **Database Info**
```typescript
import { getDatabaseInfo } from '../server/database';

const info = getDatabaseInfo();
console.log(info);
// {
//   path: "/path/to/test-inventory-123456789.db",
//   isTest: true,
//   isDevelopment: false, 
//   isProduction: false,
//   dataDir: "/path/to/data/test"
// }
```

## 🚀 Production Deployment

### **Recommended Setup**
1. Set `NODE_ENV=production`
2. Set `DATA_DIR=/var/lib/inventory-app/data` 
3. Ensure proper file permissions for database directory
4. Set up regular backups of `inventory.db`

### **Custom Database Location**
```bash
# Option 1: Custom data directory (production)
DATA_DIR=/opt/inventory/data

# Option 2: Custom database path (any environment)
DB_PATH=/opt/inventory/custom-location.db
```

## 📊 Database Schema

All environments use the same schema with these tables:

- **users** - User accounts and authentication
- **storage_locations** - Hierarchical storage organization
- **components** - Electronics components inventory
- **projects** - Project management
- **project_components** - Component allocation to projects
- **boms** - Bills of materials
- **component_history** - Audit trail for component changes

## 🔒 Security Considerations

### **File Permissions**
```bash
# Secure database files (production)
chmod 600 data/inventory.db
chown app-user:app-group data/inventory.db
```

### **Backup Strategy**
```bash
# Create regular backups
sqlite3 data/inventory.db ".backup backup-$(date +%Y%m%d).db"

# Verify backup integrity
sqlite3 backup-20240901.db "PRAGMA integrity_check;"
```

## 🔍 Troubleshooting

### **Database Not Found**
```bash
# Check environment and path
node -e "console.log(require('./server/database').getDatabaseInfo())"
```

### **Permission Errors**
```bash
# Fix directory permissions
mkdir -p data
chmod 755 data
chmod 644 data/inventory-dev.db
```

### **Test Database Issues**
```bash
# Clean up stuck test databases
rm -rf data/test/
```

### **Migration Between Environments**
```bash
# Copy development data to production
cp data/inventory-dev.db data/inventory.db

# Reset to clean state  
rm data/inventory-dev.db
# Database will be recreated on next startup
```

## ⚡ Quick Commands

```bash
# Start in development mode (default)
npm run server

# Start in production mode
NODE_ENV=production npm run server

# Run tests (uses test database)
npm test

# Check database configuration
node -e "console.log(require('./server/database').getDatabaseInfo())"
```

## 📝 Notes

- **Test databases** are automatically cleaned up after test runs
- **Development and production** databases persist between runs
- **Database separation** prevents accidental data corruption during testing
- **Schema migrations** are handled automatically on startup
- **Foreign keys** are enabled for referential integrity