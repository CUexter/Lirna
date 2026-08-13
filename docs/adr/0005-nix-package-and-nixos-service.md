# Nix package and NixOS service

Lirna uses a locked Nix flake for its Linux development environment, immutable
hosted-server package, and NixOS service deployment. The initial supported system
is `x86_64-linux`.

## Status

Accepted

## Decision

- `package.json` and `package-lock.json` own exact JavaScript tooling versions.
  Nix pins Node 22, PostgreSQL 16, system libraries, and Playwright's patched
  Firefox browser. The npm Playwright version must match Nixpkgs' Playwright
  driver version.
- The default development shell contains Node, PostgreSQL, Docker, Compose, and
  the Nix-managed Playwright browsers. The `desktop` shell additionally contains
  Rust, Cargo, pkg-config, and WebKitGTK prerequisites for a future Tauri host.
- The hosted package contains the built PWA and server, production npm
  dependencies, committed migrations, and separate `lirna-api`, `lirna-worker`,
  and `lirna-migrate` executables. Prototype artifacts are excluded.
- The NixOS module exposes `services.lirna.package`. A successful oneshot
  migration service gates independently supervised API and worker services;
  neither runtime process mutates the schema.
- The module creates a dedicated system user and state directories. It can
  provision PostgreSQL 16 locally with peer authentication or use an explicitly
  configured external database URL.
- Access tokens and an external database URL are read from separate root-managed
  runtime environment files. The API receives both files, while migration and
  worker units receive only the database file. Secret files are represented by
  strings, not Nix paths, so they are never copied into the world-readable Nix
  store.
- Ordinary `nix flake check` builds quality checks, the package, and a NixOS
  system closure. The heavier named NixOS VM test remains explicit and verifies
  local PostgreSQL, migration gating, API, worker, and PWA startup together.

## Consequences

- Development and CI do not run `npx playwright install`; Firefox comes from the
  locked Nix store.
- Updating Nixpkgs may require synchronizing `@playwright/test` and regenerating
  the npm dependency hash in `nix/package.nix` and `flake.nix`.
- Deployments fail before API and worker startup when migrations fail, preserving
  the rule that runtime services only operate against committed schema state.
- The package is not yet a Tauri desktop package. That output will be added only
  after a real desktop host exists.
