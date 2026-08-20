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
primitives under `packages/ui/src/components/` are excluded from LCOV because
they are vendored and well-tested upstream; project-authored code under
`packages/ui/src/lib/` and `apps/web/src/` remains eligible. Browser E2E
flows run in the Playwright quality job in addition to the Bun LCOV layer: the
required aggregate `quality` job requires both the Bun/LCOV and browser-E2E
jobs to pass. Test files, generated files, fixtures, configuration, and shadcn
primitives are excluded by `scripts/check-coverage.mjs`. Source absent from
LCOV is accepted only when its exact content hash is recorded in
`config/coverage-baseline.json`; new or changed non-excluded source fails. Run
`bun run coverage:baseline` only to explicitly review and accept a legacy
exception. After a focused coverage batch, run `bun run coverage:promote` to
remove only legacy exclusions now present in LCOV; it preserves the aggregate
floors and validates every unrelated absent source before writing. `bun run
test:coverage` also fails if either coverage ratio decreases.

`bun run quality:ci` runs the coverage command after Biome check mode and the
configured quality checks. It writes coverage and bundle-build artifacts, and
the Quality workflow enforces the ratchet.
