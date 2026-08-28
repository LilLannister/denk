# DENK

DENK is a QR-based restaurant bill-splitting application focused on the journey:

**Scan → Join → Split → Pay → Leave**

The V1 is a full-stack modular monolith built with Next.js, TypeScript, PostgreSQL, and Prisma. Guests participate anonymously without permanent customer accounts.

DENK is being developed through an AI-assisted—not AI-delegated—workflow. The developer personally implements, tests, reviews, and integrates every change.

## Project Status

Stage 1 — Repository & Development Foundation

The application foundation, local PostgreSQL environment, Prisma tooling, automated tests, browser tests, and CI workflow are established. DENK domain functionality begins in Stage 2.

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

Start PostgreSQL:

```bash
pnpm db:up
```

Confirm that the database is healthy:

```bash
pnpm db:status
```

Validate the Prisma configuration and generate Prisma Client:

```bash
pnpm db:validate
pnpm db:generate
```

Install the Chromium browser used by Playwright:

```bash
pnpm exec playwright install chromium
```

Start the development application:

```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

## Database

PostgreSQL runs locally through Docker Compose. Docker is development tooling only and is not part of DENK's application architecture.

Useful commands:

```bash
pnpm db:up
pnpm db:down
pnpm db:status
pnpm db:validate
pnpm db:generate
pnpm db:migrate:status
```

When a roadmap stage introduces a schema change, create a named development migration with:

```bash
pnpm db:migrate --name descriptive-migration-name
```

No DENK domain migration exists yet. The first migration will contain only the minimum schema required by the first vertical slice.

`pnpm db:down` stops PostgreSQL but preserves its named data volume.

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

CI performs a clean dependency installation, formatting check, lint, route-type generation, TypeScript checking, Vitest tests, production build, and Playwright browser test.

A pull request should not be merged until its CI verification succeeds.

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
