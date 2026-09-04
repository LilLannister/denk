# DENK V1 Technical Decisions

## Purpose

This document records the technology and architecture decisions that are settled for DENK V1. It answers: **what did we choose, why did we choose it, and what trade-off did we accept?** It is a concise implementation reference, not an ADR collection or an invitation to reopen planning.

## Architecture and Application Stack

### Full-stack modular monolith

**Decision:** Build DENK as a TypeScript application using Next.js 16+ App Router and React for both the user interface and server-side application boundary.

**Reason:** One application is sufficient for the V1 workload and deployment model. The important engineering boundaries can exist inside the application: UI, server/API boundary, application and domain services, and persistence. Allocation, payment, authorization, and financial rules must not live in React components.

**Accepted trade-off:** Frontend and backend share one application and deployment boundary. A later extraction would require work, but clear internal modules make it manageable.

### Styling

**Decision:** Use Tailwind CSS.

**Reason:** It supports fast, consistent implementation of the guest and staff interfaces with little tooling overhead.

**Accepted trade-off:** Styling is expressed largely through utility classes and requires deliberate component conventions to remain readable.

### Relational data and migrations

**Decision:** Use PostgreSQL with Prisma and Prisma Migrate.

**Reason:** DENK's restaurant ownership, table sessions, bills, allocations, guest sessions, and payments are relational. PostgreSQL transactions and constraints are suitable for correctness under concurrent allocation and payment activity. Prisma provides typed access and an explicit migration history.

**Accepted trade-off:** Prisma abstracts some database behavior, but correctness-critical operations may still require careful transaction design, database constraints, and knowledge of PostgreSQL behavior.

### Exact money representation

**Decision:** Represent DENK V1 money as integer minor units: Turkish lira input is converted to kuruş at the boundary, stored as PostgreSQL `INTEGER` through Prisma `Int`, and handled as safe-integer TypeScript `number` values such as `12550` for ₺125.50. Store item price as `unitPriceMinor`, keep quantity separate, and assume TRY for V1 without adding a currency column or multi-currency abstraction.

**Reason:** Integer arithmetic avoids floating-point rounding errors and gives DENK one exact representation across validation, services, PostgreSQL, and tests. V1 has no multi-currency requirement.

**Accepted trade-off:** Input and presentation boundaries must parse and format lira carefully, reject more than two fractional digits and unsafe or out-of-range values, and never convert stored values back into floating-point money for business calculations. Supporting another currency later will require an explicit schema and behavior change.

### Layered database verification

**Decision:** Clean-runner CI validates the Docker Compose configuration and Prisma configuration/schema, generates Prisma Client, starts a fresh PostgreSQL database, applies all committed migrations non-interactively, verifies migration state, and runs database-backed integration tests. Stage 1 intentionally created no empty migration; Stage 2 supplied the first meaningful schema migration.

**Reason:** Static validation catches configuration and generation failures immediately. Fresh-database verification proves that DENK's version-controlled schema can be reproduced before application and browser tests run.

**Accepted trade-off:** CI incurs the cost of running PostgreSQL and database-backed tests on every protected workflow run. That cost provides continuing proof that the committed migration history works from a fresh database.

### Validation

**Decision:** Use Zod at untrusted input and configuration boundaries.

**Reason:** Client requests, route parameters, environment variables, and provider callbacks must be parsed before application services use them.

**Accepted trade-off:** Runtime schemas add some duplication beside TypeScript types; that duplication is justified where data crosses a trust boundary.

## Restaurant Catalog and Bill Snapshots

### Restaurant-scoped catalog identity

**Decision:** Introduce `CatalogItem` in Stage 3 as restaurant-scoped reference data. Each item has a stable, normalized lowercase key that is unique within its restaurant, a display name, an exact TRY unit price in integer kuruş, an active state, and audit-friendly timestamps. Database identifiers remain internal; the stable key is the operator-facing import identity.

**Reason:** Restaurant products need durable identity across repeated imports and display-name or price changes. Scoping uniqueness to the restaurant preserves tenant isolation while allowing different restaurants to use the same familiar keys.

**Accepted trade-off:** Stable keys become long-lived operational identifiers and therefore require validation and deliberate change handling. V1 does not introduce global products, variants, categories, tax modeling, or multi-currency catalog abstractions.

### Controlled catalog import

**Decision:** Manage the V1 catalog through an operator-controlled, schema-validated JSON import that targets one explicit restaurant. Apply a valid import atomically and idempotently by stable key. Reject duplicate keys and invalid records before mutation. Omitted entries remain unchanged; activation changes must be explicit; normal V1 operation deactivates rather than physically deletes catalog items. A self-service restaurant catalog-management UI is deferred beyond V1 unless later evidence changes the scope.

**Reason:** A controlled import provides reproducible catalog setup and updates without spending the V1 schedule on a broad administration interface. Atomic validation prevents partially applied menus, while explicit activation prevents accidental disappearance when an import contains only a subset.

**Accepted trade-off:** Catalog changes require an operator workflow and a documented JSON contract. Import files are not the runtime source of truth: PostgreSQL remains authoritative after a successful import.

### Bill-item financial snapshots

**Decision:** A bill item created from a catalog entry snapshots the item name and `unitPriceMinor` used for that bill. It may retain a nullable `catalogItemId` for traceability, but its stored snapshot—not the current catalog record—is the financial truth. Editing, deactivating, or later reactivating a catalog item must not rewrite existing bills.

**Reason:** A live restaurant catalog is mutable reference data, whereas an opened bill must remain explainable and stable. Snapshotting prevents a later menu update from silently changing what a guest owes or what a completed payment represents.

**Accepted trade-off:** Names and prices are intentionally duplicated between catalog items and bill items. Reporting must distinguish current catalog data from historical bill snapshots.

## Identity and Authorization

### Admin and Staff authentication

**Decision:** Use Better Auth for persistent Admin and Staff authentication. Implement `ADMIN` and `STAFF` authorization, restaurant ownership checks, and resource-scope checks in the application layer.

**Reason:** Authentication establishes who a restaurant-side user is; DENK-specific authorization determines what that user may do. Every restaurant-owned resource must be checked server-side rather than trusting a URL, form field, or hidden UI control.

**Accepted trade-off:** Authorization remains DENK code that must be designed, tested, and consistently applied; the authentication library does not solve it automatically.

### Authentication identity and restaurant membership ownership

**Decision:** Better Auth owns its core persistent identity and session data, including user, session, account, and verification records. DENK owns `Restaurant`, `RestaurantMembership`, restaurant-scoped `ADMIN`/`STAFF` roles, and resource authorization. `RestaurantMembership` references the Better Auth user identifier and is unique for a user/restaurant pair. Application services receive a minimal authenticated user identifier from the auth boundary and resolve DENK membership themselves.

**Reason:** Authentication and restaurant authorization are different responsibilities. A DENK membership model permits restaurant-scoped roles and ownership checks without duplicating authenticated users or coupling domain services to Better Auth session internals.

**Accepted trade-off:** DENK maintains a foreign-key relationship to Better Auth's user model and must keep generated auth schema compatible with the domain schema. The Better Auth organization plugin is intentionally not used in Stage 2 because its organizations, invitations, teams, active-organization state, and access-control system exceed the first slice's requirements.

### Anonymous guest identity

**Decision:** Keep guests outside Better Auth. Create a short-lived, opaque, database-backed `GuestSession` scoped to the active table/bill session. Send its bearer credential in a route-scoped, HttpOnly, SameSite cookie with explicit expiry and `Secure` enabled in production, and store only a cryptographic hash of the token in PostgreSQL.

**Reason:** Guests need no permanent account, but the server still needs a revocable identity with a narrow scope. An opaque credential avoids exposing database identifiers or trusting editable client state. Hashing limits the damage if stored session data is exposed.

**Accepted trade-off:** DENK owns guest-session creation, expiry, revocation, cookie handling, token lookup, and cleanup instead of delegating them to Better Auth.

### Join code and guest bearer credential

**Decision:** Treat the temporary join code and guest bearer token as separate credentials. The join code is a human-usable, lower-entropy credential scoped to one current table session, normalized before validation, expired by the server, and used only during each guest-session join exchange; multiple guests may join while the code remains valid. Use exactly eight unambiguous base32-style characters and store a keyed cryptographic digest rather than the raw code. Invalid table, code, and expiry cases return the same public result. The guest bearer token contains at least 256 random bits, is stored only as a cryptographic hash, and is delivered in a route-scoped, HttpOnly, SameSite cookie with explicit expiry and `Secure` enabled in production.

**Reason:** A join code grants only initial entry and is more guessable; a bearer token authenticates subsequent guest access and therefore requires substantially higher entropy. Separate handling prevents a convenient human code from becoming a long-lived session secret and limits information leakage during guessing.

**Accepted trade-off:** Stage 2 uses entropy, short validity, session scoping, uniform errors, and observable failed attempts without adding Redis, CAPTCHA, or distributed rate-limiting infrastructure. Deployment-aware rate limiting must be reviewed before public launch if measured risk requires it.

## Shared Bill Updates and Correctness

### Controlled polling

**Decision:** Poll approximately every two seconds only while a shared bill view is active, and refresh immediately after relevant mutations.

**Reason:** DENK needs changes to appear reasonably quickly, not a bespoke realtime platform. Polling is easy to observe, test, deploy, and recover when connections fail.

**Accepted trade-off:** Updates may be slightly stale and polling creates repeated reads. Polling frequency and active-view scope must be controlled.

### Authoritative server state

**Decision:** PostgreSQL constraints and application transactions remain authoritative regardless of what the UI most recently displayed.

**Reason:** Two guests can act on the same apparently available amount. Polling improves awareness but cannot prevent races. Allocation, payable amount, settlement, and bill-completion decisions must be recalculated and protected on the server.

**Accepted trade-off:** A mutation can be rejected even when it looked valid in a stale UI; the interface must refresh and explain the conflict.

## Payments

### Provider boundary

**Decision:** Define a small `PaymentProvider` abstraction. Payment application services depend on this abstraction, not on iyzico-specific types, SDK behavior, or callback formats.

**Reason:** DENK must exercise the complete payment lifecycle before processing real money and must keep provider mechanics separate from business settlement rules.

**Accepted trade-off:** The abstraction must be narrow and based on actual V1 needs; an untested abstraction may require adjustment when a real provider is added.

### Production-equivalent mock

**Decision:** Use a `MockPaymentProvider` for V1. It must support realistic success, pending/delayed, failed, and cancelled outcomes; authoritative simulated callbacks; provider identifiers; idempotent creation; duplicate request and callback handling; and protection against double settlement.

**Reason:** The mock makes payment-state, idempotency, concurrency, and callback engineering testable without real money or an external sandbox dependency.

**Accepted trade-off:** It cannot prove compatibility with a real processor or the operational behavior of an external network.

### Payment authority

**Decision:** The server calculates the payable amount. Payment initiation does not settle allocations. Only an authenticated and validated provider confirmation may transition a payment to success and trigger settlement, inside an idempotent transaction.

**Reason:** Client-supplied amounts and redirect pages are not financial authority. Duplicate requests and callbacks are normal distributed-system events and must not create duplicate payment attempts or settlements.

**Accepted trade-off:** The payment model contains explicit intermediate and terminal states and requires reconciliation-friendly records rather than a simple `paid` boolean.

### Later iyzico validation

**Decision:** iyzico Sandbox is the first candidate for a later `IyzicoPaymentProvider`, after the complete V1 mock flow works and is tested.

**Reason:** A sandbox adapter can validate the provider boundary against a realistic external system without making initial V1 delivery depend on real-provider integration.

**Accepted trade-off:** Provider-specific gaps may be discovered later. Real-money processing is explicitly outside initial V1.

## Engineering Tooling

| Area                   | Final choice                              | Purpose                                               |
| ---------------------- | ----------------------------------------- | ----------------------------------------------------- |
| Language               | TypeScript                                | Shared static types across UI and server code         |
| Web application        | Next.js 16+ App Router, React             | Full-stack application and user interfaces            |
| Styling                | Tailwind CSS                              | Consistent, efficient UI implementation               |
| Database               | PostgreSQL                                | Relational, transactional source of truth             |
| Data access            | Prisma + Prisma Migrate                   | Typed queries and versioned schema changes            |
| Staff authentication   | Better Auth                               | Persistent Admin/Staff identity and sessions          |
| Guest identity         | Opaque database-backed `GuestSession`     | Anonymous, revocable, bill-scoped participation       |
| Shared updates         | Controlled ~2-second polling              | Lightweight live-ish shared bill state                |
| Payments               | `PaymentProvider` + `MockPaymentProvider` | Provider-independent, production-equivalent lifecycle |
| Runtime validation     | Zod                                       | Validate external inputs and configuration            |
| Unit/integration tests | Vitest                                    | Domain, service, persistence, and boundary tests      |
| End-to-end tests       | Playwright                                | Browser validation of staff and guest journeys        |
| Package manager        | pnpm                                      | Reproducible dependency and script management         |
| Version control        | Git + GitHub                              | Traceable development history and collaboration host  |
| CI                     | GitHub Actions                            | Lint, type-check, test, and build on changes          |
| Static analysis        | ESLint                                    | Code-quality checks                                   |
| Formatting             | Prettier                                  | Consistent source formatting                          |

### Protected main workflow

**Decision:** `main` is protected by a repository rule that requires pull requests and the existing `Verify` GitHub Actions check before merge, blocks force pushes and branch deletion, and applies to the repository owner. Zero approving reviews are required while DENK has one developer.

**Reason:** The established **branch → pull request → CI → merge** workflow is enforced rather than advisory. This protects repository integrity and preserves a verified development history; it is not application authentication, authorization, or runtime security.

**Accepted trade-off:** The developer cannot bypass a failing check or push directly to `main`, but no second person is required to approve routine solo work. CODEOWNERS, signed commits, merge queues, mandatory external review, and other unrelated governance controls are intentionally not required at this stage.

## Local Development

Docker is not part of DENK's application architecture or production design. Docker Compose may optionally run PostgreSQL locally if it makes development setup more reproducible. The application must not depend on container-specific behavior.

The Compose port mapping binds PostgreSQL only to the development machine's loopback interface as `127.0.0.1:5432:5432`; DENK has no requirement for other machines to access this database. The simple `denk/denk` credentials are allowed only for isolated local development with non-sensitive, disposable state and must never be reused for staging or production.

## Intentionally Rejected for V1

| Rejected choice                             | Why it is not needed in V1                                                                                                                |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Separate NestJS, Fastify, or Spring backend | Adds another service, deployment, authentication boundary, and duplicated contracts without a current requirement for process separation  |
| Supabase Realtime                           | Adds an external realtime subsystem when controlled polling meets the freshness requirement                                               |
| WebSockets                                  | Adds connection lifecycle and infrastructure complexity that correctness does not require                                                 |
| Server-Sent Events                          | Reserve only as a later option if measured polling behavior proves insufficient                                                           |
| Redis                                       | No immediate caching, coordination, or ephemeral-data requirement that PostgreSQL cannot reasonably handle                                |
| Queues or Kafka                             | No V1 workload requires separate asynchronous messaging infrastructure                                                                    |
| Microservices                               | The product and team do not need independent service ownership or deployment                                                              |
| GraphQL                                     | DENK does not need a flexible graph query layer; focused server boundaries are simpler                                                    |
| Event sourcing                              | Versioned relational state and explicit payment records are sufficient; rebuilding all state from events adds disproportionate complexity |
| Kubernetes                                  | V1 has no orchestration requirement that justifies it                                                                                     |
| Real-money payment processing               | Initial V1 validates the complete lifecycle through the production-equivalent mock; iyzico Sandbox comes later                            |

## Validation Notes

No blocking inconsistencies found.

The decisions preserve these invariants:

- catalog identity is restaurant-scoped and stable across idempotent imports;
- invalid catalog input cannot partially mutate catalog state, and omission is not deletion;
- mutable catalog data cannot rewrite a bill item's financial snapshot;
- financial correctness does not depend on polling;
- concurrent allocation is protected in server/database transactions;
- guest identity is separate from Better Auth;
- successful payment is provider-authoritative;
- mock payments exercise realistic states, idempotency, duplicate callbacks, and settlement protection;
- payment business logic is provider-independent;
- bill, allocation, and payment rules live outside React UI components; and
- no rejected infrastructure is required by the V1 scope.

Technology selection and architecture planning are complete for DENK V1. Revisit a decision only if implementation reveals a concrete contradiction or missing requirement.
