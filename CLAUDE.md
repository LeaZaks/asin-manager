# CLAUDE.md — AI Assistant Guide for ASIN Manager

## Project Overview

ASIN Manager is a full-stack web application for managing Amazon product ASINs. It allows sellers to import product data from Keepa CSV exports, check seller eligibility/gating status via the Amazon Selling Partner API, tag products, score them, and batch-process ASINs to determine selling restrictions. The UI is in Hebrew; the codebase is in English.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend runtime | Node.js + Express + TypeScript |
| ORM / Database | Prisma → PostgreSQL (Supabase) |
| Job queue | BullMQ + Redis (ioredis) |
| Amazon integration | AWS SigV4 (aws4) + LWA OAuth |
| CSV parsing | PapaParse |
| Logging | Winston |
| Frontend framework | React 18 + TypeScript |
| Build tool | Vite |
| Routing | React Router v6 |
| Data fetching | TanStack React Query |
| Icons | Lucide React |
| HTTP client | Axios (both frontend and backend) |

## Repository Structure

```
asin-manager/
├── backend/
│   ├── src/
│   │   ├── server.ts              # Express app, route mounting, Bull Board
│   │   ├── controllers/           # Request handlers (products, import, processing, tags, evaluations)
│   │   ├── routes/                # Route definitions per resource
│   │   ├── services/              # Business logic (import, processing)
│   │   ├── repositories/          # Database access layer (Prisma queries)
│   │   ├── lib/                   # Utilities: logger, queue, prisma client, amazonApi, keepaCsvParser
│   │   ├── middleware/            # Error handler middleware (AppError class)
│   │   └── workers/               # BullMQ worker (asinProcessor.worker.ts) — runs as separate process
│   ├── prisma/
│   │   ├── schema.prisma          # 7 models, 3 enums
│   │   └── migrations/            # Prisma migration history
│   ├── logs/                      # Winston log output (error.log, combined.log)
│   ├── package.json
│   └── tsconfig.json              # Target ES2022, module commonjs, strict
├── frontend/
│   ├── src/
│   │   ├── main.tsx               # Entry point, layout, React Router setup
│   │   ├── pages/                 # ProductsPage, ProcessingPage, TagsPage, ProductDetailPage
│   │   ├── components/            # Reusable UI (ImportSummaryModal, ScoreEditor, TagChips, etc.)
│   │   ├── api/index.ts           # Axios client, resource-grouped API methods
│   │   ├── types/index.ts         # Shared TypeScript types
│   │   └── styles.css             # Global styles
│   ├── vite.config.ts             # React plugin, /api proxy → localhost:3001, @ alias → src/
│   ├── package.json
│   └── tsconfig.json              # Target ES2020, module ESNext, strict, @/* path alias
├── .github/workflows/
│   └── migrate.yml                # Prisma migrate deploy on push to main
└── README.md                      # Hebrew setup guide
```

## Architecture

### Backend — Layered Pattern

```
Controller → Service → Repository → Prisma → PostgreSQL
                ↘ Redis (progress tracking)
                ↘ BullMQ queue → Worker (separate process)
```

- **Controllers** handle HTTP request/response, input validation, and delegate to services.
- **Services** contain business logic (CSV import orchestration, ASIN processing job management).
- **Repositories** encapsulate Prisma queries for products and imports.
- **Workers** run in a separate Node process (`npm run worker`) and process BullMQ jobs asynchronously.

### Frontend — Component Pages + React Query

- Pages handle routing and layout; components are reusable pieces.
- All server state is managed via TanStack React Query (queries + mutations).
- Local UI state uses `useState`. Session-scoped data uses `sessionStorage`.
- API calls go through `frontend/src/api/index.ts` which wraps Axios with `/api` base URL.
- Vite dev server proxies `/api` → `http://localhost:3001`.

## Development Commands

### Backend (`cd backend`)

| Command | Description |
|---------|-------------|
| `npm run dev` | Start Express server with tsx watch (port 3001) |
| `npm run worker` | Start BullMQ worker process (separate terminal) |
| `npm run build` | Compile TypeScript → `dist/` |
| `npm start` | Run compiled JavaScript |
| `npm run db:migrate` | Run `prisma migrate dev` |
| `npm run db:generate` | Regenerate Prisma client |
| `npm run db:studio` | Open Prisma Studio |

### Frontend (`cd frontend`)

| Command | Description |
|---------|-------------|
| `npm run dev` | Start Vite dev server (port 5173) |
| `npm run build` | TypeScript check + Vite production build |
| `npm run preview` | Preview production build locally |

### Local Prerequisites

- **Redis**: `docker run -d -p 6379:6379 redis:alpine`
- **PostgreSQL**: Provided by Supabase (connection via `DATABASE_URL`)
- **Node.js**: 18+

## Environment Variables (Backend)

```
DATABASE_URL=postgresql://...          # Supabase pooled connection
DIRECT_URL=postgresql://...            # Direct connection (migrations)
REDIS_URL=redis://localhost:6379
PORT=3001
FRONTEND_URL=http://localhost:5173     # CORS origin
LOG_LEVEL=info                         # Winston log level

# Amazon SP-API credentials
LWA_CLIENT_ID=...
LWA_CLIENT_SECRET=...
LWA_REFRESH_TOKEN=...
AWS_ACCESS_KEY=...
AWS_SECRET_KEY=...
SELLER_ID=...
```

The frontend has no env vars — it proxies everything through Vite's dev server to the backend.

## Database Schema (Prisma)

**Models**: Product, SellerStatus, ImportFile, ProductEvaluation, Tag, ProductTag, Test

**Enums**: `SellerStatusEnum` (allowed, gated, requires_invoice, restricted, unknown), `TagType` (warning, note), `ImportSource` (keepa, manual)

Key relationships:
- Product 1:1 SellerStatus (cascade delete)
- Product 1:1 ProductEvaluation (cascade delete)
- Product ↔ Tag via ProductTag join table (cascade delete)
- ImportFile stores the raw uploaded CSV as a binary blob

The primary key for Product is the `asin` field (String, 10 chars), not an auto-increment id.

## API Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/products` | List products (paginated, filterable, sortable) |
| GET | `/api/products/:asin` | Get single product with all relations |
| DELETE | `/api/products` | Bulk delete by ASIN array |
| POST | `/api/import/csv` | Upload Keepa CSV (multipart/form-data) |
| POST | `/api/import/manual` | Add single ASIN manually |
| GET | `/api/import/progress/:jobId` | Import job progress (Redis) |
| GET | `/api/import/history` | Import history list |
| GET | `/api/import/:id/errors` | Download import error file |
| POST | `/api/processing/start` | Start eligibility check batch job |
| GET | `/api/processing/status` | Active job status or idle |
| GET | `/api/processing/status/:jobId` | Specific job status with summary |
| GET | `/api/tags` | List all tags |
| POST | `/api/tags` | Create tag |
| PATCH | `/api/tags/:id` | Update tag |
| DELETE | `/api/tags/:id` | Delete tag |
| POST | `/api/tags/product/:asin` | Add tag to product |
| DELETE | `/api/tags/product/:asin/:tagId` | Remove tag from product |
| PUT | `/api/evaluations/:asin` | Upsert product evaluation (score 1-5) |
| GET | `/api/evaluations/:asin` | Get product evaluation |

Bull Board dashboard: `http://localhost:3001/admin/queues`

## Testing

No test framework is currently configured. There are no unit or integration tests.

## CI/CD

The only GitHub Actions workflow (`.github/workflows/migrate.yml`) runs Prisma migrations on push to `main`. It uses repository secrets `DATABASE_URL` and `DIRECT_URL`.

## Key Implementation Details

### CSV Import Flow
1. File uploaded via multer → parsed by PapaParse with Keepa field mapping
2. Records batched (100 per batch) and upserted via Prisma transactions
3. Progress tracked in Redis (`import:job:{jobId}`, 1-hour TTL)
4. Automatic hazmat tag application during import
5. Error rows collected and saved as JSON for later download

### ASIN Processing Flow
1. Job created specifying mode (100, 200, or unchecked ASINs)
2. BullMQ enqueues work; worker picks it up in a separate process
3. Worker processes 5 ASINs concurrently with 200ms inter-batch delay
4. Each ASIN checked against Amazon SP-API (eligibility/restrictions)
5. Progress stored in Redis (`asin:processing:status:{jobId}`, 24-hour TTL)
6. Results written to SellerStatus table

### Amazon SP-API
- LWA tokens are cached and auto-refreshed on expiry
- Requests signed with AWS SigV4 via the `aws4` library
- Retry logic with exponential backoff for rate-limit errors

### Error Handling
- `AppError` class for structured application errors (status code + message)
- Global Express error handler middleware catches all errors
- Prisma-specific error detection for database issues
- Winston logs to console + file (error.log, combined.log)

## Conventions for AI Assistants

- **Language**: Code, comments, and variable names in English. UI strings are in Hebrew.
- **TypeScript**: Strict mode enabled in both backend and frontend. Respect existing type patterns.
- **Backend pattern**: Follow the controller → service → repository layering. Don't put business logic in controllers or database queries in services.
- **Prisma**: Always run `npm run db:generate` after schema changes. Migrations go through `npm run db:migrate`.
- **Frontend imports**: Use the `@/` path alias (maps to `src/`).
- **API calls**: Add new API methods to `frontend/src/api/index.ts`, grouped by resource.
- **Environment**: Never commit `.env` files. Backend env vars are listed above.
- **Redis keys**: Follow existing naming patterns (`import:job:{id}`, `asin:processing:status:{id}`, `asin:processing:active_job_id`).
- **No tests exist**: If adding tests, Vitest would be the natural choice given the Vite frontend tooling.
- **Worker process**: The BullMQ worker runs separately from the Express server. Changes to worker logic require restarting the worker process.
