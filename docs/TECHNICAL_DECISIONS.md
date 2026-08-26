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

### Validation

**Decision:** Use Zod at untrusted input and configuration boundaries.

**Reason:** Client requests, route parameters, environment variables, and provider callbacks must be parsed before application services use them.

**Accepted trade-off:** Runtime schemas add some duplication beside TypeScript types; that duplication is justified where data crosses a trust boundary.

## Identity and Authorization

### Admin and Staff authentication

**Decision:** Use Better Auth for persistent Admin and Staff authentication. Implement `ADMIN` and `STAFF` authorization, restaurant ownership checks, and resource-scope checks in the application layer.

**Reason:** Authentication establishes who a restaurant-side user is; DENK-specific authorization determines what that user may do. Every restaurant-owned resource must be checked server-side rather than trusting a URL, form field, or hidden UI control.

**Accepted trade-off:** Authorization remains DENK code that must be designed, tested, and consistently applied; the authentication library does not solve it automatically.

### Anonymous guest identity

**Decision:** Keep guests outside Better Auth. Create a short-lived, opaque, database-backed `GuestSession` scoped to the active table/bill session. Send its bearer credential in a Secure, HttpOnly cookie and store only a cryptographic hash of the token in PostgreSQL.

**Reason:** Guests need no permanent account, but the server still needs a revocable identity with a narrow scope. An opaque credential avoids exposing database identifiers or trusting editable client state. Hashing limits the damage if stored session data is exposed.

**Accepted trade-off:** DENK owns guest-session creation, expiry, revocation, cookie handling, token lookup, and cleanup instead of delegating them to Better Auth.

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

## Local Development

Docker is not part of DENK's application architecture or production design. Docker Compose may optionally run PostgreSQL locally if it makes development setup more reproducible. The application must not depend on container-specific behavior.

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

- financial correctness does not depend on polling;
- concurrent allocation is protected in server/database transactions;
- guest identity is separate from Better Auth;
- successful payment is provider-authoritative;
- mock payments exercise realistic states, idempotency, duplicate callbacks, and settlement protection;
- payment business logic is provider-independent;
- bill, allocation, and payment rules live outside React UI components; and
- no rejected infrastructure is required by the V1 scope.

Technology selection and architecture planning are complete for DENK V1. Revisit a decision only if implementation reveals a concrete contradiction or missing requirement.
