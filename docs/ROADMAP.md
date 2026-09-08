# DENK V1 Developer Roadmap

## How to Use This Roadmap

I am the developer of DENK. I will create and modify files, run commands and migrations, inspect errors, execute tests, operate Git, and integrate every change on my computer. AI acts as a technical mentor and pair-programming advisor.

For each meaningful step, the working rhythm is:

> **Explain → Tell me what to do → I perform it → Verify → Continue**

The roadmap describes what to build, why the order matters, and how to prove each stage works. It intentionally contains no complete implementation. When a stage begins, it should be broken into small, verifiable actions. Correctness-critical work—authorization, guest credentials, transactions, concurrency, money, payment states, idempotency, and callbacks—must be understood before moving on.

The target is a narrow, polished **Scan → Join → Split → Pay → Leave** V1. Prefer vertical progress and introduce schema or abstractions only when a working behavior needs them.

## Stage 1 — Repository & Development Foundation

### Goal

Create a reproducible repository in which a clean checkout can be installed, configured, connected to PostgreSQL, checked, tested, and built.

### What I Will Implement

1. Initialize Git and create the GitHub repository with an intentional default branch and ignore rules.
2. Scaffold Next.js 16+ App Router with TypeScript, React, Tailwind CSS, ESLint, and pnpm.
3. Add Prettier and define a small, consistent set of package scripts for formatting, linting, type-checking, testing, and building.
4. Establish the PostgreSQL development environment. Optionally use Docker Compose only to run local PostgreSQL.
5. Add Prisma, create the initial connection/configuration, and establish the migration workflow without designing the full domain schema.
6. Add Zod-based environment validation and document required variables using safe example values.
7. Configure Vitest and one small test that proves the runner and application aliases work.
8. Configure Playwright and one smoke test that proves the application starts and is reachable.
9. Add GitHub Actions that install with the lockfile and run formatting/lint checks, type-checking, tests, and the production build.
10. Write concise local setup instructions that another developer could follow from a clean checkout.

### Engineering Concepts I Should Understand

- dependency locking and reproducible builds;
- development, test, and production configuration boundaries;
- environment secrets versus safe examples;
- database migrations as version-controlled history;
- the difference between unit, integration, and end-to-end tests;
- CI as repeatable verification, not a separate development environment.

### Key Tests / Verification

- Follow the setup instructions from a clean checkout or equivalent fresh directory.
- Confirm installation uses the committed pnpm lockfile.
- Confirm the application can connect to a fresh PostgreSQL database and that the Prisma configuration and schema validate and generate a client. Once the first meaningful migration exists, confirm committed migrations apply to a fresh database.
- Run formatting/lint checks, type-checking, Vitest, Playwright smoke test, and production build locally.
- Confirm the same checks pass in GitHub Actions.
- Confirm secrets and local database data are not committed.

### Suggested Git Checkpoints

- `chore: scaffold Next.js development foundation`
- `chore: add database and test tooling`
- `ci: verify lint types tests and build`

### Exit Condition

A clean checkout can follow documented steps to install dependencies, start/configure PostgreSQL, validate the migration tooling, run all checks and tests, and produce a successful build locally and in CI. Stage 1 is complete as DENK's development foundation. Because Stage 1 intentionally contains no domain schema, migration application becomes concretely testable when Stage 2 introduces the first meaningful migration; an empty migration will not be created merely to satisfy this wording.

## Pre-Stage-2 Hardening Transition

**Status: Complete.**

This small repository-hardening transition was completed after the Stage 1 review without reopening Stage 1 or becoming a separate product phase. Its completion record is:

- `main` is protected: changes require a pull request and the `Verify` GitHub Actions check, zero approving reviews are required for the solo-developer workflow, and force pushes and deletion are blocked with no owner bypass;
- local PostgreSQL binds to `127.0.0.1:5432:5432`; the `denk/denk` credentials are limited to isolated local development with non-sensitive, disposable data and must never become staging or production credentials;
- clean-runner CI validates the Docker Compose configuration and Prisma configuration/schema and generates Prisma Client; and
- PR #6 passed the required `Verify` check, merged through the protected workflow, and was followed by a successful `main` CI run.

Stage 2 added the second database-verification level: CI starts a fresh PostgreSQL database, applies all committed migrations non-interactively, verifies migration state, and runs database-backed integration tests. The first migration contains only the Better Auth and DENK domain schema required by that vertical slice.

## Stage 2 — First Vertical Slice: Staff Opens a Bill, Guest Views It

**Status: Complete.**

### Goal

Deliver the smallest meaningful end-to-end DENK capability: **Staff authenticates → opens a table session → enters bill items → anonymous guest joins → guest sees the bill**.

### Conceptual Checkpoint Before Prisma

Before writing the first domain models, settle and be able to explain:

- Better Auth ownership of persistent identity/session data versus DENK ownership of restaurant membership, roles, and resource authorization;
- the minimum entity relationships and their enforcement layers: validated server boundary, application service, database constraint, or authentication/session system;
- a Stage 2 `TableSession` as the single current session supported for a table, without closing, reopening, history, or the complete lifecycle owned by Stage 3;
- integer kuruş as the exact V1 money representation, with TRY assumed and conversion limited to input/presentation boundaries;
- the lower-entropy, short-lived join code versus the high-entropy guest bearer credential; and
- the explicit guest bill projection, excluding authentication records, credential material, other sessions, and unnecessary internal identifiers.

This is a concise implementation gate, not another planning phase. Once these boundaries are recorded, implementation proceeds directly into the first schema.

### What I Will Implement

1. Configure Better Auth core authentication with its Prisma adapter and generate the required auth models. Better Auth owns persistent user/session/account/verification data; do not use its organization plugin for this slice.
2. Define only the minimum DENK-owned Prisma models required for `Restaurant`, `RestaurantMembership`, `RestaurantTable`, the single current `TableSession` supported by Stage 2, `BillItem`, and `GuestSession`. Relate membership to Better Auth's user model without creating a duplicate staff identity.
3. Review the complete auth/domain schema and enforcement-layer map, then create the first meaningful migration. Add CI verification that starts fresh PostgreSQL, applies committed migrations non-interactively, verifies migration state, and runs database-backed integration tests.
4. Seed or create the minimum authenticated user, restaurant membership, and `ADMIN`/`STAFF` role needed for development.
5. Implement a thin authorization path that receives authenticated user identity, resolves DENK membership, and proves the user may operate the restaurant-owned table.
6. Build a staff view to open the table's one Stage 2 current session and manually create bill items with validated name, positive quantity, and integer `unitPriceMinor` in TRY.
7. Create a stable, opaque QR/table entry route and require the current session's normalized, expiring join code without leaking whether the table, session, or code caused rejection.
8. On successful join, issue a high-entropy guest bearer credential, store only its hash, bind `GuestSession` to exactly one table session, and set the credential in a route-scoped, HttpOnly, SameSite cookie with explicit expiry and `Secure` enabled in production.
9. Build an explicit guest bill projection through server-side application services rather than querying Prisma from UI components.
10. Show useful not-found, unavailable-session, invalid-join, and expired/revoked-session states without exposing internal distinctions to unauthorized guests.
11. Add a Playwright path covering the entire first slice with separate staff and guest browser contexts.

### Engineering Concepts I Should Understand

- vertical slices and evolving a schema from behavior;
- authentication versus authorization;
- Better Auth identity ownership versus DENK restaurant membership;
- application/domain service boundaries;
- validation, contextual business rules, and database constraints as distinct enforcement layers;
- integer minor units—never floating-point arithmetic for money;
- lower-entropy join codes versus high-entropy bearer tokens, keyed hashing, cookies, expiry, and resource scoping;
- why URL identifiers and client state are not authorization.

### Key Tests / Verification

- An unauthenticated person cannot use staff operations.
- Staff from another restaurant cannot open or edit the table session.
- Concurrent or repeated open attempts cannot leave a table with an ambiguous Stage 2 current session; complete close/reopen/history behavior remains deferred to Stage 3.
- An invalid table, inactive session, wrong join code, or invalid/expired guest cookie is rejected without leaking bill data.
- The database contains a guest-token hash, never the raw bearer token.
- Prices round-trip through PostgreSQL exactly as integer kuruş, and boundary tests reject malformed decimals, unsafe integers, invalid quantities, and out-of-range values.
- On a clean CI PostgreSQL service, all committed migrations apply non-interactively, Prisma reports the expected migration state, and database-backed integration tests pass.
- The Playwright test proves staff can open and populate a bill and a fresh anonymous browser can join and view it.

### Suggested Git Checkpoints

- `feat: add staff authentication and restaurant scope`
- `feat: open table sessions and enter bill items`
- `feat: join active bill with anonymous guest session`

### Exit Condition

An authorized staff user can create the minimal active bill, and a guest with the correct table access and join code can anonymously receive a scoped session and view that bill end to end.

### Completion Record

Stage 2 delivered and verified the complete first vertical slice:

- Better Auth owns persistent staff identity and sessions, while DENK enforces restaurant-scoped `ADMIN` and `STAFF` membership in application services;
- the first committed migration contains the minimum Better Auth and DENK domain schema, and CI applies it to fresh PostgreSQL before running database-backed integration tests;
- controlled development and E2E setup create repeatable staff, restaurant, membership, table, and browser-test fixtures;
- authorized staff can open the table's single Stage 2 current session, rotate its temporary join code, and add validated TRY bill items;
- join codes use eight unambiguous base32-style characters, expire server-side, and are stored only as keyed digests;
- anonymous guests exchange a valid join code for a table-session-scoped bearer credential whose hash alone is persisted and whose cookie is route-scoped, HttpOnly, SameSite, explicitly expiring, and Secure in production;
- the guest page consumes an explicit bill projection that excludes credential material and unnecessary internal identifiers;
- PostgreSQL integer limits, exact kuruş parsing and presentation, safe line-total arithmetic, cross-restaurant denial, repeated and concurrent session opening, invalid and expired credentials, and projection boundaries have automated coverage; and
- Playwright verifies the full staff-to-guest journey in separate browser contexts, including staff authentication, bill creation, guest joining, cookie isolation, and TRY totals.

PRs #9 through #16 established the Stage 2 foundation, staff authorization, table-session opening, anonymous guest access, bill-item entry, hardened join codes, the complete browser journey, and the final boundary-hardening pass. Each merged through the protected `main` workflow with successful pull-request and post-merge CI.

Stage 2 intentionally leaves table administration, complete session lifecycle and history, catalog-backed restaurant operations, bill correction, allocation, and payment invariants to later stages.

## Pre-Stage-3 Documentation Transition

**Status: Complete.**

This short transition closes Stage 2 without reopening its implementation and sharpens Stage 3 around the next operational boundary:

- record Stage 2 as complete against its exit condition and verification evidence;
- introduce the restaurant-scoped `CatalogItem` decision needed before bill correction and later allocation work;
- define a controlled, idempotent JSON import as the V1 catalog-management boundary instead of building a self-service catalog UI; and
- preserve bill-item name and price snapshots as financial truth even when a bill item traces back to a catalog entry.

## Pre-Stage-3 Review Corrections

**Status: Complete.**

An independent review after the Stage 2 closure confirmed its exit condition while identifying three focused follow-ups:

- shared checked minor-unit addition now rejects an aggregate bill total that exceeds JavaScript's safe-integer range; the guest projection, staff display, and normal bill-item creation path use that rule, with unit and integration coverage;
- failed join attempts were not yet meaningfully observable, so the V1 technical decision now defers failed-attempt monitoring and deployment-aware rate limiting to public-launch hardening instead of claiming Stage 2 already provides them; and
- the authenticated staff read model remains safe for the completed slice, while moving its growing Prisma query and derived totals into a focused staff workspace projection is explicit Stage 3 maintainability work.

These corrections preserve Stage 2's completed status: they strengthen a financial boundary, align documentation with the implementation, and schedule a concrete refactor without changing the delivered end-to-end behavior.

## Stage 3 — Restaurant Operations, Tables, and Bill Integrity

### Goal

Turn the first slice into a safe restaurant workflow for managing a controlled product catalog, tables, session lifecycle, and active-bill corrections without weakening tenant or financial boundaries.

### What I Will Implement

1. Finalize application-level `ADMIN` and `STAFF` capability boundaries and central restaurant/resource ownership checks for Stage 3 operations.
2. Move the growing staff workspace read model and derived totals behind a focused application query/projection service; avoid a generic repository abstraction that adds no behavioral boundary.
3. Add restaurant-scoped `CatalogItem` records with a stable lowercase key, display name, exact TRY unit price, active state, and audit-friendly timestamps.
4. Add an operator-controlled, schema-validated JSON import that targets one explicit restaurant and applies catalog changes atomically and idempotently. Reject duplicate keys; treat omitted entries as unchanged; require explicit deactivation or reactivation; and do not physically delete catalog items during normal V1 operation.
5. Let Admin manage restaurant tables and their stable QR identities; let authorized restaurant users view operational table state.
6. Preserve table-session history with a terminal close timestamp, allow reopening only by creating a new session, revoke guest access on close, and enforce at most one open session per table with a PostgreSQL partial unique index.
7. Create new bill items from active catalog entries during normal restaurant operation while retaining validated manual entry only where an explicit development or recovery boundary requires it.
8. Preserve each bill item's name and unit-price snapshot as financial truth, optionally retaining its catalog-item reference for traceability; later catalog changes must not rewrite an existing bill.
9. Add staff bill operations to change a line's positive quantity or explicitly remove it while its table session is open. Do not edit snapshotted product names or prices in place; correct the selected product by removing the incorrect line and adding the intended catalog item. Serialize corrections with other open-session mutations and revalidate the complete bill total transactionally.
10. Handle multiple quantities of identical products as explicit quantities/units suitable for later allocation.
11. Decide and enforce what staff may change after allocations or successful payments exist; preserve completed payment history and prevent casual financial rewriting.
12. Add audit-friendly timestamps and records where needed to explain operational state changes without building event sourcing.

### Engineering Concepts I Should Understand

- role-based and resource-based authorization;
- multi-tenant ownership checks;
- stable import identities, idempotency, and atomic import boundaries;
- catalog reference data versus immutable bill snapshots;
- database uniqueness and lifecycle invariants;
- mutable operational data versus immutable financial truth;
- safe schema evolution through small migrations.

### Key Tests / Verification

- Admin and Staff capabilities match the finalized role boundaries.
- Cross-restaurant reads and mutations fail even when valid resource IDs are supplied directly.
- Repeating the same valid catalog import produces the same state; invalid or duplicate input leaves the catalog unchanged.
- Catalog imports cannot affect another restaurant, omission does not deactivate an item, and explicit deactivate/reactivate operations behave predictably.
- Existing bill-item names and prices do not change when their catalog entry is edited or deactivated.
- Closing preserves the session and bill history, invalidates its join and guest credentials, and reopening creates a distinct session.
- Concurrent attempts cannot leave more than one open session for a table; PostgreSQL enforces the invariant independently of application timing.
- Invalid prices, quantities, and state transitions are rejected server-side.
- Open-session quantity corrections and explicit removals preserve exact aggregate totals; closed-session items and snapshotted names and prices remain immutable. Unsafe corrections after allocation/payment are blocked or handled by the explicit rule.
- A completed payment record cannot be edited or erased through normal bill-management operations.

### Suggested Git Checkpoints

- `feat: enforce restaurant roles and ownership`
- `feat: import restaurant catalog items`
- `feat: manage tables and table-session lifecycle`
- `feat: protect active bill corrections`

### Exit Condition

Restaurant users can safely operate from a controlled restaurant catalog, manage tables and active bills within their authorized scope, and make only corrections permitted by lifecycle and completed-payment invariants.

## Stage 4 — Whole-Item Allocation and Payable Calculation

### Goal

Allow guests to claim, release, and understand responsibility for whole items or units, with the server calculating exactly what each guest owes.

### What I Will Implement

1. Introduce the minimum allocation model needed to represent ownership of a whole item unit by a guest session.
2. Implement application services for claim and release operations, with guest-session and active-bill authorization on every mutation.
3. Support multiple quantities so guests can claim individual units without confusing them with unrelated identical items.
4. Add server-derived availability, claimed state, unpaid state, and the current guest's payable amount.
5. Prevent release or reassignment once an allocation is part of a pending or successful payment according to the payment-safety rules.
6. Keep monetary calculation in domain/application code and return display-ready state to the UI.
7. Update the guest interface so a person can select their items, review their current share, correct an unpaid mistake, and optionally cover another person's unclaimed items by claiming them.

### Engineering Concepts I Should Understand

- domain invariants and aggregate boundaries;
- exact money arithmetic and derived totals;
- command versus query responsibilities;
- server-side trust boundaries;
- the difference between allocation, payment attempt, and settlement.

### Key Tests / Verification

- A guest can claim and release available whole units and sees the exact expected payable amount.
- A guest cannot mutate another bill or use an expired/revoked guest session.
- Claimed, paid, and remaining amounts always reconcile to the bill total.
- Duplicate or invalid mutation requests do not create impossible quantities.
- UI-supplied prices or payable totals are ignored; the server derives them from current database state.

### Suggested Git Checkpoints

- `feat: allocate whole bill-item units`
- `feat: calculate guest payable amounts`

### Exit Condition

Multiple guests can allocate distinct whole items/units, correct unpaid selections, and see server-authoritative payable and remaining totals that reconcile exactly.

## Stage 5 — Shared and Partial Allocation

### Goal

Support shared dishes and partial responsibility without rounding errors, over-allocation, or an interface that requires guests to calculate externally.

### What I Will Implement

1. Define the V1 representation for sharing an item or unit, including how portions are expressed and how exact minor-unit amounts are assigned.
2. Establish a deterministic remainder/rounding rule so the sum of portions always equals the item's price.
3. Extend allocation services to add, change, and release unpaid partial allocations while enforcing the item's remaining allocatable amount.
4. Support practical cases such as two people sharing a dish, four people sharing a bottle, and one guest paying multiple shares.
5. Present available, allocated, and paid portions clearly in the shared bill UI.
6. Preserve a single server-derived payable calculation across whole and partial allocations.

### Engineering Concepts I Should Understand

- allocation models: ratios versus concrete monetary amounts;
- deterministic rounding and conservation of money;
- invariants across whole and partial claims;
- why financial rules belong outside presentation code.

### Key Tests / Verification

- Two-way and four-way splits reconcile exactly, including prices that do not divide evenly.
- Whole plus partial allocations can never exceed the item total.
- Changing or releasing an unpaid portion updates all derived totals correctly.
- A guest can cover more than one portion without inventing or losing money.
- Property-style or table-driven tests cover many prices, quantities, and split counts and always preserve the total.

### Suggested Git Checkpoints

- `feat: support partial item allocation`
- `test: verify split rounding and conservation`

### Exit Condition

Whole and shared allocations work together, every split has a deterministic explanation, and all per-guest and remaining amounts sum exactly to the authoritative bill total.

## Stage 6 — Concurrency and Shared-State Refresh

### Goal

Make simultaneous guest activity safe at the database boundary and reasonably fresh in the browser.

### What I Will Implement

1. Identify race-prone allocation operations and express their invariants as database constraints and transactional application operations.
2. Choose and document an appropriate PostgreSQL concurrency strategy for each critical mutation, such as conditional writes, locking, or isolation/retry behavior.
3. Return explicit conflict outcomes when another guest wins a race; refresh authoritative state afterward.
4. Add controlled polling at approximately two-second intervals only while the shared bill view is active.
5. Refresh immediately after allocation and bill mutations rather than waiting for the next poll.
6. Pause or reduce polling when the page is not active where practical, prevent overlapping requests, and handle transient failures without corrupting local state.

### Engineering Concepts I Should Understand

- race conditions, lost updates, oversubscription, and stale reads;
- atomicity, isolation, database constraints, row locks, and retry policy;
- optimistic UI versus authoritative mutation results;
- polling lifecycle and request coordination;
- why realtime transport is unrelated to financial correctness.

### Key Tests / Verification

- Launch concurrent requests for the last available item/portion; at most the valid amount is allocated.
- Repeated concurrent runs preserve database invariants and exact totals.
- A losing guest receives a conflict, refreshes, and sees the winning state.
- Two browser contexts observe one another's changes within the expected polling window.
- Correctness tests still pass with polling disabled or delayed.
- Polling stops when the shared view unmounts and does not create overlapping request buildup.

### Suggested Git Checkpoints

- `fix: make allocation mutations concurrency-safe`
- `feat: refresh shared bills with controlled polling`

### Exit Condition

Concurrent claims cannot over-allocate or corrupt totals, and active guests see shared changes promptly while PostgreSQL—not polling—remains authoritative.

## Stage 7 — Payment Boundary, State Machine, and Mock Provider

### Goal

Create a provider-independent, production-equivalent payment lifecycle without processing real money.

### What I Will Implement

1. Define a small `PaymentProvider` contract from DENK's actual needs: create an attempt and interpret/verify an authoritative provider event or result.
2. Define the DENK payment state machine, including permitted transitions for pending/delayed, successful, failed, and cancelled outcomes.
3. Add payment-attempt persistence with internal ID, provider reference, guest/bill scope, immutable server-calculated amount, state, idempotency key, and relevant timestamps.
4. Implement `MockPaymentProvider` with deterministic scenarios for success, pending then success, failure, cancellation, delays, and repeated responses.
5. Build payment creation through an application service that recalculates current payable allocations and rejects client control of amount or ownership.
6. Implement idempotent creation so retries with the same logical request return the same attempt and incompatible reuse is rejected.
7. Add duplicate-request protection and clear guest feedback for retryable versus terminal outcomes.

### Engineering Concepts I Should Understand

- dependency inversion and provider adapters;
- finite-state machines and valid transitions;
- idempotency keys, retry semantics, and uniqueness constraints;
- server-authoritative amounts;
- pending versus terminal payment states;
- recording financial attempts for diagnosis and reconciliation.

### Key Tests / Verification

- The application payment service can use a provider test double and contains no iyzico-specific types.
- A manipulated client amount cannot change the payment amount.
- Repeating the same creation request returns one logical payment attempt.
- Reusing an idempotency key for incompatible bill, guest, or amount data is rejected.
- Each allowed mock scenario reaches only valid state transitions; invalid transitions fail.
- Creating or failing a payment does not by itself mark allocations as settled.

### Suggested Git Checkpoints

- `feat: define payment provider and state machine`
- `feat: add production-equivalent mock payments`
- `test: verify payment creation idempotency`

### Exit Condition

A guest can initiate a server-priced mock payment that moves through a valid, persisted lifecycle with idempotent creation, while no initiation response alone settles the bill.

## Stage 8 — Authoritative Confirmation and Settlement

### Goal

Make simulated provider callbacks the sole success authority and settle allocations exactly once, even with duplicates or concurrent delivery.

### What I Will Implement

1. Add a simulated provider callback/webhook boundary that verifies the mock provider's authenticity mechanism before processing data.
2. Normalize provider events into provider-independent application inputs.
3. Persist enough provider-event identity to detect duplicate delivery and retain useful diagnostic history.
4. In one database transaction, validate the payment's current state and amount, transition it when legal, settle its frozen/associated allocations, and update derived bill settlement state.
5. Make duplicate callbacks return a safe idempotent result without repeating settlement.
6. Protect concurrent confirmation processing and prevent two payment attempts from settling the same allocation.
7. Define guest-facing behavior for pending, success, failed, and cancelled payments and allow safe retry only when business rules permit it.
8. Determine whole-bill completion solely from authoritative settled amounts, never from client navigation or a success page.

### Engineering Concepts I Should Understand

- webhook authenticity and untrusted external input;
- at-least-once delivery and idempotent consumers;
- atomic state transition plus settlement;
- uniqueness constraints and double-spend protection;
- out-of-order, duplicate, and concurrent events;
- redirect UX versus provider authority.

### Key Tests / Verification

- A success page or client request cannot mark a payment successful.
- Invalidly authenticated, unknown, mismatched-amount, or illegal-transition callbacks are rejected and do not settle anything.
- The same callback delivered repeatedly settles allocations once.
- Two concurrent callback handlers cannot double-settle.
- Two payment attempts targeting overlapping allocations cannot both settle them.
- Failed and cancelled attempts leave eligible amounts payable; pending attempts do not prematurely free or settle protected allocations.
- The bill becomes fully settled only when authoritative successful settlements cover the exact amount.

### Suggested Git Checkpoints

- `feat: process authoritative mock payment callbacks`
- `feat: settle allocations atomically`
- `test: prevent duplicate and concurrent settlement`

### Exit Condition

Authenticated mock-provider confirmation drives legal payment transitions and atomic settlement exactly once; duplicates, races, and client claims cannot create double payment or false bill completion.

## Stage 9 — Complete Scan → Join → Split → Pay → Leave Experience

### Goal

Integrate the staff and guest capabilities into a coherent, understandable V1 journey for multiple people at one table.

### What I Will Implement

1. Refine the QR/table entry and temporary-code flow for fast anonymous joining, with clear recovery for inactive or invalid sessions.
2. Present bill items, quantities, shared portions, other guests' claimed/paid state, current guest payable amount, and table remaining amount without exposing unnecessary guest or payment data.
3. Connect whole and partial allocation, review, payment, pending/failure/retry, success, and leave behavior into one guest journey.
4. Refresh immediately after mutations and continue controlled polling during active shared views.
5. Give staff a clear operational view of bill entry, allocations, payments, remaining balance, and fully settled state.
6. Handle the finalized V1 failure cases: stale selections, concurrent claims, expired guest sessions, bill corrections that are no longer safe, failed/cancelled/pending payments, duplicate submissions, and network retries.
7. Make leaving require no account cleanup ceremony; retain only the server-side records needed for expiry, authorization, audit, and payment correctness.
8. Add focused accessibility, responsive layout, loading, empty, and error states for restaurant use on phones.

### Engineering Concepts I Should Understand

- task-focused UX and progressive disclosure;
- recovery-oriented error design;
- privacy minimization in shared state;
- accessibility and mobile interaction;
- integration boundaries between UI, application services, providers, and persistence.

### Key Tests / Verification

- In separate browser contexts, staff creates a bill and multiple anonymous guests join, allocate whole and shared items, observe updates, and pay independently.
- One guest can pay the whole remaining bill by allocating the remaining eligible amount.
- A guest can correct an unpaid selection, but cannot alter paid responsibility.
- Stale or concurrent actions produce an understandable refresh/retry path.
- A failed or cancelled payment can recover safely; pending status is represented honestly.
- No permanent customer account is created and one table's guest cannot see another table.
- The staff view reaches a correct fully settled state after all successful payments.

### Suggested Git Checkpoints

- `feat: integrate guest split and payment journey`
- `feat: complete staff bill-settlement view`
- `fix: harden shared-flow recovery states`

### Exit Condition

Realistic multi-browser use completes **Scan → Join → Split → Pay → Leave** without a guest account, manual calculation, cross-session leakage, or an incorrect financial state.

## Stage 10 — Security, E2E Validation, and V1 Completion

### Goal

Prove the V1 invariants, close implementation gaps, and leave a clean, explainable repository ready for demonstration and later real-provider validation.

### What I Will Implement

1. Review every server boundary for Zod validation, authentication, authorization, restaurant ownership, guest-session scope, and safe error behavior.
2. Review cookie attributes, token entropy and hashing, guest expiry/revocation, callback authentication, secret handling, and sensitive logging.
3. Build an authorization matrix and automated negative tests for cross-restaurant, cross-table, cross-bill, role, and anonymous access attempts.
4. Expand integration tests around allocation conservation, bill edits, transactions, concurrency, exact money, payment transitions, idempotency, callbacks, and settlement.
5. Add at least one Playwright test for the full happy path and focused E2E tests for the highest-risk failure journeys using separate browser contexts.
6. Verify clean database creation and migration, deterministic test data, CI reliability, production build behavior, and documented local setup.
7. Remove accidental abstractions and dead code, clarify module names and boundaries, and document only the operational knowledge needed to run and explain V1.
8. Review the Git history and final documentation so the architecture, trade-offs, failures, and tests can be explained in my own words.

### Engineering Concepts I Should Understand

- threat modeling and defense in depth;
- positive and negative authorization testing;
- test pyramid and risk-based coverage;
- deterministic concurrency and idempotency testing;
- observability without leaking secrets;
- definition of done versus feature presence.

### Key Tests / Verification

- CI passes from a clean checkout: install, database setup/migrations, lint/format checks, type-check, tests, and build.
- Automated tests prove cross-restaurant and cross-table isolation and reject forged/expired guest credentials.
- Concurrent allocation and settlement stress tests preserve every invariant.
- Payment tests cover success, pending/delayed success, failure, cancellation, duplicate creation, duplicate callbacks, invalid callbacks, and concurrent confirmations.
- The complete E2E flow runs through separate staff and guest browser contexts.
- Financial correctness still holds when polling is slow, stopped, or stale.
- No V1 code depends on iyzico, Redis, realtime infrastructure, queues, microservices, or other rejected components.
- I can explain the modular boundaries, data model as implemented, key transactions, authorization rules, idempotency design, test strategy, and major Git checkpoints.

### Suggested Git Checkpoints

- `test: cover V1 security and financial invariants`
- `test: validate complete scan to leave journey`
- `chore: finalize DENK V1 documentation and cleanup`

### Exit Condition

All V1 definition-of-done checks pass locally and in CI; the full journey is demonstrable; security, concurrency, payment, and settlement invariants are automated; and the repository is understandable without adding non-V1 infrastructure.

## Validation Notes

No blocking inconsistencies found.

Roadmap validation confirms:

- polling only improves freshness; financial correctness remains inside PostgreSQL/application transactions;
- concurrent allocation is introduced with explicit server/database protection before being considered complete;
- guests use a separate opaque, hashed, database-backed session rather than Better Auth;
- payment success and settlement require an authenticated provider callback, not a client claim or redirect;
- `MockPaymentProvider` exercises realistic states, creation idempotency, retry behavior, duplicate callbacks, and double-settlement protection;
- payment application logic depends on `PaymentProvider`, not iyzico;
- React components present state and invoke boundaries but do not own bill, allocation, authorization, or payment rules;
- the schema evolves with vertical behavior instead of being completely designed up front;
- no stage introduces infrastructure that DENK V1 does not require; and
- every stage gives me meaningful implementation direction and verification without becoming a generated-code tutorial.

Requirements engineering, architecture decisions, technology selection, and roadmap planning are complete for DENK V1. The sequence **Stage 1 → Pre-Stage-2 Hardening Transition** is complete. The next active phase is **Stage 2 — First Vertical Slice: Staff Opens a Bill, Guest Views It**, using the mentor-guided workflow described above.
