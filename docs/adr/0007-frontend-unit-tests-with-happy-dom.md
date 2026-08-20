# Frontend unit tests with happy-dom

Lirna runs frontend unit tests under the same native Bun runner as backend tests, with `happy-dom` registered globally through a root `happydom.ts` preload and `@testing-library/react` for render assertions. `--preload ./happydom.ts` is attached to `bun test`, `bun run test:coverage`, and `bun run test:web` so DOM globals are present whenever browser tests run, while `bun run test:web` scopes a fast loop to `apps/web` and `packages/ui`. The preload captures the native `fetch` family before `@happy-dom/global-registrator` overwrites it and restores them after registration, because happy-dom's fetch routes through its own `Window` and breaks backend tests that stub `fetch` against a localhost server. It also stubs `ResizeObserver`, `IntersectionObserver`, and `matchMedia` for layout- and media-query-dependent components.

## Status

accepted

## Considered Options

- **Vitest with happy-dom** — rejected: Bun transpiles JSX/TSX natively and ships its own test runner; adding Vitest would duplicate the runner and the build pipeline for no gain.
- **Global `bunfig.toml [test] preload`** — rejected: scoping `--preload` to the scripts that include browser tests keeps the preload explicit and avoids surprising backend-only invocations.
- **Per-file `/// <reference lib="dom" />` pragmas** — rejected: adding `DOM` and `DOM.Iterable` to `packages/config/tsconfig.base.json` `lib` gives every workspace DOM types uniformly.
- **Exclude all of `apps/web/src` from LCOV (prior policy)** — rejected: it left web source outside the ratchet and relied on Playwright E2E alone for browser coverage authority.
- **Treat shadcn primitives as ordinary first-party LCOV sources** — refined: `packages/ui/src/components/**` is LCOV-eligible, but each reviewed primitive remains a hash-pinned exception because it is vendored from shadcn and well-tested upstream. An edit still requires coverage or an explicit reviewed hash update.

## Consequences

- `apps/web/src` is LCOV-eligible. Uncovered web source is recorded in the live reviewed `config/coverage-baseline.json` with a content hash; any edit to such source fails the gate until it gains coverage or the baseline is re-accepted, enforcing forward progress on web unit-test coverage.
- The reviewed absent inventory contains exactly 26 entries: 22 shadcn primitives, the type-only API client export, application bootstrap, root-router composition, and documentation application configuration. Generated route source remains excluded by the existing generated-file rule.
- `packages/env/src/server.ts` declares `isServer: true` explicitly so `@t3-oss/env-core` does not infer server-vs-client from `typeof window`, which is unreliable under a global happy-dom registration (and under Deno, which keeps `window`). This is semantically correct for a server package and lets server tests coexist with the happy-dom preload.
- Browser E2E flows still run in the Playwright quality job. Bun behavior tests and Playwright journeys are complementary: Bun owns focused behavior and LCOV, while Playwright owns browser integration, responsive behavior, accessibility automation, bootstrap, root-router composition, and complete journeys.
