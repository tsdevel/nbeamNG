# NbeamNG Backend

Governed dynamic agent workspace for investment analysis. Ten vertical slices, each producing an end-to-end, API-testable outcome.

## Prerequisites

- [Node.js](https://nodejs.org/) (v18+)
- [Docker](https://docs.docker.com/get-docker/) with Docker Compose

## Quick Start

Three services run in this order:

| Service | Command | Port | Purpose |
|---|---|---|---|
| Infrastructure | `docker-compose up` | 5433, 9000, 9001 | PostgreSQL + MinIO |
| Backend API | `npm run dev` | 3000 | REST API server |
| Test UI | `cd ui-test && npm run dev` | 5173 | Step-by-step testing UI |

### 1. Start infrastructure (PostgreSQL + MinIO)

```bash
cd "C:/Otros/Mio/Ideas/Acquisition targets/Code/E2E/NbeamNG"
docker-compose up -d
```

Wait for both services to become healthy:

```bash
# Check status
docker-compose ps

# Or watch logs
docker-compose logs -f
```

Both containers should show `(healthy)` before starting the backend.

### 2. Set up environment

```bash
# Copy the example env file
cp .env.example .env

# The default .env already points to the Docker services:
#   DATABASE_URL=postgresql://nbeamng:nbeamng_dev@localhost:5433/nbeamng
#   MINIO_ENDPOINT=localhost
#   MINIO_PORT=9000
```

### 3. Install backend dependencies & generate Prisma client

```bash
npm install
npx prisma generate
```

If the database schema is out of sync (first run, or after schema changes):

```bash
# Push schema to database (no migrations needed for dev)
npx prisma db push --accept-data-loss

# Or create a migration
npx prisma migrate dev --name init
```

### 4. Start the backend server

```bash
npm run dev
```

You should see: `NbeamNG server running on port 3000 (development)`

### 5. Start the test UI (optional, in a new terminal)

```bash
cd ui-test
npm install   # first time only
npm run dev
```

Open http://localhost:5173 in your browser.

---

## Running Tests

All 69 integration tests require the infrastructure to be running.

```bash
# Start infrastructure if not already running
docker-compose up -d

# Run all tests
npm test

# Or run just integration tests
npx jest tests/integration/ --verbose --runInBand
```

Tests use the real PostgreSQL database and MinIO. They clean up after each test.

---

## Architecture Overview

### Three Services

**PostgreSQL** (port 5433)
- Mapped from 5432 to avoid conflicts with other local PostgreSQL instances (e.g., Temporal)
- Container name: `nbeamng-postgres`
- Database: `nbeamng`, user: `nbeamng`, password: `nbeamng_dev`
- Holds all structured data: projects, claims, evidence, expertise, events

**MinIO** (port 9000 API, 9001 Console)
- Container name: `nbeamng-minio`
- S3-compatible object storage for raw file uploads (CIMs, PDFs)
- Console: http://localhost:9001 (login: `minioadmin` / `minioadmin`)

**Backend API** (port 3000)
- Express + Prisma + TypeScript
- REST API consumed by agents and the test UI
- Auth: `x-api-key` header (default: `dev-api-key`) + `x-customer-id` header

### Ten Vertical Slices

| Slice | Outcome | Tests |
|---|---|---|
| 1. Ingest a Deal | Upload PDF, extract text, create artifacts | `tests/integration/slice1.test.ts` |
| 2. Generate First Draft | Research agent produces structured summary | `tests/integration/slice2.test.ts` |
| 3. Track Data Needs | Missing datapoints identified, resolved | `tests/integration/slice3.test.ts` |
| 4. Govern Material Claims | Typed claims with evidence links | `tests/integration/slice4.test.ts` |
| 5. Verify Claims | Contradiction detection, confidence metadata | `tests/integration/slice5.test.ts` |
| 6. Apply Human Corrections | Review comments, version v2, regeneration | `tests/integration/slice6.test.ts` |
| 7. Suggest Impact & Regenerate | Automated impact analysis, minimal delta | `tests/integration/slice7.test.ts` |
| 8. Finalize & Export | Completion checks, report export | `tests/integration/slice8.test.ts` |
| 9. Longitudinal Dossiers | Linked follow-up projects, dossier queries | `tests/integration/slice9.test.ts` |
| 10. Harden Deletion & Expertise | Three-tier deletion, expertise memory | `tests/integration/slice10.test.ts` |

---

## Common Troubleshooting

### PostgreSQL is not running

**Symptom:** Backend starts but requests return 500. Logs show `ECONNREFUSED` or Prisma connection errors.

**Fix:**

```bash
# Check if containers are running
docker-compose ps

# If postgres is not running, start it
docker-compose up -d postgres

# Or restart everything
docker-compose down && docker-compose up -d

# Check postgres logs
docker-compose logs postgres
```

### Port 5433 is already in use

**Symptom:** `docker-compose up` fails with "bind: address already in use".

**Fix:** Find and stop the process using port 5433, or change the port mapping in `docker-compose.yml`:

```yaml
ports:
  - "5434:5432"  # use 5434 instead
```

Then update `DATABASE_URL` in `.env` to match:
```
DATABASE_URL=postgresql://nbeamng:nbeamng_dev@localhost:5434/nbeamng
```

### Port 3000 is already in use

**Symptom:** `npm run dev` fails with `EADDRINUSE`.

**Fix:** Set `PORT` in `.env` or start with a different port:

```bash
PORT=3001 npm run dev
```

### Schema out of sync after pulling changes

**Symptom:** Tests fail with Prisma errors about missing columns or tables.

**Fix:**

```bash
npx prisma db push --accept-data-loss
npx prisma generate
```

### MinIO bucket errors

**Symptom:** Uploads fail with "NoSuchBucket" or similar.

**Fix:** The backend auto-creates the bucket on first upload. If MinIO was wiped, restart the backend (it calls `ensureBucketExists` on startup).

### UI shows "Backend Offline" or 500 errors

**Symptom:** Test UI can't reach the backend.

**Checklist:**
1. Is the backend running? (`npm run dev` in the root directory)
2. Is the backend on port 3000? Check the terminal output.
3. Did you start the UI in a **separate terminal** while the backend is still running?
4. Is the Base URL in the UI config bar correct? Default is empty (uses Vite proxy to localhost:3000).
5. Click **"Check Health"** in the UI header to see the exact error.

### Tests fail with timeout

**Symptom:** `jest` tests hang or timeout.

**Fix:**
1. Ensure infrastructure is running (`docker-compose up -d`)
2. Run with `--runInBand` to avoid parallel test conflicts:
   ```bash
   npx jest tests/integration/ --verbose --runInBand
   ```
3. Increase timeout if needed:
   ```bash
   npx jest --testTimeout=30000
   ```

---

## Project Structure

```
├── prisma/
│   └── schema.prisma          # Database schema (PostgreSQL)
├── src/
│   ├── routes/                # Express route handlers
│   ├── services/              # Business logic (ProjectService, DeletionService, etc.)
│   ├── lib/                   # Prisma client, MinIO client, config, errors
│   ├── middleware/            # Auth, error handling
│   ├── server.ts              # Express app setup
│   └── index.ts               # Entry point (starts server)
├── tests/
│   ├── integration/           # 10 slice test files (69 tests total)
│   ├── fixtures/              # Test PDF generator
│   └── setup.ts               # Test cleanup (truncates DB, clears MinIO)
├── ui-test/                   # React + Vite testing UI
│   ├── src/App.tsx            # Step-by-step slice tester
│   └── vite.config.ts         # Proxy to localhost:3000
├── docs/
│   ├── prd/                   # Product requirements (resliced into 10 slices)
│   ├── kanban/                # Board tracking slice status
│   └── adr/                   # Architecture decision records
├── docker-compose.yml         # PostgreSQL + MinIO
├── .env.example               # Environment template
└── package.json               # Backend scripts and dependencies
```

---

## Scripts Reference

| Script | Command | Description |
|---|---|---|
| `npm run dev` | `tsx watch src/index.ts` | Start backend dev server |
| `npm run build` | `tsc` | Compile TypeScript |
| `npm run start` | `node dist/index.js` | Start compiled server |
| `npm test` | `jest` | Run all tests |
| `npm run db:migrate` | `prisma migrate dev` | Create database migration |
| `npm run db:generate` | `prisma generate` | Generate Prisma client |
| `npm run db:reset` | `prisma migrate reset --force` | Reset database (dangerous) |
| `npm run lint` | `tsc --noEmit` | Type-check only |
