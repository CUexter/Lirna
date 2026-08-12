# Hono for the hosted API

The separately hosted backend serves its HTTP API with **Hono**, rather than the
hand-rolled `node:http` control plane, a heavier framework, or a full-stack React
meta-framework. What Hono actually delivers today — and what decided this
choice — is web-standard `Request`/`Response` handling, routing and validation
ergonomics over hand-rolled `node:http`, and a small surface that fits a
personal app. Hono *can* expose a typed RPC client (`hc`) the web core
imports for end-to-end type safety across the client/server boundary, but that
contract is not wired up yet; it remains a future option rather than the
decisive reason for choosing Hono.

## Status

accepted

## Considered Options

- **Plain `node:http`** (status quo) — rejected: viable only while the API stays
  trivial, which Lirna's domain (research threads, sources, citations, learning
  paths, quizzes, repetition) will not; every route would hand-roll routing, body
  parsing, validation, and error shaping.
- **TanStack Start** — rejected: it is a server-first framework (SSR, server
  functions, server routes) whose server layer has no home here. ADR 0001's
  PWA-first offline model wants a static client, and the Tauri host loads a static
  bundle, so Start would collapse to an `ssr:false` SPA — essentially today's
  Router + Query setup plus an unusable server half. The hosted backend still
  needs its own framework regardless.
- **Fastify** — reasonable fallback (schema-first validation, mature plugins) but
  heavier and offers no free typed client.
- **NestJS** — rejected: DI/decorator weight is overkill for a single-user app and
  clashes with the existing module-owned-transaction style.

## Consequences

- The client↔server boundary is an explicit, offline-tolerant network boundary;
  it is *not* a colocated-server-function boundary (server functions could not
  run in either the PWA or the Tauri host anyway).
- A typed Hono RPC contract (`hc`) remains a future option. The current client
  calls the API through raw `fetch` (`client/src/lib/operations.ts`), and the
  server exports no route type yet. Wiring up the typed client is first-build
  work, to be tracked separately if/when prioritised; re-audit this ADR
  if/when it lands.
