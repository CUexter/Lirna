# Lirna

Lirna is a first-party, self-hosted personal research and learning application
for desktop and mobile. See [`CONTEXT.md`](./CONTEXT.md) for the domain language
and [`docs/adr/`](./docs/adr) for the architectural decisions.

The current executable skeleton proves the client, API, worker, PostgreSQL,
artifact storage, and synthetic Vault adapter as one system, plus the Phase 0
domain invariant: a synthetic operation keeps one stable object identity while
recording current state, immutable history, and an outbound event in one atomic,
module-owned transaction (a transactional outbox).

## Architecture

Lirna is one hosted backend serving thin clients, split into three units
([ADR 0001](./docs/adr/0001-pwa-first-web-core-narrow-desktop-tauri-host.md)):

| Unit         | Path       | Role |
|--------------|------------|------|
| Hosted API   | `server/`  | The single backend on Nathan-controlled infrastructure: HTTP API, background worker, PostgreSQL, artifact and Vault adapters. Owns canonical state. |
| Web core     | `client/`  | One responsive PWA for desktop and mobile browsers. Offline-precached; local storage is a recoverable replica/outbox, never canonical. |
| Desktop host | `desktop/` | A narrow, least-privilege Tauri shell that loads the same web core and adds only the direct Vault-folder adapter. Placeholder; see `desktop/README.md`. |

Cross-cutting choices are recorded as ADRs:

- [ADR 0001](./docs/adr/0001-pwa-first-web-core-narrow-desktop-tauri-host.md) — PWA-first web core with a narrow desktop Tauri host.
- [ADR 0002](./docs/adr/0002-hono-for-the-hosted-api.md) — Hono for the hosted API.

## Technology

| Concern | Choice |
|---|---|
| Language | TypeScript (ESM, Node.js ≥ 22) |
| Hosted API | [Hono](https://hono.dev) on `@hono/node-server` |
| Persistence | PostgreSQL 16 (via `pg`), transactional outbox |
| Web core | React 19, [TanStack Router](https://tanstack.com/router) + [Query](https://tanstack.com/query), Tailwind CSS v4, locally owned shadcn/ui source |
| Build | Vite 7 (client), `tsc` (server) |
| Desktop host | Tauri (planned; not yet built) |
| Tests | Vitest (unit · integration · e2e), Testcontainers, Playwright |

Runtime dependencies and dev tooling are declared in
[`package.json`](./package.json); it is the single source of truth for versions.

## Boundaries

- Owned knowledge remains plain Markdown compatible with Obsidian and Neovim.
- AI-written knowledge remains provisional until Nathan explicitly owns it.
- Vault content and personal source material never belong in this repository.
- The product is single-user and hosted on Nathan-controlled infrastructure.

## Requirements

- Node.js 22 or newer
- Docker with Compose
- Google Chrome for the browser-level e2e check

## Run locally

Install dependencies and start PostgreSQL:

```sh
npm install
npm run db:up
```

Wait for PostgreSQL to report healthy with `docker compose ps`, then start the
API, worker, and Vite client dev server together:

```sh
npm run dev
```

Open the Vite dev server it prints (default <http://localhost:5173>); it proxies
`/api` to the backend on port 3000. The page submits one synthetic operation
through the public API and observes the worker's result. Phase 0 uses only
replaceable filesystem adapters under `.lirna/artifacts` and
`.lirna/synthetic-vault`; it never reads or writes `~/vaults`.

To exercise the production layout, build the client and serve it through the API:

```sh
npm run build
npm run start:api
```

Then open <http://localhost:3000>, where the API serves the built client.

The processes can also be run separately with `npm run dev:api`,
`npm run dev:worker`, and `npm run dev:client`. Stop PostgreSQL with
`npm run db:down`.

Runtime paths and connectivity can be overridden with `DATABASE_URL`,
`ARTIFACT_ROOT`, `SYNTHETIC_VAULT_ROOT`, and `PORT`. No private Vault adapter
exists in this phase.

## Tests

Tests are placed by what they touch (a test's folder or colocation declares it):

| Kind | Location | Touches | Command |
|---|---|---|---|
| Unit | colocated `*.test.ts(x)` beside source | nothing real (in-process only) | `npm run test:unit` |
| Integration | `tests/integration/` | real PostgreSQL / API / filesystem, no browser | `npm run test:integration` |
| e2e | `tests/e2e/` | the full system through a real browser | `npm run test:e2e` |
| Gate | `tests/gate/` | one consolidated Phase 0 body of evidence through the application scenario seam | `npm run test:gate` |

```sh
npm run typecheck
npm run build
npm test
```

The Phase 0 gate (`tests/gate/`, see [docs/phase-0-gate.md](docs/phase-0-gate.md))
is one reproducible body of evidence for the architecture skeleton's riskiest
authority, durability, artifact, workflow, and policy promises, driven through a
single application scenario seam (`tests/support/phase-0-scenario.ts`).

`npm run build` compiles the production client into `dist/client`; the e2e check
serves that build, so run `npm run build` before `npm test`. The integration and
e2e suites start disposable PostgreSQL through Testcontainers in local
development; CI supplies an equally disposable PostgreSQL through
`TEST_DATABASE_URL`. All fixtures and adapter roots are synthetic temporary data.

## Planning

The canonical planning artifact lives in this repository's GitHub Issues as a
Wayfinder map. Earlier [Ariadne](https://github.com/CUexter/ariadne) discussions
are prior evidence, not inherited decisions.
