# Behavior Tests And Coverage

Issue #100 establishes the repository-wide Bun behavior-test command:

```bash
bun run test
bun run test:coverage
```

Tests run in isolated Bun workers and exercise public application seams. The
initial regression slice calls the exported Hono app through `app.fetch`, using
the real tRPC adapter for both a successful health check and an unauthorized
protected procedure. Tests use synthetic environment values and do not require
Vault content or a running database.

Coverage includes JavaScript and TypeScript source under `apps/*/src` and
`packages/*/src`. Test files, generated files, fixtures, and configuration are
excluded by `scripts/check-coverage.mjs`. The initial LCOV baseline is 196 of
208 lines and 15 of 24 functions. Source absent from LCOV is accepted only when
its exact content hash is recorded in `config/coverage-baseline.json`; new or
changed absent source fails. Run `bun run coverage:baseline` only to explicitly
review and accept a legacy exception. `bun run test:coverage` also fails if
either coverage ratio decreases.

`bun run quality:ci` runs the coverage command after Biome check mode and the
configured quality checks. It writes coverage and bundle-build artifacts, and
the Quality workflow enforces the ratchet.
