# Code quality standard and automation report

Status: current repository state as of 2026-08-17.

This document defines the quality expected of Lirna code and records which parts
of that standard the repository currently enforces. A rule is called automated
only when an active pre-commit hook or GitHub Actions workflow runs it. A command
that a developer may run is listed as manual until automation invokes it.

Pre-commit hooks can be bypassed. GitHub workflow success is a merge requirement
only when repository branch protection requires the corresponding check; that
setting is outside this repository.

## Standard

Every change must be correct for its stated behavior, preserve Lirna's domain
language, and leave the code easier to understand or no harder to understand.
Passing an automated check is necessary where one exists, but it is not evidence
that the change is correct, secure, accessible, or well designed.

### Correctness and tests

- Behavior must match the issue, acceptance criteria, or documented decision.
- Tests must exercise behavior through the same public seam used by callers.
- A bug fix must include a regression test when a stable test seam exists.
- Tests must cover important success, failure, authorization, and boundary cases.
- Tests must be deterministic and must not depend on personal Vault content.
- Type errors, build errors, and failing tests are release blockers.

### Readability and maintainability

- Names must describe intent in the vocabulary defined by `CONTEXT.md`.
- Modules should expose a small interface and hide substantial cohesive behavior.
  Do not split code into pass-through files merely to satisfy a line limit.
- Keep control flow direct. Extract policy or domain behavior when doing so gives
  it an honest name and a stable seam, not solely to lower a metric.
- Avoid new duplication. When duplication is intentional, the review must state
  what coupling would make a shared abstraction worse.
- Public interfaces must be smaller than the behavior they hide. React component
  APIs should prefer composition over a growing set of unrelated props.
- Comments should explain constraints, decisions, or non-obvious reasoning rather
  than restating the code.

### Architecture and domain integrity

- Workspace packages must not bypass their public exports or create dependency
  cycles.
- Browser code must not import server-only implementation, credentials, or
  privileged environment values.
- Domain terms must follow `CONTEXT.md`. A new durable domain concept or changed
  lifecycle requires updating `CONTEXT.md` or recording an ADR.
- Changes must not copy private Vault notes, journals, source documents, or other
  personal material into the repository.
- Persisted data, public APIs, authentication behavior, and deployment contracts
  require explicit migration and compatibility reasoning.

### Security, privacy, and dependencies

- Validate untrusted input at trust boundaries and authorize every protected
  operation on the server.
- Do not log secrets, credentials, private content, or unnecessary personal data.
- Use parameterized database operations, safe process invocation, contained file
  paths, secure cryptography, and escaped rendering.
- Apply the Source handling policy and Sensitivity level from `CONTEXT.md` before
  content leaves Nathan-controlled infrastructure.
- New dependencies require a concrete capability need, review of maintenance and
  provenance, an exact lockfile result, and consideration of a smaller existing
  dependency or local implementation.
- Security scanner suppressions must be narrow, adjacent to the finding when the
  tool supports it, and explain why the data flow is safe.

### Frontend quality

- Interactive behavior must work with keyboard input and expose correct semantic
  roles, names, labels, focus behavior, and error feedback.
- Changed user flows must be checked at desktop and mobile widths.
- Loading, empty, error, offline, and retry states must be considered where the
  flow can encounter them.
- Performance-sensitive changes must avoid unnecessary network waterfalls,
  unbounded rendering, and avoidable client bundle growth.

### Review and documentation

- Review must consider behavior, failure modes, data ownership, security,
  accessibility, operability, and whether tests prove the intended contract.
- Operational, architectural, or domain decisions that future work must preserve
  belong in `docs/`, `docs/adr/`, or `CONTEXT.md`, not only in commit messages.
- Generated files and scanner fixtures must be clearly scoped so they do not
  weaken checks for first-party source.

## Automation report

### Automated before commit

The active hook is `.husky/pre-commit`.

| Concern | Enforcement | Scope and threshold |
| --- | --- | --- |
| Staged secrets | `bun run secrets:staged` | Gitleaks scans the staged diff. `.gitleaksignore` supplies allowed fingerprints. |
| Formatting | lint-staged runs `biome format --write` | Staged JavaScript, TypeScript, JSX, TSX, JSON, and JSONC files; two-space indentation and double-quoted JavaScript. |
| Cognitive complexity | `bun run quality` | `apps/` and `packages/`; maximum 15 per function. |
| Function parameters | `bun run quality` | `apps/` and `packages/`; maximum 4. |
| File size | `bun run quality` | `apps/` and `packages/`; maximum 300 non-blank lines. |
| React component props | `bun run quality:props` | TSX under `apps/` and `packages/`; maximum 8 statically countable explicit props. |
| Duplication growth | `bun run quality:duplication` | TypeScript and TSX under `apps/` and `packages/`; jscpd may not exceed the current 292 duplicated-line baseline. |

These checks do not run the build, TypeScript compiler, full Biome rule set,
Semgrep, Trivy, unit tests, integration tests, or E2E tests.

### Automated in GitHub Actions

All current workflows run on pushes and pull requests. Trivy also runs weekly.

The `Quality` workflow exposes one stable aggregate job named `quality` (check
name: `Quality / quality`). The
aggregate waits for dependency installation, static checks, workspace type
checks, and production builds, and is the required status to configure for the
main branch. The implementation jobs may run in parallel without changing the
required status name.

| Workflow | Blocking behavior | Scope |
| --- | --- | --- |
| Gitleaks | Fails on detected secrets | Full fetched Git history through the repository-owned `.gitleaks.toml`; local staged and outgoing-range scans use the same configuration. |
| Dependency assessment verification | Fails when a changed direct dependency lacks a committed decision matching `package.json` and `bun.lock` | `bun run dependency:check` in the active Husky pre-commit hook and `bun run maintenance:test` in Quality CI; human review owns necessity, provenance, and license decisions. |
| Semgrep blocking scan | Fails on findings or scanner errors | Repository-owned command injection, SQL injection, unsafe process spawn, path traversal, insecure cryptography, and XSS rules for JavaScript and TypeScript. |
| Semgrep reporting scan | Reports findings but does not fail for a finding | Dynamic code execution and disabled TLS verification. Scanner or configuration errors still fail. |
| Semgrep policy test | Fails when expected fixture findings, safe behavior, or workflow wiring regress | Local Semgrep rules and fixtures. |
| Trivy configuration scan | Fails on high or critical findings | Deployable configuration, excluding `node_modules`, prototypes, and legacy code. |
| Trivy dependency scan | Fails on fixed high or critical vulnerabilities | Bun and Cargo lockfile dependencies, including development dependencies; unfixed vulnerabilities are ignored. |
| Trivy image scan | Fails on fixed high or critical vulnerabilities | Freshly built server and web images; both OS and library packages. |
| Trivy policy test | Fails when thresholds, exclusions, scanner failure propagation, pinning, or workflow wiring regress | Trivy wrapper and workflow policy. |
| Quality gate policy test | Fails when the read-only commands, frozen install, or aggregate workflow wiring regress | `scripts/test-quality-gate.sh` in the `Quality` workflow. |
| General quality gate | Fails on formatting/linting, configured complexity/size/props/duplication checks, workspace type errors, or production build errors | `.github/workflows/quality.yml`; aggregate status: `Quality / quality`. |

The Quality workflow does not run tests, Nix flake checks, or migrations. Trivy owns
dependency vulnerability scanning; dependency assessment verification only
checks that direct dependency changes have matching committed evidence, avoiding
duplicate vulnerability responsibility.

### Available but manual

| Command or configuration | What it provides | Current status |
| --- | --- | --- |
| `bun run check-types` | Workspace TypeScript checks; the web task also builds the frontend | Automated in the Quality workflow; available locally. Only workspaces declaring `check-types` participate directly. |
| `bun run build` | Builds workspaces that declare a build task | Automated in the Quality workflow; available locally. |
| `bun run check` | Runs the full configured Biome formatter, linter, and assist checks without modifying files | Automated in the Quality workflow; read-only locally. |
| `bun run check:fix` | Applies configured Biome formatting, lint, and assist fixes | Manual and mutating. |
| `bun run quality:ci` | Runs read-only Biome checks and the existing complexity, parameter-count, file-size, React-prop, and duplication checks | Automated in the Quality workflow. |
| `bun run lint` | Runs Vite+'s workspace lint task | Available locally; not run by a hook or CI. |
| `bun run check:semgrep` | Runs the blocking Semgrep rules | Automated in CI, but optional locally and absent from pre-commit. |
| `bun run report:semgrep` | Runs non-blocking Semgrep rules | Automated in CI, but optional locally and absent from pre-commit. |
| `Nix flake checks` | Builds/evaluates the server package, desktop package, NixOS module closure, and NixOS VM integration test | `.github/workflows/nix.yml` runs `nix flake check --print-build-logs` on relevant pull requests and pushes with pinned Nix installation and cache actions. |
| `playwright.config.ts` | Starts the deterministic API substitute and web app, then runs Firefox desktop/mobile shell and API-status journeys with serious/critical axe assertions; CI retains traces, screenshots, and HTML reports | Automated in the `Quality` workflow through `bun run test:e2e:ci`. Browser automation proves the encoded journey and automated accessibility rules only; keyboard exploration, visual design, screen-reader behavior, and other human interaction review remain manual. |

## Not automated

The following standards require human review today:

- behavioral correctness and completeness against the originating requirement;
- test adequacy, including negative cases and regression strength;
- domain language, lifecycle consistency, and ADR requirements;
- module depth, cohesion, interface quality, and abstraction judgment;
- package boundary integrity and dependency-cycle prevention;
- authorization design, privacy classification, data minimization, and threat
  modeling beyond the narrow scanner rules;
- accessibility, responsive behavior, visual quality, and complete UI states;
- runtime performance, bundle budgets, database query behavior, concurrency,
  transaction boundaries, and operational failure handling;
- API compatibility, persisted-data migrations, rollback safety, and deployment
  readiness;
- dependency necessity, maintainer trust, provenance, and license suitability;
- documentation accuracy.

## Known enforcement gaps

These are current repository gaps, not approved exceptions to the standard.

1. The general CI quality workflow does not run tests, Nix flake checks,
   migrations, or dependency-assessment verification.
2. There are no unit or integration test files under `apps/` or `packages/`, no
   test or coverage command in the root manifest, and no coverage threshold.
3. The Playwright smoke test is incomplete as repository automation: the
   documented `bun run test:e2e` command is absent, `@playwright/test` is absent
   from `package.json`, and no workflow runs it.
4. `docs/module-standards.md` says `npm run check:architecture` is required, but
   the root manifest has no such script. `scripts/check-architecture.mjs` still
   targets the removed `client/src`, `server`, and `shared` layout, so it does not
   enforce the current `apps/` and `packages/` architecture.
5. `scripts/check-ui-primitives.mjs` also targets the removed `client/src`
   layout and is not wired to a hook, package command, or workflow.
6. The Nix workflow intentionally runs only for changes that can affect the
   server package, desktop package, NixOS module, or VM integration test. It is
   separate from the fast quality and security workflows.
7. Dependency-assessment and older secret-scanning scripts reference npm
   `package-lock.json`, `.githooks`, `config/gitleaks.toml`, or a removed
   `checks.yml` workflow. They are not active in the current Bun/Husky setup.
8. Pre-commit quality checks run across `apps/` and `packages/`, but local hooks
   can be bypassed and CI does not repeat them.
9. No automated check verifies accessibility, workspace dependency direction,
    public API compatibility, migration safety, documentation freshness, or
    performance budgets.

## Required verification until gaps close

The author of a change is responsible for selecting checks proportional to the
change. At minimum, application changes should run:

```bash
bun run check-types
bun run quality
```

Also run the relevant build, security scan, and test suite when the change can
affect those concerns. Because no complete automated test command currently
exists, the change description must state what behavior was exercised manually
and which checks could not be run.

The reviewer must not infer coverage from a green security workflow. Review the
manual standards above and treat each known enforcement gap as an explicit
review responsibility.
