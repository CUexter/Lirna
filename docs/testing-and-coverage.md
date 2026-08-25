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
reviewed hash-pinned exceptions in the
[live coverage baseline](../config/coverage-baseline.json); an edit
still fails the ratchet until the primitive gains coverage or its reviewed hash
is explicitly updated. Project-authored code under `packages/ui/src/lib/` and
`apps/web/src/` remains subject to ordinary promotion. Browser E2E flows run in
the Playwright quality job in addition to the Bun LCOV layer: the required
aggregate `quality` job requires both the Bun/LCOV and browser-E2E jobs to pass.
Test files, generated files, fixtures, and files inside configuration directories
are excluded by `scripts/check-coverage.ts`; a source file whose name contains
`config` is still eligible unless another exclusion applies. Generated route
source therefore remains outside the absent inventory through the existing
`.gen.` rule. The reviewed baseline currently contains exactly 26 absent-source
entries: 22 shadcn primitives, the type-only API client export, application
bootstrap, root-router composition, and the documentation application
configuration entry. New or changed non-excluded source fails unless its exact
content hash is explicitly reviewed in the baseline. Run `bun run
coverage:baseline` only to accept a deliberate legacy exception. `bun run
coverage:promote` preserves aggregate floors, leaves shadcn exceptions in place,
and validates unrelated absent sources before writing. To promote an explicit
set without accepting unrelated stale exclusions, run `node
scripts/check-coverage.ts --promote-covered-source=<source>` once per source.
Scoped promotion preserves aggregate floors, rejects ineligible or uncovered
requests, and treats an already-promoted covered source as an idempotent no-op.
`bun run test:coverage` also fails if either coverage ratio decreases.

`bun run quality:ci` runs the coverage command after Biome check mode and the
configured quality checks. It writes coverage and bundle-build artifacts, and
the Quality workflow enforces the ratchet.

## Mutation Testing

Mutation testing checks whether tests detect small behavioral changes, rather
than only whether they execute a line. Lirna uses the official Stryker core as
a Node-hosted mutation orchestrator and the unofficial Bun runner to execute the
canonical Bun tests. Node does not provide a second application runtime or a
parallel test suite: Bun remains the authority that kills or preserves every
mutant.

Run application mutation testing with:

```bash
bun run test:mutation
```

The application campaign mutates production TypeScript in every workspace:

| Campaign | Mutated source | Bun test scope |
| --- | --- | --- |
| Application | `apps/*/src` and `packages/*/src` production modules | Explicit `*.test` and `*.spec` files under `apps/` and `packages/` |

Test files, fixtures, test support, and generated files are excluded from the
mutation set. Repository tooling under `scripts/` is not mutation-tested.

The unofficial `@hughescr/stryker-bun-runner` supplies per-test coverage, so a
mutant normally reruns only the Bun tests that covered it. Each shard has an
explicit, related test-file list, which excludes `scripts/` tests and prevents
the runner's eager source imports from sharing unrelated UI test state. The
annotation shard disables coverage analysis because its asynchronous DOM tests
are incompatible with eager source imports; it reruns its focused tests for every
mutant instead. A local Bun patch prevents the runner from performing those
unnecessary imports when coverage analysis is off. The application source is
split into eight non-overlapping shards. `bun run test:mutation` runs those
shards in parallel locally; each `test:mutation:<shard>` script runs one shard
directly.

The Quality workflow uses the same shard names as a job matrix. Each shard has
its own report and temporary directory, allowing GitHub Actions runners to
execute them concurrently without artifact collisions.

Successful mutation execution is required by the Quality workflow; runner
errors and failing initial tests fail the job. There is no repository-wide score
threshold until all eight shards have reviewed baselines. Surviving mutants should
be reviewed individually and covered with canonical Bun assertions rather than
addressed by weakening product code.
