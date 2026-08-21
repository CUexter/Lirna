# Lirna

Lirna is a first-party, self-hosted personal research and learning application
for desktop and mobile. See [`CONTEXT.md`](./CONTEXT.md) for the domain language
and [`docs/adr/`](./docs/adr) for architectural decisions.

The project uses [Better-T-Stack](https://github.com/AmanVarshney01/create-better-t-stack),
a modern TypeScript stack combining React, TanStack Router, Hono, tRPC, and more.

## Features

- **TypeScript** - Type safety and an improved developer experience
- **TanStack Router** - File-based routing with full type safety
- **Tailwind CSS** - Utility-first CSS for rapid UI development
- **Shared UI package** - shadcn/ui primitives in `packages/ui`
- **Hono** - Lightweight, performant server framework
- **tRPC** - End-to-end type-safe APIs
- **Bun** - Runtime and package manager
- **Drizzle** - TypeScript-first ORM
- **PostgreSQL** - Database engine
- **Better Auth** - Authentication
- **Biome** - Linting and formatting
- **Husky** - Git hooks for code quality
- **Gitleaks** - Secret scanning before commits and in CI
- **Semgrep** - Security-focused static analysis for application source
- **Trivy** - Container vulnerability and deployment configuration scanning
- **PWA** - Progressive Web App support
- **Tauri** - Native desktop application support
- **Starlight** - Astro-powered documentation site

## Boundaries

- Owned knowledge remains plain Markdown compatible with Obsidian and Neovim.
- AI-written knowledge remains provisional until Nathan explicitly owns it.
- Vault content and personal source material never belong in this repository.
- The product is single-user and hosted on Nathan-controlled infrastructure.

## Getting Started

Install dependencies from the project root:

```bash
bun install
```

### Checkout Lifecycle

Register the primary Git checkout once before creating managed worktrees:

```bash
bun run lifecycle register
```

Registration assigns a stable, non-secret UUID to the canonical checkout path.
Machine-local lifecycle state is stored at
`$XDG_STATE_HOME/lirna/lifecycle.json`, or
`~/.local/state/lirna/lifecycle.json` when `XDG_STATE_HOME` is unset. It is
never written into the checkout.

Inspect the current checkout without changing lifecycle, application, or
database state:

```bash
bun run lifecycle diagnose
```

Diagnosis emits stable JSON fields for the identity, canonical checkout path,
checkout kind, registration state, issues, and corrective actions. It exits
nonzero when it finds an inconsistency.

### Database Setup

Lirna uses PostgreSQL with Drizzle ORM.

1. Set up a PostgreSQL database.
2. Add the PostgreSQL connection details to `apps/server/.env`.
3. Apply the schema:

```bash
bun run db:push
```

Start all development applications:

```bash
bun run dev
```

Open <http://localhost:3001> for the web application. The API runs at
<http://localhost:3000>.

## UI Customization

React web apps share shadcn/ui primitives through `packages/ui`.

- Change design tokens and global styles in `packages/ui/src/styles/globals.css`.
- Update shared primitives in `packages/ui/src/components/*`.
- Adjust shadcn aliases or style configuration in `packages/ui/components.json`
  and `apps/web/components.json`.

### Add Shared Components

Use the `ui:add` wrapper from the project root to add primitives to the shared
UI package. It runs shadcn against `packages/ui`, formats new files with Biome,
and appends them to the coverage baseline so the ratchet treats them as
reviewed legacy exclusions:

```bash
bun run ui:add accordion dialog popover sheet table
```

To retroactively baseline files added without the wrapper:

```bash
bun run ui:add -- --baseline-only packages/ui/src/components/popover.tsx
```

Never call `shadcn add` directly; the wrapper is the only supported entry
point.

Import shared components from the package:

```tsx
import { Button } from "@lirna/ui/components/button";
```

### Add App-Specific Blocks

Run the shadcn CLI from `apps/web` when adding app-specific blocks rather than
shared primitives.

## Deployment

### Docker Compose

- Target: web and server
- Configuration: `docker-compose.yml`; app Dockerfiles are under `apps/*/Dockerfile`
- Build images: `bun run docker:build`
- Start: `bun run docker:up`
- View logs: `bun run docker:logs`
- Stop: `bun run docker:down`

Environment variables come from each app's `.env` file and are overridden in
`docker-compose.yml` for container networking. Public web variables are baked
into web builds.

See the [Better-T-Stack Docker Compose guide](https://www.better-t-stack.dev/docs/guides/docker)
for more details.

### Nix and NixOS

The flake provides a development shell, a reproducible server package, and a
NixOS service module with optional local PostgreSQL. See
[`docs/nix.md`](./docs/nix.md) for the available outputs, module options,
deployment example, and checks.

## Git Hooks and Formatting

- Enter the Nix development shell for Gitleaks and the other native tools: `nix develop`
- Initialize hooks: `bun run prepare`
- Run read-only checks: `bun run check`
- Apply automatic fixes: `bun run check:fix`
- Scan repository history for secrets: `bun run secrets:check`
- Verify changed direct dependencies against `bun.lock`: `bun run dependency:check`
- Score changed direct dependencies for supply-chain confidence (advisory): `bun run dependency:score`
- Run blocking source security rules: `bun run check:semgrep`
- Report lower-confidence source security findings: `bun run report:semgrep`
- Scan deployable configuration: `scripts/trivy-scan.sh config`
- Scan Bun and Cargo lockfiles: `scripts/trivy-scan.sh dependencies`

## Project Structure

```text
lirna/
├── apps/
│   ├── web/         # React and TanStack Router frontend
│   ├── docs/        # Astro Starlight documentation site
│   └── server/      # Hono and tRPC backend API
└── packages/
    ├── ui/          # Shared shadcn/ui components and styles
    ├── api/         # API layer and business logic
    ├── auth/        # Authentication configuration and logic
    └── db/          # Database schema and queries
```

## Available Scripts

- `bun run dev`: Start all applications in development mode
- `bun run lifecycle register`: Idempotently register the primary checkout
- `bun run lifecycle diagnose`: Read the current checkout lifecycle state
- `bun run build`: Build all applications
- `bun run dev:web`: Start only the web application
- `bun run dev:server`: Start only the server
- `bun run check-types`: Check TypeScript types across all apps
- `bun run test:e2e`: Run the deterministic Playwright browser suite locally
- `bun run test:e2e:ci`: Run the Playwright suite with CI retries and diagnostics
- `bun run test:db`: Verify migrations and database behavior in disposable PostgreSQL
- `bun run quality:ci`: Run aggregate quality, bundle-build, and coverage checks
- `bun run quality:bundle`: Build the web app and enforce its production asset budget
- `bun run quality:policy`: Verify the quality workflow and command contracts
- `bun run db:push`: Push schema changes to the database
- `bun run db:generate`: Generate database client and types
- `bun run db:migrate`: Run database migrations
- `bun run db:studio`: Open the database studio UI
- `bun run check`: Run the read-only configured Biome checks
- `bun run check:fix`: Apply Biome formatting, lint, and assist fixes
- `bun run secrets:check`: Scan repository history for secrets
- `bun run maintenance:test`: Exercise dependency and secret policy safe, violation, and tool-error fixtures
- `bun run security:trivy:config`: Scan deployable configuration with Trivy
- `bun run security:trivy:dependencies`: Scan Bun and Cargo lockfiles with Trivy
- `bun run check:semgrep`: Run blocking security-focused Semgrep rules
- `bun run report:semgrep`: Report non-blocking security-focused Semgrep rules
- `scripts/trivy-scan.sh config`: Scan Docker and deployment configuration with Trivy
- `scripts/trivy-scan.sh dependencies`: Scan Bun and Cargo lockfiles with Trivy
- `cd apps/web && bun run generate-pwa-assets`: Generate PWA assets
- `cd apps/web && bun run desktop:dev`: Start the Tauri desktop app in development
- `cd apps/web && bun run desktop:build`: Build the Tauri desktop app
- `cd apps/docs && bun run dev`: Start the documentation site
- `cd apps/docs && bun run build`: Build the documentation site
- `bun run docker:build`: Build the Docker Compose images
- `bun run docker:up`: Build and start the Docker Compose stack
- `bun run docker:logs`: Follow logs from the Docker Compose stack
- `bun run docker:down`: Stop the Docker Compose stack

## Planning

The canonical planning artifact lives in this repository's GitHub Issues as a
Wayfinder map. Earlier [Ariadne](https://github.com/CUexter/ariadne) discussions
are prior evidence, not inherited decisions.
