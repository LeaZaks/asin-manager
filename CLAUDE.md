# CLAUDE.md — ASIN Manager

## Project Overview

ASIN Manager is a full-stack application for managing Amazon product ASINs and analyzing seller eligibility. It imports product data from Keepa CSV exports, checks selling restrictions via Amazon SP-API, and provides analytics on seller status, product ratings, and tagging.

## Repository Structure

```
asin-manager/
├── backend/                    # Node.js Express API (TypeScript)
│   ├── src/
│   │   ├── server.ts           # Express app entry point (port 3001)
│   │   ├── controllers/        # Request handlers (5 files)
│   │   ├── routes/             # Express route definitions (5 files)
│   │   ├── services/           # Business logic (import, processing)
│   │   ├── repositories/       # Data access layer (Prisma queries)
│   │   ├── middleware/         # Error handling (AppError class)
│   │   ├── workers/            # BullMQ background job processor
│   │   └── lib/                # Utilities (queue, logger, Amazon API, CSV parser)
│   ├── prisma/
│   │   ├── schema.prisma       # Database models & enums
│   │   └── migrations/         # Schema migration history
│   ├── package.json
│   └── tsconfig.json
├── frontend/                   # React + Vite SPA (TypeScript)
│   ├── src/
│   │   ├── main.tsx            # App entry with React Router
│   │   ├── pages/              # ProductsPage, ProcessingPage, TagsPage, ProductDetailPage
│   │   ├── components/         # ScoreEditor, TagChips, ScoreDisplay, ImportSummaryModal, ImportToast
│   │   ├── api/                # Axios API client (index.ts)
│   │   ├── types/              # TypeScript interfaces (mirrors Prisma models)
│   │   └── styles.css          # Global styles
│   ├── vite.config.ts          # Dev server proxy to backend
│   ├── package.json
│   └── tsconfig.json
├── .github/workflows/
│   └── migrate.yml             # CI: Prisma migrate on push to main
└── README.md                   # Project docs (Hebrew)
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend runtime | Node.js 18+ with TypeScript 5.4 |
| Backend framework | Express 4.18 |
| Database | PostgreSQL via Supabase |
| ORM | Prisma 5.10 |
| Job queue | BullMQ 5.4 + Redis (ioredis) |
| Queue dashboard | Bull Board 5.16 (at `/admin/queues`) |
| CSV parsing | papaparse 5.4 |
| External API | Amazon SP-API (signed with aws4) |
| Logging | winston 3.12 |
| Frontend framework | React 18.2 |
| Build tool | Vite 5.2 |
| Routing | React Router DOM 6.22 |
| Server state | TanStack React Query 5.28 |
| HTTP client | axios |
| Icons | lucide-react |

## Development Commands

### Backend (`cd backend`)

| Command | Description |
|---------|-------------|
| `npm run dev` | Start server with hot reload (tsx watch, port 3001) |
| `npm run build` | Compile TypeScript to `dist/` |
| `npm start` | Run compiled server from `dist/server.js` |
| `npm run worker` | Start BullMQ background worker (separate process) |
| `npm run db:migrate` | Run Prisma schema migrations (`prisma migrate dev`) |
| `npm run db:generate` | Regenerate Prisma client types |
| `npm run db:studio` | Open Prisma Studio (visual DB editor) |

### Frontend (`cd frontend`)

| Command | Description |
|---------|-------------|
| `npm run dev` | Start Vite dev server (port 5173, proxies `/api` to backend) |
| `npm run build` | Type-check and build production bundle |
| `npm run preview` | Preview production build locally |

### Local Development Setup

1. Start Redis: `docker run -d -p 6379:6379 redis:alpine`
2. Configure `backend/.env` (see Environment Variables below)
3. `cd backend && npm install && npm run db:migrate && npm run db:generate`
4. `cd frontend && npm install`
5. In separate terminals: `npm run dev` (backend), `npm run worker` (backend), `npm run dev` (frontend)

The frontend dev server at `localhost:5173` proxies all `/api` requests to `localhost:3001`.

## Environment Variables

Backend requires a `.env` file in the `backend/` directory:

```
DATABASE_URL=postgresql://...        # Supabase pooled connection
DIRECT_URL=postgresql://...          # Direct connection (for migrations)
REDIS_URL=redis://localhost:6379
PORT=3001
FRONTEND_URL=http://localhost:5173
NODE_ENV=development

# Amazon SP-API credentials
LWA_CLIENT_ID=...
LWA_CLIENT_SECRET=...
LWA_REFRESH_TOKEN=...
AWS_ACCESS_KEY=...
AWS_SECRET_KEY=...
SELLER_ID=...
```

## Architecture

### Backend Layers

The backend follows a layered architecture:

1. **Routes** (`src/routes/`) — Define Express endpoints and wire to controllers
2. **Controllers** (`src/controllers/`) — Validate requests, call services, format responses
3. **Services** (`src/services/`) — Business logic (import processing, job queue management)
4. **Repositories** (`src/repositories/`) — Prisma queries, data access abstraction
5. **Lib** (`src/lib/`) — Shared utilities (queue setup, logger, Amazon API client, CSV parser)
6. **Workers** (`src/workers/`) — BullMQ job processor (runs as separate Node process)

### Frontend Patterns

- **React Router 6** for navigation (`/products`, `/products/:asin`, `/processing`, `/tags`)
- **TanStack React Query** for all server state (fetching, caching, mutations, invalidation)
- **Local `useState`** for UI state (filters, modals, selections)
- **Axios instance** with `/api` baseURL as the API client layer
- **Layout component** with sidebar navigation wrapping all pages

### Key Data Flows

**CSV Import:** Upload file → `POST /api/import/csv` → parse with papaparse → batch upsert products (100 at a time) → auto-tag HazMat items → return summary

**ASIN Processing:** Start job → enqueue BullMQ job → separate worker process checks Amazon SP-API in batches of 5 → update SellerStatus → frontend polls `GET /api/processing/status` every 2s for progress

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/products` | List products (pagination, filtering, sorting) |
| `GET` | `/api/products/:asin` | Single product detail |
| `DELETE` | `/api/products` | Bulk delete products |
| `POST` | `/api/import/csv` | Upload Keepa CSV (multipart) |
| `POST` | `/api/import/manual` | Add single ASIN manually |
| `GET` | `/api/import/history` | List import records |
| `POST` | `/api/processing/start` | Start ASIN eligibility check job |
| `GET` | `/api/processing/status` | Get active job status/progress |
| `GET` | `/api/tags` | List all tags |
| `POST` | `/api/tags` | Create tag |
| `PATCH` | `/api/tags/:id` | Update tag |
| `DELETE` | `/api/tags/:id` | Delete tag |
| `POST` | `/api/tags/product/:asin` | Add tag to product |
| `DELETE` | `/api/tags/product/:asin/:tagId` | Remove tag from product |
| `PUT` | `/api/evaluations/:asin` | Upsert product score/note |
| `GET` | `/health` | Health check |

## Database Schema

PostgreSQL via Prisma. Key models:

- **Product** — Primary entity, ASIN as PK, stores Keepa metrics (sales rank, prices, ratings, offers, dimensions)
- **SellerStatus** — 1:1 with Product. Enum: `allowed | gated | requires_invoice | restricted | unknown`
- **ProductEvaluation** — 1:1 with Product. Score (1-5) and optional note
- **Tag** — Central tag list. Type: `warning | note`. Optional color
- **ProductTag** — Many-to-many join between Product and Tag (unique on `asin + tag_id`)
- **ImportFile** — Import history with file metadata and row counts

All foreign keys to Product use `onDelete: Cascade`.

## Code Conventions

### TypeScript

- **Strict mode** enabled in both backend and frontend
- Backend: target ES2022, CommonJS modules
- Frontend: target ES2020, ESNext modules, path alias `@/*` → `src/*`
- Frontend enforces `noUnusedLocals` and `noUnusedParameters`

### Naming

- `camelCase` for variables, functions, file names
- `PascalCase` for types, interfaces, React components, enum values in TypeScript
- `snake_case` for database columns and Prisma model fields
- Prisma models use `@@map("table_name")` for snake_case table names

### Error Handling

- Custom `AppError` class with `statusCode` property
- Global Express error middleware catches all errors
- `express-async-errors` for automatic async error forwarding
- Worker retries: 3 attempts with exponential backoff (2s base)

### Patterns

- Async/await consistently throughout (no raw Promises or callbacks)
- Prisma transactions for atomic multi-model operations
- Redis used for job progress tracking (ephemeral state, not persistence)
- Import processing uses batch operations (100 records per batch for DB, 5 concurrent for API)

## CI/CD

- **GitHub Actions** (`.github/workflows/migrate.yml`): Runs `prisma migrate deploy` on push to `main`
- Requires `DATABASE_URL` and `DIRECT_URL` secrets configured in GitHub

## Testing

No test framework or test files are currently configured. No ESLint or Prettier configs exist.

## Notes

- The project has no authentication/authorization — it assumes a trusted environment
- README.md is written in Hebrew
- Prisma schema comments are in Hebrew (the spec language)
- The Bull Board queue dashboard is exposed at `/admin/queues` with no auth
- Redis is required for both the job queue (BullMQ) and import progress tracking
