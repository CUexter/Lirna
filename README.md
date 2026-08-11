# Lirna

Lirna is a first-party, self-hosted personal research and learning application
for desktop and mobile. The current executable skeleton proves the PWA, API,
worker, PostgreSQL, artifact storage, and synthetic Vault adapter as one system.

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
API/PWA and worker together:

```sh
npm run dev
```

Open <http://localhost:3000>. The page submits one synthetic operation through
the public API and observes the worker's result. Phase 0 uses only replaceable
filesystem adapters under `.lirna/artifacts` and `.lirna/synthetic-vault`; it
does not read or write `~/vaults`.

The processes can also be run separately with `npm run dev:api` and
`npm run dev:worker`. Stop PostgreSQL with `npm run db:down`.

Runtime paths and connectivity can be overridden with `DATABASE_URL`,
`ARTIFACT_ROOT`, `SYNTHETIC_VAULT_ROOT`, and `PORT`. No private Vault adapter
exists in this phase.

## Automated Checks

```sh
npm run typecheck
npm run build
npm test
```

The scenario suite starts disposable PostgreSQL through Testcontainers in local
development. CI supplies an equally disposable PostgreSQL service through
`TEST_DATABASE_URL`. All fixtures and adapter roots are synthetic temporary
data.
