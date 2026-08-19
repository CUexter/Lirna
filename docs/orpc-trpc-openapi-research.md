# tRPC, oRPC, OpenAPI, and interactive API docs

Research date: 2026-08-17

## Research recommendation, not an accepted architecture decision

Lirna currently uses tRPC 11.18.0. Its ten implemented procedures are
end-to-end typed and integrated with Hono and TanStack Query, and neither RPC
library implements Lirna's offline replica/outbox model. This research note
recommends deferring an oRPC migration because it would mostly exchange
equivalent plumbing while oRPC is between a stable v1 line and a rapidly
changing v2 public beta.

That recommendation does not decide whether Lirna will publish an OpenAPI
contract, expose interactive API documentation, or adopt oRPC. Those product
and API-boundary decisions remain unresolved; see [Decision boundary](#decision-boundary).

Reconsider oRPC when either condition becomes true:

- OpenAPI/ordinary REST becomes a durable contract for workers, Service
  identities, non-TypeScript clients, or external tooling, rather than a
  developer convenience.
- oRPC v2 reaches stable before Lirna's real product API grows. The current
  still-small procedure surface makes that a comparatively inexpensive
  migration window.

If an OpenAPI document or interactive explorer is useful immediately, take the
minimal tRPC path: evaluate the alpha `@trpc/openapi` generator against Lirna's
router, serve the generated document from Hono, and render it with Scalar on a
separately access-controlled route. Do not treat the alpha generator as a
production contract without snapshot/validation tests.

## Lirna's current boundary

- ADR 0001 fixes one static, offline-precached PWA web core shared by browsers
  and a narrow Tauri host, backed by a separately hosted API, worker, and
  PostgreSQL. Client state is a recoverable replica/outbox, not canonical
  storage (`docs/adr/0001-pwa-first-web-core-narrow-desktop-tauri-host.md`).
- ADR 0002 fixes Hono and a real, offline-tolerant network boundary rather than
  colocated server functions (`docs/adr/0002-hono-for-the-hosted-api.md`).
  Its statement that the web app still uses raw `fetch` is now stale: the
  current implementation mounts tRPC in Hono and uses a typed tRPC client.
- The hosted package supervises API and worker separately, with migrations
  gating both (`docs/adr/0005-nix-package-and-nixos-service.md`). The domain
  also distinguishes a revocable Client installation from a narrowly authorized
  non-human Service identity (`CONTEXT.md:184-200`). A documented HTTP contract
  may therefore become valuable even though today's browser client is
  TypeScript.
- The lockfile resolves `@trpc/client`, `@trpc/server`, and
  `@trpc/tanstack-react-query` to exactly 11.18.0 (`bun.lock:1038-1042`), even
  though the workspace catalog declares compatible ranges (`package.json:9-25`).
- `@lirna/api` defines the public `healthCheck` query, the authenticated
  `privateData` query, and eight public `sepAdmission` procedures: `submit`,
  `get`, `extend`, `retry`, `admit`, `state`, `reading`, and `delete`
  (`packages/api/src/routers/index.ts`; `packages/api/src/routers/sep-admission.ts`).
  Authentication is reusable tRPC middleware over a per-request Better Auth
  session and currently protects `privateData`
  (`packages/api/src/index.ts`; `packages/api/src/context.ts`).
- Hono mounts that router at `/trpc/*` through `@hono/trpc-server`, alongside
  Better Auth and CORS (`apps/server/src/index.ts`). Existing server HTTP tests
  cover the health check and the unauthenticated 401 shape for `privateData`
  (`apps/server/src/index.test.ts`).
- The static web app imports only the router type, uses `httpBatchLink` with
  cookies, and creates TanStack Query options. The migration replaces the
  former tRPC utils file with per-module oRPC clients under
  `apps/web/src/clients/`.
  The Source-admission and Reading routes consume the public `sepAdmission`
  procedures (`apps/web/src/routes/sources/admission.tsx`;
  `apps/web/src/routes/sources/$sourceId/$stateId.tsx`). This is the singleton
  SPA pattern that tRPC's current docs explicitly recommend for a Vite client.

## Fit comparison

| Concern | Retain tRPC 11.18.0 | Migrate to oRPC |
|---|---|---|
| Hono / separate backend | Already working through `@hono/trpc-server`. | Official oRPC docs show `RPCHandler` or `OpenAPIHandler` mounted as Fetch handlers inside Hono. This fits the accepted Hono boundary without changing hosting. |
| Shared PWA/Tauri web core | Current type-only router import and browser `fetch` transport work in either host. | Equivalent typed Fetch client. No native-host coupling is required. |
| TanStack Query | Current `createTRPCOptionsProxy` produces `queryOptions`; this is the integration tRPC recommends over its classic React integration. | Official `@orpc/tanstack-query` also produces `queryOptions`, mutation options, keys, and invalidation helpers. The web call sites would change syntax, not architecture. |
| Offline model | TanStack Query handles server-state caching, but current code does not implement ADR 0001's selected offline working set, durable replica, or outbox. Retaining tRPC neither solves nor blocks that work. | Same conclusion. oRPC retry/stream features are transport facilities, not Lirna's durable offline model. Keep replica/outbox reconciliation behind a client-owned sync boundary rather than coupling it to either RPC client. |
| Worker / Service boundary | Type inference is strongest for TypeScript consumers that can import `AppRouter`. The alpha OpenAPI generator can expose a language-neutral description, but it adds maturity risk and tRPC-specific query encoding. | First-class OpenAPI generation and an OpenAPI HTTP handler are stable-v1 features. Explicit routes, input/output schemas, typed errors, and optional contract-first definitions are a better fit if workers or services must consume a durable REST contract. |
| Authentication | Existing session context, protected middleware for `privateData`, cookie transport, and tested 401 behavior stay untouched. | Straightforward conceptually, but context creation, protected middleware, error declarations, cookie behavior, and tests must all be translated and re-proved. OpenAPI security metadata still has to describe the actual Better Auth mechanism. |
| Maturity on 2026-08-17 | tRPC v11.18.0 is a stable release; Lirna is already locked to it. `@trpc/openapi` is explicitly alpha and may change without notice. | oRPC v1 declares its public API stable and production-ready; the latest official stable tag is v1.15.0. v2 is explicitly public beta, with beta.28 tagged on 2026-08-15. Adopting v2 now accepts beta churn; adopting v1 now may create near-term v2 migration work. |
| Change cost today | Additive OpenAPI/docs work only; no application call sites need change. | Low in absolute size but broad in seams: API package, auth middleware/context, Hono handler, web client/options proxy, web call sites, package manifests/lockfile, and HTTP tests. It also changes the tested error and wire formats. |

Official sources for this comparison:

- tRPC's current TanStack Query setup documents the same context-free singleton
  SPA pattern Lirna uses:
  <https://trpc.io/docs/client/tanstack-react-query/setup>.
- tRPC authorization documents request context and reusable protected-procedure
  middleware: <https://trpc.io/docs/server/authorization>.
- oRPC's stable-v1 Hono adapter permits either RPC or OpenAPI handlers:
  <https://orpc.dev/docs/adapters/hono>.
- oRPC's stable-v1 TanStack Query integration:
  <https://orpc.dev/docs/integrations/tanstack-query>.
- oRPC's v1 announcement defines v1 as a stable public API ready for production:
  <https://orpc.dev/blog/v1-announcement>. Official repository tags show
  `v1.15.0` and the v2 beta sequence:
  <https://github.com/middleapi/orpc/tags>.
- The v2 site labels itself beta and directs installation to the `beta` npm tag:
  <https://v2.orpc.dev/>. The official beta.28 release commit is dated
  2026-08-15:
  <https://github.com/middleapi/orpc/commit/47280ab01a7ed575fdcad9fa8417edce731ebc0f>.
- The official tRPC 11.18.0 release commit is dated 2026-06-17:
  <https://github.com/trpc/trpc/commit/6aec1578a899df50a17e4e78d5512a099b574c18>.

## OpenAPI is not interactive documentation

An OpenAPI generator produces a machine-readable specification. That document
can drive clients, contract checks, and documentation renderers, but it is not
itself an interactive UI.

### Minimal retain-tRPC path

1. Add version-aligned `@trpc/openapi` and generate an OpenAPI 3.1 document from
   `AppRouter` at build time. The official generator statically analyzes router
   types, does not execute application code, does not require output schemas,
   maps queries to `GET /procedure.path` and mutations to `POST`, and currently
   omits subscriptions. It is explicitly alpha and recommends matching the
   package version to tRPC: <https://trpc.io/docs/openapi>.
2. Serve the generated JSON from a Hono route such as `/openapi.json` and point
   its server URL at Lirna's `/trpc` prefix. Keep generation deterministic and
   validate/snapshot the result in CI because the generator API is unstable.
3. Add Scalar separately at a route such as `/docs`. Hono's official example
   uses `@scalar/hono-api-reference` with `Scalar({ url: '/doc' })` to render an
   OpenAPI/Swagger document: <https://hono.dev/examples/scalar>. Scalar's own
   Hono integration describes the result as interactive API documentation:
   <https://scalar.com/products/api-references/integrations/hono>.
4. Protect or disable the spec and explorer in production unless Service
   identity policy explicitly permits them. Verify same-origin cookies and CSRF
   behavior before enabling "try it" against authenticated mutations. The
   generator cannot infer Lirna's authorization policy merely from
   `protectedProcedure`; security schemes and operation policy need deliberate
   review.

This path documents the existing tRPC wire protocol rather than creating a
clean conventional REST contract. The tRPC docs note that generated clients
must encode query input as `?input=<JSON>` and match any configured transformer.
Lirna currently has no transformer, reducing that risk, but a future external
consumer would still be coupled to tRPC's HTTP representation.

### oRPC path

Stable oRPC v1 can generate OpenAPI 3.1.1 from a router or contract and serve
ordinary REST through `OpenAPIHandler`:
<https://orpc.dev/docs/openapi/openapi-specification> and
<https://orpc.dev/docs/openapi/openapi-handler>. Its v1 OpenAPI Reference plugin
serves both `/spec.json` and an interactive Scalar UI by default, with Swagger
UI as an option:
<https://orpc.dev/docs/openapi/plugins/openapi-reference>.

The distinction still matters: oRPC's generator creates the specification;
Scalar or Swagger renders the UI. oRPC merely offers a first-party plugin that
wires both together. v2 retains this model and calls Scalar the default provider:
<https://v2.orpc.dev/docs/plugins/openapi-reference>.

For Lirna, a migration should use one router with an RPC handler for the shared
TypeScript web core and, only where needed, an OpenAPI handler for durable REST
operations. Do not expose every internal operation automatically. Explicitly
route and schema operations intended for workers or Service identities, filter
internal procedures from the generated specification, and model auth/error
responses as part of that contract.

## Decision boundary

No accepted ADR chooses an OpenAPI or interactive-documentation boundary. The
implementation establishes only the current tRPC boundary and its TypeScript web
client. Before adding a specification, explorer, or migration, decide:

- Whether any worker, Service identity, non-TypeScript client, or external tool
  needs a durable HTTP contract, rather than a TypeScript-only tRPC client.
- Whether an OpenAPI document and interactive explorer should be published at
  all, and if so which authenticated users may access them or use authenticated
  requests from the explorer.
- If OpenAPI is accepted as a durable contract, whether to retain tRPC with its
  alpha generator or migrate selected operations to oRPC's first-class OpenAPI
  handler.

The research recommendation is not to migrate solely to obtain a docs page. If
documentation becomes useful before those decisions are accepted, trial the tRPC
generator plus Scalar as an explicitly non-contract experiment, with validation
and access-control review. Re-evaluate oRPC when v2 is stable or before a
substantial worker- or Service-identity-facing API is committed.
