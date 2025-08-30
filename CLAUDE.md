# CLAUDE.md

This file provides guidance to Claude Code when working with this Electronics Inventory Management System.

## Project Overview

A comprehensive web-based inventory management system for electronics hobbyists to organize, categorize, and track electronic components.

**Tech Stack**: React + TypeScript frontend, Express.js + SQLite backend

## Development Commands

```bash
npm run dev        # Start both frontend (5173) and backend (3001)
npm run client     # Frontend dev server only (Vite)
npm run server     # Backend API server only (Express + nodemon)
npm run build      # Production build
npm run lint       # ESLint code analysis
npm run typecheck  # TypeScript type checking
```

## Project Structure

```
├── src/                    # React frontend (TypeScript)
│   ├── components/         # Reusable UI components
│   ├── pages/             # Page components
│   ├── types/             # TypeScript definitions
│   └── utils/             # Helper functions
├── server/                # Express.js backend
│   ├── routes/            # API endpoints
│   ├── models/            # Database models
│   └── database.ts        # SQLite configuration
├── data/                  # SQLite database files
└── uploads/               # Component images/documents
```

## Key Features

- **Component Management**: Electronics database with specifications, search, filtering
- **Storage Organization**: Hierarchical locations (Room → Cabinet → Drawer → Box)
- **Project Integration**: BOMs, component tracking, usage analytics
- **Inventory Tracking**: Quantity monitoring, low stock alerts

## Database

- **SQLite** with tables: components, storage_locations, projects, project_components, component_history, boms
- Database files stored in `data/` directory

## API Endpoints

- `/api/components` - Component CRUD operations
- `/api/locations` - Storage location management  
- `/api/projects` - Project and BOM management

## Development Notes

- Frontend runs on port 5173, backend API on port 3001
- Uses better-sqlite3 for database operations
- File uploads handled with multer (images stored in uploads/)
- React Router for navigation, Lucide React for icons