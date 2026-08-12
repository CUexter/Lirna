# Lirna

Lirna is a first-party, self-hosted personal research and learning application
for desktop and mobile. The current executable skeleton proves the PWA, API,
worker, PostgreSQL, artifact storage, and synthetic Vault adapter as one system.
It also proves the Phase 0 domain invariants: a synthetic domain operation keeps
one stable object identity while recording current state, immutable history, and
an outbound event in one atomic, module-owned transaction (a transactional
outbox). The client is a Vite-built React application (TanStack Router, TanStack
Query, Tailwind CSS, and locally owned shadcn/ui component source) served as
static assets by the `node:http` control plane; routing and server-state
observation stay entirely on the client.

The canonical planning artifact lives in this repository's GitHub Issues as a
Wayfinder map. Earlier [Ariadne](https://github.com/CUexter/ariadne) discussions
are prior evidence, not inherited decisions.

## Boundaries

- Owned knowledge remains plain Markdown compatible with Obsidian and Neovim.
- AI-written knowledge remains provisional until Nathan explicitly owns it.
- Vault content and personal source material never belong in this repository.
- The product is single-user and hosted on Nathan-controlled infrastructure.

## Requirements

- Node.js 22 or newer
- Docker with Compose
- Google Chrome for the browser-level scenario check

## Run Locally

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

In development, open the Vite dev server it prints (default
<http://localhost:5173>); it proxies `/api` to the backend on port 3000. The
page submits one synthetic operation through the public API and observes the
worker's result. Phase 0 uses only replaceable filesystem adapters under
`.lirna/artifacts` and `.lirna/synthetic-vault`; it does not read or write
`~/vaults`.

To exercise the production layout, build the client and serve it through the
control plane:

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

## Automated Checks

```sh
npm run typecheck
npm run build
npm test
```

`npm run build` compiles the production client into `dist/client`; the
browser-level scenario check serves that build, so run `npm run build` before
`npm test`. The scenario suite starts disposable PostgreSQL through
Testcontainers in local development. CI supplies an equally disposable
PostgreSQL service through `TEST_DATABASE_URL`. All fixtures and adapter roots
are synthetic temporary data.
