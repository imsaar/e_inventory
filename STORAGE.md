# Storage & Data Layout

This document describes where the application persists data on disk — both the
SQLite database and everything under `uploads/`. It's referenced from the
[README](./README.md) and aimed at self-hosters who want to know what to back
up, where to mount volumes, or how to migrate between machines.

## TL;DR

Only two top-level directories hold persistent data:

- **`data/`** — the SQLite database file(s)
- **`uploads/`** — all binary assets (product images, manual photos, temp
  imports, backup zips)

Everything else in the repo is code / build output / `node_modules` and can be
regenerated from git + `npm install`. To back the app up, back up those two
directories.

## SQLite database

### Default location

The filename depends on `NODE_ENV`:

| `NODE_ENV`                        | Path                             |
| --------------------------------- | -------------------------------- |
| `test`                            | `data/test/inventory-test-*.db`  (unique per-test-run file) |
| `development` *(default for `npm run dev`)* | `data/inventory-dev.db`  |
| `production`                      | `data/inventory.db`              |
| unset (treated as production)     | `data/inventory.db`              |

Paths are relative to the repo root (`process.cwd()`).

### Overrides

Two environment variables, in order of precedence:

1. **`DB_PATH`** — absolute path to the SQLite file. Wins over everything else.
2. **`DATA_DIR`** — directory that holds the DB file (production only). The
   filename stays `inventory.db`.

Example: run a Docker container with a mounted volume:

```bash
docker run -e NODE_ENV=production -e DATA_DIR=/var/lib/e_inventory \
  -v /host/e_inventory_data:/var/lib/e_inventory \
  -v /host/e_inventory_uploads:/app/uploads \
  e_inventory
```

Source: `server/database.ts:12-29`.

### Schema version

Tracked in the `schema_version` table. Self-healing migrations run on startup;
see `CLAUDE.md` → *Database Schema Evolution* for the list.

### Direct access

```bash
sqlite3 data/inventory-dev.db
.tables
.schema orders
SELECT order_number, status, total_amount, tax FROM orders LIMIT 10;
```

## Uploads directory

Everything non-DB lives under `uploads/`, resolved as `<process.cwd()>/uploads`
(i.e. the repo root when you run `npm run dev` from there). Served by the
backend at the `/uploads/*` URL prefix (`server/index.ts:60`).

```
uploads/
├── imported-images/      AliExpress product thumbnails extracted from
│                         webarchives/MHTML, plus any CDN-downloaded fallbacks.
│                         Component `image_url` fields point here.
│
├── component-images/     Manual per-component photo uploads from the
│                         component form (POST /api/uploads/photo).
│
├── imports/              Temporary landing zone for uploaded .webarchive /
│                         .mhtml / .html files during parsing. Multer writes
│                         here; each file is unlinked after the parse
│                         completes (success or failure).
│
└── backups/              System-generated backup zips — created before
                          Factory Reset and some bulk-import operations.
```

Server paths & configuration:

| Path                    | Source                                               |
| ----------------------- | ---------------------------------------------------- |
| `/uploads/` static serve| `server/index.ts:60`                                 |
| `uploads/imported-images/` | `server/utils/mhtmlParser.ts`, `webarchiveParser.ts`, `routes/import.ts` |
| `uploads/imports/`      | `server/routes/import.ts:28`                         |
| `uploads/` base resolver | `server/routes/uploads.ts:10` (`../../uploads`)     |
| Backup/restore zip handling | `server/routes/database.ts`                       |

### Static-file security

Static serving in `server/index.ts` applies:

- `X-Content-Type-Options: nosniff`
- `Content-Security-Policy: default-src 'none'; img-src 'self'` — prevents
  script execution from anything under `uploads/`
- Forces `Content-Disposition: attachment` for file types outside the known
  image allow-list (`.jpg / .jpeg / .png / .gif / .webp / .svg`).

## What's stored where

| Kind of data                    | Where                                       | How it got there                                   |
| ------------------------------- | ------------------------------------------- | -------------------------------------------------- |
| Orders / order items / components / locations / projects | `data/inventory-dev.db` (SQLite) | All DB writes                                      |
| AliExpress product images       | `uploads/imported-images/<hash>.<ext>`      | Webarchive / MHTML extraction + CDN fallback        |
| Manually-uploaded component photos | `uploads/component-images/`              | `POST /api/uploads/photo`                          |
| Temporary import files          | `uploads/imports/`                          | Multer writes during upload; unlinked after parse  |
| Auto-backups (zip)              | `uploads/backups/`                          | Factory Reset / pre-import safety                  |
| User-triggered full exports     | Streamed as `.zip` — not persisted on the server by default | `GET /api/database/export-all`                    |

Nothing else is persisted outside these two top-level directories.

## Backup & restore

### Quick manual backup

```bash
# Database only
cp data/inventory.db data/inventory-backup-$(date +%Y%m%d).db

# Full backup (database + uploads)
tar czf e_inventory-backup-$(date +%Y%m%d).tar.gz data uploads
```

### API-driven backup

| Endpoint                           | Returns                          |
| ---------------------------------- | -------------------------------- |
| `GET /api/database/export`         | Database file (`.db`)            |
| `GET /api/database/export-all`     | Database + `uploads/` as `.zip`  |
| `POST /api/database/import`        | Replace DB from uploaded `.db`   |
| `POST /api/database/import-all`    | Replace DB + uploads from `.zip` |

### What to include in automated backups

For complete restore capability, back up **both**:

1. `data/` — the SQLite file (or files, in test environments)
2. `uploads/` — image assets

Skip:

- `node_modules/` — reinstall with `npm install`
- `dist/` — rebuild with `npm run build`
- `.nvmrc`, source — already in git

### File permissions in production

```bash
chmod 700 data                    # dir
chmod 600 data/inventory.db       # file — the app is the only reader/writer
chmod 755 uploads                 # dir — static serve needs traverse
# uploaded files: whatever umask your process uses; default is fine
chown -R app:app data/ uploads/   # if running under a dedicated user
```

## Moving between machines

1. Stop the app on the source machine (so no writes are in flight).
2. `rsync -a data/ uploads/ user@target:/path/to/e_inventory/`
3. On the target, `npm install`, then `npm run dev` (or your production runner).
4. Migrations run on startup; `CURRENT_SCHEMA_VERSION` is bumped as needed.

If you're moving between different `NODE_ENV` values, rename the DB file to
match the target environment's expected filename (see the table above) or set
`DB_PATH` explicitly.
