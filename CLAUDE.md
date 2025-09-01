# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A production-ready web-based inventory management system for electronics hobbyists with comprehensive security implementations.

**Tech Stack**: React + TypeScript frontend, Express.js + SQLite backend with JWT authentication

## Development Commands

```bash
# Core Development
npm run dev        # Start both frontend (5173) and backend (3001)  
npm run client     # Frontend dev server only (Vite)
npm run server     # Backend API server only (Express + nodemon with ts-node)

# Code Quality
npm run lint       # ESLint code analysis
npm run typecheck  # TypeScript type checking
npm run build      # Production build

# Testing
npm test           # Run all tests
npm run test:watch # Run tests in watch mode  
npm run test:coverage # Run tests with coverage
```

## Architecture Overview

### Security-First Design
The application implements comprehensive OWASP security measures including:
- **Authentication**: JWT-based with bcrypt password hashing
- **Authorization**: Role-based access control (admin/user)
- **Input Validation**: Zod schemas with XSS prevention
- **Rate Limiting**: Tiered limits (general/auth/bulk operations)
- **Security Headers**: Helmet.js with CSP, HSTS, etc.
- **SQL Injection Protection**: Parameterized queries throughout

### Backend Architecture
```
server/
├── index.ts                # Main server with security middleware stack
├── database.ts             # SQLite configuration with foreign keys
├── middleware/             # Security and validation layers
│   ├── auth.ts            # JWT auth, user management, RBAC
│   ├── security.ts        # Headers, rate limiting, CORS, logging
│   └── validation.ts      # Zod schemas, sanitization, request limits
└── routes/                # API endpoints with validation middleware
    ├── auth.ts           # Authentication endpoints
    ├── components.ts     # Component CRUD with bulk operations
    ├── locations.ts      # Storage location hierarchy
    └── projects.ts       # Project management with BOMs
```

### Middleware Stack Order (Critical)
1. Security headers (helmet)
2. Security logging and monitoring
3. Rate limiting (general → auth → strict)
4. Session management
5. CORS with domain whitelist
6. Body parsing with size limits
7. Input sanitization
8. Route-specific validation schemas
9. Authentication/authorization

### Database Design
**SQLite** with strict foreign key constraints and the following hierarchy:
- `users` (authentication with roles)
- `storage_locations` (hierarchical: Room → Cabinet → Drawer → Box)
- `components` (linked to locations)
- `projects` (with component assignments)
- `project_components` (many-to-many with quantities)
- `component_history` (audit trail)
- `boms` (versioned bills of materials)

### Frontend Architecture
- **Pages**: Main application routes with bulk operations support
- **Components**: Reusable UI with security-aware forms
- **Types**: Comprehensive TypeScript definitions matching backend schemas
- **Validation**: Client-side validation mirrors backend Zod schemas

## Security Implementation Details

### Authentication Flow
1. Default admin user created on first run: `admin` / `admin123456`
2. JWT tokens with configurable expiration (default 24h)
3. Session-based CSRF protection
4. Role-based route protection with middleware

### Bulk Operations Security
All bulk operations (delete/check-dependencies) include:
- Input validation (max 100 items)
- Dependency checking to prevent orphaned data
- Transaction support for data integrity
- Detailed user confirmation with dependency preview

### File Upload Security
- Type validation and size limits (10MB)
- Secure static serving with proper headers
- Prevention of script execution in upload directory
- Content-Security-Policy enforcement

## Environment Configuration

**Required Environment Variables for Production:**
```bash
NODE_ENV=production
JWT_SECRET=your-super-secure-64-character-secret
SESSION_SECRET=your-super-secure-64-character-secret
DATABASE_PATH=./data/inventory.db
DEFAULT_ADMIN_PASSWORD=strong-unique-password
ALLOWED_ORIGINS=https://yourdomain.com
```

## Testing Architecture

- **Unit Tests**: Individual route and middleware testing
- **Integration Tests**: Full API endpoint testing with test databases
- **Security Tests**: SQL injection, input validation, rate limiting
- **Test Isolation**: Each test uses separate SQLite database files

## Critical Security Notes

- Database auto-initializes on first run with default admin user
- All user inputs are validated with Zod schemas before database operations
- Rate limiting prevents brute force and DoS attacks
- Comprehensive audit logging for security monitoring
- Production deployment requires HTTPS and proper environment configuration

## Development Workflow

When working on this codebase:
1. Security middleware is applied globally - test all changes thoroughly
2. All new routes must include appropriate validation middleware
3. Database changes require foreign key constraint consideration
4. Authentication is required for all non-public endpoints
5. Run `npm run typecheck` before commits to ensure type safety