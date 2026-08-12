# Hono for the hosted API

The separately hosted backend serves its HTTP API with **Hono**, rather than the
hand-rolled `node:http` control plane, a heavier framework, or a full-stack React
meta-framework. Hono gives web-standard routing, validation, and a typed RPC
client the web core can import for end-to-end type safety across the
client/server boundary — the decisive edge for a TypeScript-everywhere codebase.

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

- The client↔server boundary is an explicit, offline-tolerant network boundary; a
  typed Hono RPC contract is preferred over colocated server functions (which
  could not run in either the PWA or the Tauri host anyway).
