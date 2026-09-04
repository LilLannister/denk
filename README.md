# DENK

DENK is a QR-based restaurant bill-splitting application focused on the journey:

**Scan → Join → Split → Pay → Leave**

The V1 is a full-stack modular monolith built with Next.js, TypeScript, PostgreSQL, and Prisma. Guests participate anonymously without permanent customer accounts.

DENK is being developed through an AI-assisted—not AI-delegated—workflow. The developer personally implements, tests, reviews, and integrates every change.

## Project Status

**Next phase:** Stage 3 — Restaurant Operations, Tables, and Bill Integrity

Stage 1, the Pre-Stage-2 Hardening Transition, Stage 2, the Pre-Stage-3 Documentation Transition, and the independent review corrections are complete. The first vertical slice supports the verified journey: authenticated restaurant staff opens and populates a bill, then an anonymous guest joins through a scoped credential and views exact TRY totals. Stage 3 will build catalog-backed restaurant operations, complete table-session lifecycle behavior, and safe bill correction on that foundation.

## Prerequisites

Install the following before setting up the project:

- Git
- Node.js 24
- pnpm 11
- Docker Desktop with Docker Compose

The repository pins:

- Node.js in `.node-version`
- pnpm in the `packageManager` field of `package.json`

If using `fnm`, activate the repository's Node version with:

```bash
fnm use
```

## Local Setup

Clone the repository and enter it:

```bash
git clone https://github.com/LilLannister/denk.git
cd denk
```

Enable the pinned pnpm version:

```bash
corepack enable pnpm
```

Install dependencies exactly as recorded in the lockfile:

```bash
pnpm install --frozen-lockfile
```

Create the ignored local environment file:

```bash
cp .env.example .env
```

In `.env`, replace `BETTER_AUTH_SECRET` and `DENK_SETUP_ADMIN_PASSWORD` with private development values. The remaining setup values may be customized or left at their defaults. Never commit `.env`.

Start PostgreSQL and confirm that it is healthy:

```bash
pnpm db:up
pnpm db:status
```

Validate Prisma, generate its client, and apply committed migrations:

```bash
pnpm db:validate
pnpm db:generate
pnpm db:migrate:deploy
```

Create the local staff account, restaurant, membership, and initial table:

```bash
pnpm setup:dev
```

The setup command is development-only and safe to run repeatedly. It does not change the password of an existing development account.

Install the Chromium browser used by Playwright:

```bash
pnpm exec playwright install chromium
```

Start the development application:

```bash
pnpm dev
```

Open [http://localhost:3000/staff](http://localhost:3000/staff) and sign in using the development staff credentials from `.env`.

## Database

PostgreSQL runs locally through Docker Compose and binds only to `127.0.0.1:5432`. Docker is development tooling only and is not part of DENK's application architecture. The local `denk/denk` credentials are for non-sensitive, disposable development data only and must not be used for staging or production.

Useful commands:

```bash
pnpm db:up
pnpm db:down
pnpm db:status
pnpm db:validate
pnpm db:generate
pnpm db:migrate:deploy
pnpm db:migrate:status
```

When a roadmap stage introduces a schema change, create a named development migration with:

```bash
pnpm db:migrate --name descriptive-migration-name
```

The first committed migration contains the Better Auth schema and the minimum DENK domain schema required by the Stage 2 vertical slice. CI applies committed migrations to a fresh PostgreSQL database and verifies the resulting migration state.

`pnpm db:down` stops PostgreSQL but preserves its named data volume.

## Catalog Import

Restaurant catalogs are loaded through trusted operator tooling. Each import targets one existing restaurant explicitly and uses the versioned JSON format demonstrated in `examples/catalog.v1.json`.

Run an import with:

```bash
pnpm catalog:import --restaurant-id <restaurant-id> --file examples/catalog.v1.json
```

Catalog prices are decimal strings representing Turkish lira. Category and item keys are stable, normalized lowercase identifiers. Display names and ordering may change, and every item belongs to exactly one category. The complete document is validated before any database writes occur, and valid imports are applied atomically so a failure cannot leave a partially imported catalog. Repeating an unchanged import is a no-op. Categories and items omitted from a later document remain unchanged. Activating or deactivating an item requires an explicit `active` value, and the importer never physically deletes omitted records.

## Verification

Run individual checks:

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm test:e2e
```

Run the complete local verification sequence:

```bash
pnpm verify
```

Testing responsibilities are separated:

- Vitest tests application and domain behavior under `src/`.
- Playwright tests browser journeys under `tests/e2e/`.

## Continuous Integration

GitHub Actions runs on:

- Pull requests targeting `main`
- Pushes to `main`

CI installs dependencies on a clean runner, validates Docker Compose and Prisma configuration, generates Prisma Client, starts a fresh PostgreSQL service, applies committed migrations, verifies migration state, runs database-backed integration tests, and then performs formatting, linting, type-checking, production build, and browser tests.

The protected `main` branch requires changes through pull requests and requires the `Verify` CI check to succeed before merge. Zero approving reviews are required for the current solo-developer workflow; force pushes and deletion of `main` are blocked.

## Development Workflow

Use focused branches and meaningful commits:

```bash
git switch -c <type>/<short-description>
```

Typical branch types include:

- `feat/`
- `fix/`
- `test/`
- `chore/`
- `docs/`

Pull requests use:

- **Base:** `main`
- **Compare:** the focused working branch

The developer reviews the commit list, changed files, automated checks, and absence of secrets before merging.

## Documentation

- [`docs/TECHNICAL_DECISIONS.md`](docs/TECHNICAL_DECISIONS.md) records the finalized technology and architecture decisions.
- [`docs/ROADMAP.md`](docs/ROADMAP.md) defines the mentor-guided implementation stages and exit conditions.

Requirements engineering, architecture selection, and roadmap planning are complete. Implementation follows the roadmap sequentially.
