# Bun 1.4 and whether Lirna still needs Vite

Research date: 2026-08-21

## Headline conclusion

**Keep Vite. Evaluate Bun 1.4 as a separate runtime and package-manager
upgrade, not as a reason to migrate Lirna's web build.** Bun can now serve and
build a basic React SPA from an HTML entry point, but those frontend capabilities
are not the headline change in Bun 1.4 and do not provide compatibility with
Lirna's Vite plugins. Today, replacing Vite would mean replacing or redesigning
TanStack Router generation and automatic code splitting, React Fast Refresh,
PWA/Workbox generation, Tailwind integration, and the `import.meta.env` contract.

A bounded Bun frontend spike could become worthwhile after Bun or TanStack
Router supplies a supported integration and there is a credible PWA-generation
path. Until then, migration cost and offline-regression risk outweigh an
unmeasured improvement in Lirna's development or production build.

This is a research recommendation, not an accepted architecture decision.

## What Lirna actually uses

- The root is a Bun workspace monorepo over `apps/*` and `packages/*`; Bun runs
  workspace scripts, installs dependencies, executes unit tests, and runs the
  Hono server in development. There is no Turbo or Nx task layer
  ([root package](../package.json), [server package](../apps/server/package.json),
  [Bun test config](../bunfig.toml)). The repository and CI are pinned to Bun
  1.3.13 through `packageManager`, and the locally installed version is 1.3.13
  ([root package](../package.json),
  [quality workflow](../.github/workflows/quality.yml)).
- `apps/web` is a React 19 **client-rendered SPA** using TanStack Router and
  TanStack Query. Its HTML entry starts `src/main.tsx`; Vite serves, builds, and
  previews it ([web package](../apps/web/package.json),
  [HTML entry](../apps/web/index.html), [React entry](../apps/web/src/main.tsx)).
  The accepted client architecture explicitly requires one static,
  offline-precached PWA bundle shared by browsers and a narrow Tauri host, with
  no SSR ([ADR 0001](adr/0001-pwa-first-web-core-narrow-desktop-tauri-host.md)).
- Vite's configured responsibilities are broader than transpilation:
  `@vitejs/plugin-react`, `@tanstack/router-plugin/vite` with automatic route
  code splitting, `@tailwindcss/vite`, `vite-plugin-pwa`, TypeScript path
  resolution, and the development port used by Tauri
  ([Vite config](../apps/web/vite.config.ts),
  [Tauri config](../apps/web/src-tauri/tauri.conf.json)). The lockfile currently
  resolves Vite 8.2.1 even though the package range begins at 8.1.5
  ([web package](../apps/web/package.json), [lockfile](../bun.lock)).
- The PWA plugin currently emits the manifest, registration script, service
  worker, and Workbox runtime visible in `apps/web/dist`. This is architectural,
  not decorative: the plugin's official documentation defines those three
  generated responsibilities, including development-mode support
  ([Vite PWA guide](https://vite-pwa-org.netlify.app/guide/),
  [Vite config](../apps/web/vite.config.ts)).
- Production is still a static build copied into nginx with a deep-link SPA
  fallback; Tauri consumes the same `dist` directory
  ([web Dockerfile](../apps/web/Dockerfile),
  [nginx config](../apps/web/nginx.conf),
  [Tauri config](../apps/web/src-tauri/tauri.conf.json)). This makes Bun's static
  HTML build conceptually compatible with the deployment shape; no Bun server or
  SSR migration is needed or desirable.
- Web configuration is Vite-specific: `@lirna/env/web` validates
  `import.meta.env.VITE_SERVER_URL`, the Docker build supplies that variable, and
  TypeScript includes `vite/client` types
  ([web environment](../packages/env/src/web.ts),
  [server URL](../apps/web/src/utils/server-url.ts),
  [Dockerfile](../apps/web/Dockerfile), [tsconfig](../apps/web/tsconfig.json)).
- Tests do not depend on Vitest or Vite. Unit/component tests use `bun test` with
  Happy DOM, browser E2E tests use Playwright, and the production Vite output is
  checked against a repository bundle budget
  ([root scripts](../package.json), [bundle check](../scripts/check-web-bundle.mjs)).
  Replacing the web bundler would therefore change build validation, not the
  primary test runner.
- `apps/docs` is a separate Astro/Starlight workspace, so removing direct Vite
  use from `apps/web` would not collapse all frontend tooling into `bun build`
  ([docs package](../apps/docs/package.json)).

## What Bun 1.4 changes for Lirna

The [Bun 1.4 announcement](https://bun.com/blog/bun-v1.4) says the post covers
everything shipped since Bun 1.3.0, and marks the version in which individual
features appeared. Its main Lirna-relevant changes are runtime compatibility and
resource improvements, Playwright and Vitest runtime compatibility, parallel
script/test execution, an opt-in global virtual package store, and bundle-analysis
output from `bun build`. It does **not** announce a new Vite compatibility layer
or claim that Vite plugins run on Bun's bundler.

### Runtime and package manager: useful, independent upgrade

- Better Node compatibility and lower runtime resource use could benefit Lirna's
  Bun-hosted API and development processes. The release's Vite measurement is
  especially important to interpret correctly: running the Vite dev server on
  Bun 1.4 used 13% less peak memory than on Bun 1.3 in Bun's test, but Node 26
  still used less than Bun 1.4 (214 MB versus 233 MB). That supports testing a
  runtime upgrade; it is not evidence for removing Vite. These are Bun-authored
  benchmarks, not measurements of Lirna
  ([Bun 1.4, Production](https://bun.com/blog/bun-v1.4#production)).
- Bun's parallel script runner can fan scripts out across workspaces with prefixed output,
  but Lirna already uses Bun workspace filtering and parallel development. The
  release marks this feature as introduced in 1.3.9, so it is already within
  Lirna's pinned 1.3.13 line; 1.4 does not require a task-runner migration
  ([Bun 1.4, parallel scripts](https://bun.com/blog/bun-v1.4#bun-run-parallel),
  [root scripts](../package.json)).
- `bun test --parallel` is an optional test-runner change, not a frontend build
  change. Lirna currently relies on `--isolate` and has database, filesystem, and
  generated-artifact tests, so parallel mode should only be enabled after proving
  isolation and comparing stability; it is not an automatic upgrade win
  ([Bun 1.4](https://bun.com/blog/bun-v1.4), [root scripts](../package.json)).
- Bun 1.4's global virtual store is off by default, requires the isolated linker,
  and changes `node_modules` into a symlink-heavy layout. Bun's roughly 7x claim
  is for a warm install of a 1,400-package fixture on Apple Silicon with a warm
  cache and deleted `node_modules`, not a universal or Lirna-specific result.
  Tools that do not follow symlinks and phantom dependencies are documented
  compatibility risks. Trial this separately from both the runtime upgrade and
  any Vite work
  ([global-store docs](https://bun.com/docs/pm/global-store),
  [isolated-install docs](https://bun.com/docs/pm/isolated-installs)).
- `bun build --metafile-md` could complement Lirna's bundle budget during a
  future experiment by explaining module contribution and dependency chains. It
  does not reproduce the current build or plugin pipeline by itself
  ([Bun 1.4, Observability](https://bun.com/blog/bun-v1.4#observability),
  [bundle check](../scripts/check-web-bundle.mjs)).

### Bundler and dev server: capable baseline, different product

Bun's official HTML tooling can serve one HTML file as an SPA fallback, transpile
TypeScript/JSX, read `tsconfig.json` paths, bundle and hash JavaScript/CSS/assets,
and emit a static production directory. Those capabilities cover the base layer
of Lirna's Vite setup
([Bun HTML/static docs](https://bun.com/docs/bundler/html-static)). They are not
specific to 1.4: the same official page's examples identify Bun 1.3.3.

Bun also provides HMR modeled after Vite's `import.meta.hot`, but Bun documents
the API as a work in progress: `invalidate()` and `send()` are missing and
`prune()` is not called. Without React Fast Refresh or a plugin providing an HMR
boundary, changes cause a full-page reload
([Bun HMR docs](https://bun.com/docs/bundler/hot-reloading)). Vite, by contrast,
ships its React Fast Refresh integration through the official React plugin that
Lirna already uses
([Vite features](https://vite.dev/guide/features#hot-module-replacement)).

Most importantly, Bun plugins and Vite plugins are different APIs. Bun exposes
`onStart`, `onResolve`, `onLoad`, `onBeforeParse`, and `onEnd`; Vite extends the
Rolldown plugin interface and adds Vite-specific hooks such as
`configureServer`, `transformIndexHtml`, and `handleHotUpdate`
([Bun plugin API](https://bun.com/docs/bundler/plugins),
[Vite plugin API](https://vite.dev/guide/api-plugin)). A package being called a
"plugin" therefore does not imply portability between the two bundlers.

## Responsibility-by-responsibility feasibility

| Current Vite responsibility | Bun status | Lirna migration consequence |
|---|---|---|
| HTML entry, SPA fallback, TS/TSX, CSS, hashed assets, static output | Supported by Bun's HTML dev server and `bun build` ([Bun HTML/static docs](https://bun.com/docs/bundler/html-static)). | Feasible. Keep nginx and Tauri's static `dist` contract, then revalidate paths, deep links, caching, and output budgets. |
| TypeScript paths | Bun says its HTML tooling reads `tsconfig.json` paths ([Bun HTML/static docs](https://bun.com/docs/bundler/html-static)). | Likely direct replacement for `resolve.tsconfigPaths`; still test workspace source imports and aliases. |
| React development refresh | Bun has generic, incomplete HMR; Vite has first-party React Fast Refresh ([Bun HMR docs](https://bun.com/docs/bundler/hot-reloading), [Vite features](https://vite.dev/guide/features#hot-module-replacement)). | No documented drop-in equivalent for `@vitejs/plugin-react`; expect full reloads or new integration work. |
| TanStack file-route generation and `autoCodeSplitting` | TanStack officially lists Vite, Rspack/Rsbuild, Webpack, and esbuild as supported bundlers, not Bun. It says automatic code splitting is available only through a supported bundler plugin and not through the CLI alone ([file-based routing](https://tanstack.com/router/latest/docs/routing/file-based-routing), [code splitting](https://tanstack.com/router/latest/docs/guide/code-splitting)). | **Primary blocker.** CLI route generation could preserve file routes, but not the current automatic splitting behavior. A custom Bun integration or routing/code-splitting redesign would be real application work. |
| Tailwind 4 | Bun documents `bun-plugin-tailwind`, while Lirna uses `@tailwindcss/vite` ([Bun HTML/static docs](https://bun.com/docs/bundler/html-static#tailwind-css), [Vite config](../apps/web/vite.config.ts)). | Feasible but not drop-in. Change plugin/configuration and compare generated CSS, scanning of workspace UI sources, HMR, and minification. |
| PWA manifest, asset metadata, service-worker registration, Workbox precache, dev PWA | Bun's HTML docs cover ordinary assets but document no PWA/service-worker generator; `vite-plugin-pwa` explicitly supplies all of these ([Bun HTML/static docs](https://bun.com/docs/bundler/html-static), [Vite PWA guide](https://vite-pwa-org.netlify.app/guide/)). | **Primary blocker and highest product risk.** Replace with explicit Workbox/manifest scripts or another Bun-compatible tool, then prove installation, updates, offline startup, and precache completeness. |
| Client environment variables | Vite injects prefixed variables through `import.meta.env`; Bun's frontend configuration replaces literal `process.env.*` only and explicitly does not support `import.meta.env` ([Vite env docs](https://vite.dev/guide/env-and-mode), [Bun HTML/static docs](https://bun.com/docs/bundler/html-static#inline-environment-variables)). | Rename or translate the public-variable contract, update `@lirna/env/web`, TypeScript types, CI/Docker arguments, and secret-exposure controls. |
| Production chunking and preload behavior | Both build production bundles, but Vite additionally documents automatic CSS-per-async-chunk loading, module preload generation, and dynamic-import preload optimization ([Vite build optimizations](https://vite.dev/guide/features#build-optimizations)). | Do not assume equivalent route chunk boundaries, loading order, or cache behavior. Compare emitted graphs, browser waterfalls, and the repository's bundle budget. |
| `vite preview`, dev port, and Tauri commands | Bun can serve the SPA directly; Tauri only requires a working `devUrl` and static `frontendDist` ([Bun HTML/static docs](https://bun.com/docs/bundler/html-static), [Tauri config](../apps/web/src-tauri/tauri.conf.json)). | Mechanically replaceable after configuring port 3001 and matching SPA behavior; not a reason by itself to migrate. |
| Unit/component tests | Lirna already uses Bun Test, not Vitest ([root scripts](../package.json)). | No Vite dependency to remove here. Bun 1.4's Vitest compatibility is irrelevant unless the test stack changes. |

Bun's own frontend documentation closes by calling the HTML dev server a work in
progress that needs more plugins, more asset configuration, and configuration for
CORS and headers. Its full-stack page likewise calls that server a work in
progress whose APIs may change
([HTML/static limitations](https://bun.com/docs/bundler/html-static#what-gets-processed),
[full-stack limitations](https://bun.com/docs/bundler/fullstack#limitations-and-future-plans)).
Lirna does not need Bun's missing built-in SSR, but it does depend on precisely the
plugin ecosystem the docs identify as unfinished.

## Recommendation

1. **Upgrade Bun independently and conservatively.** Change the pinned runtime
   only in an implementation task, regenerate the lockfile if needed, and run the
   complete quality, unit, database, E2E, server-build, web-build, and Tauri smoke
   checks. Measure Lirna rather than projecting Bun's benchmarks onto it.
2. **Keep Vite 8 for `apps/web`.** Bun already runs the surrounding monorepo,
   tests, and server, so retaining Vite is a focused frontend integration choice,
   not a failure to adopt Bun.
3. **Do not combine the Bun runtime upgrade, isolated/global-store changes, and a
   frontend bundler migration.** They have different benefits and failure modes;
   combining them would make regressions difficult to attribute.
4. **Revisit a side-by-side Bun frontend spike only when the router and PWA
   blockers have credible answers.** The spike should leave Vite as the reference
   build and prove route-tree generation, automatic or intentionally replaced
   route splitting, React state-preserving refresh, Tailwind workspace scanning,
   public environment injection, manifest/service-worker generation, offline
   precaching and update behavior, nginx deep links, Tauri development/build,
   E2E behavior, and bundle-budget parity.
5. **Use evidence-based exit criteria.** Migrate only if the Bun path removes more
   complexity than it adds, passes the same offline/PWA and Tauri guarantees, and
   demonstrates a material measured improvement in Lirna's install, development,
   or build workflow. Raw bundler startup benchmarks are insufficient because
   Lirna's dominant migration work is plugin behavior.

## Validation performed

- Read the current product vocabulary and accepted PWA/Tauri architecture in
  `CONTEXT.md` and ADR 0001; no private Vault material was accessed.
- Inspected root/web/server/docs package manifests, Bun and Vite configuration,
  the lockfile, CI pinning, web entry/environment code, Docker/nginx/Tauri
  integration, generated PWA output names, and bundle-budget tooling.
- Confirmed the installed runtime reports `bun --version` as `1.3.13`, matching
  the repository's `packageManager` pin.
- Checked web source use of Vite-only primitives: the direct source dependency is
  `import.meta.env` through `@lirna/env/web`; no application uses of
  `import.meta.glob`, Vite worker query suffixes, or direct custom HMR APIs were
  found. Plugin-generated behavior remains the larger dependency.
- Cross-checked claims only against Bun's official 1.4 post/docs, Vite's official
  docs, TanStack Router's official docs, Vite PWA's official docs, and this
  repository. No Bun 1.4 migration or alternate build was run because the
  repository is pinned to 1.3.13 and this task is research, not implementation.
