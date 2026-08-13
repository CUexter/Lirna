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
| Persistence | PostgreSQL 16 via Drizzle ORM, committed Drizzle Kit migrations, transactional outbox |
| Web core | React 19, [TanStack Router](https://tanstack.com/router) + [Query](https://tanstack.com/query), Tailwind CSS v4, locally owned shadcn/ui source |
| Build | Vite 7 (client), `tsc` (server) |
| Desktop host | Tauri (planned; not yet built) |
| Tests | Vitest (unit, integration, e2e), Testcontainers, Firefox-first Playwright Test |
| Reproducibility and deployment | Locked Nix flake, immutable server package, NixOS module |

Runtime dependencies and dev tooling are declared in
[`package.json`](./package.json); it is the single source of truth for versions.

## Boundaries

- Owned knowledge remains plain Markdown compatible with Obsidian and Neovim.
- AI-written knowledge remains provisional until Nathan explicitly owns it.
- Vault content and personal source material never belong in this repository.
- The product is single-user and hosted on Nathan-controlled infrastructure.

## Development environment

Enter the reproducible `x86_64-linux` shell before installing dependencies:

```sh
nix develop
npm ci
```

The shell supplies Node 22, PostgreSQL 16, Docker, Compose, and Playwright's
patched Firefox through `PLAYWRIGHT_BROWSERS_PATH`. Do not run
`npx playwright install`. For future desktop-host work, use
`nix develop .#desktop` to add Rust, Cargo, pkg-config, and WebKitGTK.

Entering `nix develop` activates this repository's `.githooks` locally without
changing global Git configuration. Pre-commit checks assess direct dependency
changes and scans staged content for secrets; pre-push scans outgoing commits.
If a finding may be a live credential, stop and alert Nathan; rotate or revoke
it before attempting history cleanup.

### Dependency changes

Use `npm run dependency:add -- <one-package-request>` for runtime dependencies,
or include `--dev`, `--optional`, or `--peer` for the corresponding section. The
command assesses one exact artifact, installs it with scripts disabled, and
writes exact assessment evidence under `config/dependency-decisions/`; commit
that evidence with the manifest and lockfile change. Direct `npm install`,
`uninstall`, `update`, `link`, `npx`, and `npm exec` are not supported Coding-agent
paths. `npm search`, `npm view`, repository scripts, and `npm ci --ignore-scripts`
remain available. The pre-commit hook and CI detect direct dependency additions,
but are detection controls rather than a claim to block every external process.

### Repository security CI

The required CI security checks are named `Gitleaks`, `Dependency verification`,
`Semgrep`, and `Trivy npm vulnerability policy`. Gitleaks scans the relevant Git
range with the repository-owned policy, with a scheduled weekly full-history scan.
Semgrep blocks only the reviewed rules in
`config/semgrep/blocking.yml`; broader reporting rules remain visible without
failing the initial rollout. Trivy scans only the committed npm dependency graph:
critical findings fail, while high findings are reported. Trivy secret scanning is
not enabled because Gitleaks is the sole secret-scanning authority.

CI installs the lockfile with `npm ci --ignore-scripts` and invokes the same tools
from the pinned Nix development shell. Reports are terminal output or ephemeral
workflow artifacts, never committed files. The declarative ruleset in
`.github/rulesets/main.json` names all four checks and blocks direct updates to
`main`. GitHub ruleset 20801666 actively requires the checks in strict mode and
has no bypass actors.

Tool configuration (Biome, Vitest, Playwright, Drizzle Kit, and the
`tsconfig.*` build/typecheck projects) lives under [`config/`](./config) to keep
the repository root uncluttered. Because those tools only auto-discover config at
the root, invoke them through the `npm run` scripts in
[`package.json`](./package.json) rather than bare `npx biome`/`vitest`/`tsc`; the
scripts pass the correct `--config`/`-p` path. Point editor and IDE integrations
at the files under `config/` (the solution-level root `tsconfig.json` already
references the `config/tsconfig.*` projects for TypeScript tooling).

## Run locally

Start PostgreSQL and apply migrations:

```sh
npm run db:up
npm run db:migrate
```

Wait for PostgreSQL to report healthy with `docker compose ps`, apply committed
migrations, then start the
API, worker, and Vite client dev server together:

```sh
npm run dev
```

Open the Vite dev server it prints (default <http://localhost:5173>); it proxies
`/api` to the backend on port 3000. The page submits one synthetic operation
through the public API and observes the worker's result. Phase 0 uses only
replaceable filesystem adapters under `.lirna/artifacts` and
`.lirna/synthetic-results`; it never reads or writes `~/vaults`.

To exercise the production layout, build the client and serve it through the API:

```sh
npm run build
npm run start:api
```

Then open <http://localhost:3000>, where the API serves the built client.

The processes can also be run separately with `npm run dev:api`,
`npm run dev:worker`, and `npm run dev:client`. Stop PostgreSQL with
`npm run db:down`.

Schema declarations are colocated with their owning server modules. Run
`npm run db:generate` after changing them, inspect the generated migration for
destructive changes and preserved custom triggers, then commit it. API and worker
startup only check migration state; they never mutate the schema.

Runtime paths and connectivity can be overridden with `DATABASE_URL`,
`ARTIFACT_ROOT`, `SYNTHETIC_RESULT_ROOT`, `HOST`, and `PORT`. The API process requires
separate `HUMAN_ACCESS_TOKEN` and `SERVICE_ACCESS_TOKEN` secrets of at least 32
characters. The initial Sources form uses the human credential to authenticate
Nathan's explicit admission action. Text admission accepts request bodies up to
100 MiB; larger publications need a later file-ingestion path. Workers need
neither credential. No private Vault adapter
exists in this phase.

## Tests

Tests are placed by what they touch (a test's folder or colocation declares it):

| Kind | Location | Touches | Command |
|---|---|---|---|
| Unit | colocated `*.test.ts(x)` beside source | nothing real (in-process only) | `npm run test:unit` |
| Integration | `tests/integration/` | real PostgreSQL / API / filesystem, no browser | `npm run test:integration` |
| e2e | `tests/e2e/` | the full system without browser-specific interaction | `npm run test:e2e` |
| Browser | `tests/browser/` | built PWA, API, worker, disposable PostgreSQL, Firefox | `npm run test:browser` |
| Gate | `tests/gate/` | one consolidated Phase 0 body of evidence through the application scenario seam | `npm run test:gate` |

```sh
npm run typecheck
npm run build
npm test
npm run test:browser
npm run metrics
```

`npm run metrics` writes coverage plus complexity and maintainability reports to
ignored `coverage/` and `metrics/` directories. Metrics are reported without
initial pass/fail thresholds.

The Phase 0 gate (`tests/gate/`, see [docs/phase-0-gate.md](docs/phase-0-gate.md))
is one reproducible body of evidence for the architecture skeleton's riskiest
authority, durability, artifact, workflow, and policy promises, driven through a
single application scenario seam (`tests/support/phase-0-scenario.ts`).

`npm run build` compiles the production client into `dist/client`; the e2e check
serves that build, so run `npm run build` before `npm test`. The integration and
e2e suites start disposable PostgreSQL through Testcontainers in local
development; CI supplies an equally disposable PostgreSQL through
`TEST_DATABASE_URL`; browser CI starts its own Testcontainers database. All fixtures and adapter
roots are synthetic temporary data.

## Nix package and NixOS

Build the immutable hosted-server package or run one of its launchers:

```sh
nix build .#server
nix run .#migrate
nix run .#api
nix run .#worker
```

The package includes the built PWA and server, production dependencies, and
committed migrations. It excludes `prototype/`. Run ordinary package, quality,
and NixOS evaluation checks with `nix flake check`. Run the heavier deployment VM
test explicitly with `nix build .#nixos-test`.

Import `nixosModules.default` and configure the service:

```nix
{
  imports = [ inputs.lirna.nixosModules.default ];

  services.lirna = {
    enable = true;
    package = inputs.lirna.packages.x86_64-linux.server;
    environmentFile = "/run/secrets/lirna.env";
  };
}
```

The root-managed environment file must define `HUMAN_ACCESS_TOKEN` and
`SERVICE_ACCESS_TOKEN`. With the default `database.createLocally = true`, the
module provisions PostgreSQL 16 and database ownership through peer
authentication. For an external database, set `database.createLocally = false`
and set `database.environmentFile` to a separate root-managed file defining
`DATABASE_URL`. The migration unit must succeed before the independently
supervised API and worker units start. See
[ADR 0005](./docs/adr/0005-nix-package-and-nixos-service.md).

## Planning

The canonical planning artifact lives in this repository's GitHub Issues as a
Wayfinder map. Earlier [Ariadne](https://github.com/CUexter/ariadne) discussions
are prior evidence, not inherited decisions.
