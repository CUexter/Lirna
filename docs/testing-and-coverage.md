# Behavior Tests And Coverage

Issue #100 establishes the repository-wide Bun behavior-test commands:

```bash
bun test
bun run test:coverage
```

Tests run in isolated Bun workers and exercise public application seams. The
initial regression slice calls the exported Hono app through `app.fetch`, using
the real tRPC adapter for both a successful health check and an unauthorized
protected procedure. Tests use synthetic environment values and do not require
Vault content or a running database.

Frontend unit tests run under the same Bun runner with `happy-dom` registered
globally via the `happydom.ts` preload and `@testing-library/react` for render
assertions. `--preload ./happydom.ts` is attached to `bun test`, `bun run
test:coverage`, and `bun run test:web`; the preload registers DOM globals,
restores the native `fetch` family (happy-dom's fetch breaks backend tests that
stub `fetch` against a localhost server), and stubs `ResizeObserver`,
`IntersectionObserver`, and `matchMedia`. `bun run test:web` targets
`apps/web` and `packages/ui` for a fast browser-test loop. Co-located
`.test.ts`/`.test.tsx` files beside their source are the convention.

Bun LCOV covers JavaScript and TypeScript source under `apps/*/src` and
`packages/*/src`, including browser modules under `apps/web/src`. shadcn
primitives under `packages/ui/src/components/` are LCOV-eligible, but remain
reviewed hash-pinned exceptions in `config/coverage-baseline.json`; an edit
still fails the ratchet until the primitive gains coverage or its reviewed hash
is explicitly updated. Project-authored code under `packages/ui/src/lib/` and
`apps/web/src/` remains subject to ordinary promotion. Browser E2E flows run in
the Playwright quality job in addition to the Bun LCOV layer: the required
aggregate `quality` job requires both the Bun/LCOV and browser-E2E jobs to pass.
Test files, generated files, fixtures, and configuration are excluded by
`scripts/check-coverage.mjs`; generated route source therefore remains outside
the absent inventory through the existing `.gen.` rule. The reviewed baseline
currently contains exactly 26 absent-source entries: 22 shadcn primitives, the
type-only API client export, application bootstrap, root-router composition, and
the documentation application configuration entry. New or changed non-excluded
source fails unless its exact content hash is explicitly reviewed in the
baseline. Run `bun run coverage:baseline` only to accept a deliberate legacy
exception. `bun run coverage:promote` preserves aggregate floors, leaves shadcn
exceptions in place, and validates unrelated absent sources before writing. To
promote an explicit set without accepting unrelated stale exclusions, run
`node scripts/check-coverage.mjs --promote-covered-source=<source>` once per
source. Scoped promotion preserves aggregate floors and rejects each requested
source unless it is both baselined and present in LCOV. `bun run test:coverage`
also fails if either coverage ratio decreases.

`bun run quality:ci` runs the coverage command after Biome check mode and the
configured quality checks. It writes coverage and bundle-build artifacts, and
the Quality workflow enforces the ratchet.

## Mutation Testing

Mutation testing checks whether tests detect small behavioral changes, rather
than only whether they execute a line. Lirna uses the official Stryker core as
a Node-hosted mutation orchestrator and Stryker's command runner to execute the
canonical Bun tests. Node does not provide a second application runtime or a
parallel test suite: Bun remains the authority that kills or preserves every
mutant.

Run both current campaigns with:

```bash
bun run test:mutation
```

Run one focused campaign while developing with:

```bash
bun run test:mutation:dependency-score
bun run test:mutation:sep-url
```

The campaigns are intentionally explicit:

| Campaign | Mutated source | Bun test command |
| --- | --- | --- |
| Dependency scoring | `scripts/dependency-score-policy.mjs` | `bun test --isolate scripts/dependency-score.test.mjs` |
| SEP URL policy | `packages/api/src/sep-admission/sep-url.ts` | `bun test --isolate packages/api/src/sep-admission/sep-capture.test.ts` |

The initial setup run on 2026-08-20 established diagnostic observations, not
enforced baselines:

| Campaign | Mutants | Killed | Survived | Score | Runtime |
| --- | ---: | ---: | ---: | ---: | ---: |
| Dependency scoring | 234 | 168 | 66 | 71.79% | 3 seconds |
| SEP URL policy | 156 | 70 | 86 | 44.87% | 3 seconds |

The SEP result in particular identifies missing assertions around resource URL
scope, unsafe paths, normalized identities, and archive recommendations. A low
initial score is useful evidence for the next test-strengthening work; it is not
a reason to lower mutation coverage or change runtime architecture.

The command runner cannot supply Stryker's per-test coverage analysis, so each
configuration sets `coverageAnalysis` to `off`. Every mutant therefore runs its
whole focused test command. Keep campaigns narrow and deterministic instead of
pointing Stryker at the repository-wide test suite.

Mutation testing is currently manual and non-blocking. It is not part of `bun
run quality:ci`, and the repository has no aggregate mutation-score threshold.
Review surviving mutants individually: add a canonical Bun assertion when a
survivor exposes missing behavior, and document equivalent or low-value
mutations during review rather than weakening product code to raise a score.

The goal is to expand mutation testing only across deterministic, high-risk
policy and domain modules where survivor review remains fast and actionable.
Once several campaigns have stable runtimes and reviewed outcomes, introduce
target-specific baselines or scheduled runs. Do not introduce a repository-wide
score, switch canonical tests to Node, or adopt an unofficial Bun runner merely
to optimize mutation throughput. Native runner integration can be reconsidered
when official support or measured command-runner cost changes the tradeoff.
