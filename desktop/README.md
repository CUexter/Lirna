# Desktop host (Tauri)

Placeholder for Lirna's **narrow, least-privilege desktop host**, decided and
prototyped in issue #4 and recorded in
[`../docs/adr/0001-pwa-first-web-core-narrow-desktop-tauri-host.md`](../docs/adr/0001-pwa-first-web-core-narrow-desktop-tauri-host.md).

## What this unit is

- A thin [Tauri](https://tauri.app) shell that loads the **same** shared web
  core built from `../client` (it does not ship its own UI).
- Its only job is to implement the host-agnostic `VaultHost` port defined in
  `../client/src/lib/vault/vault-host.ts`, granting the direct Vault-folder
  access a pure PWA cannot: open a user-selected Markdown file, refuse stale
  writes, and perform conflict-checked atomic saves.

## What this unit is NOT

- Not a second client — the web product lives in `../client`.
- Not a mobile target — Tauri mobile is explicitly out of scope (issue #4).
- Not the backend — canonical state lives in the hosted `../server` service.

## Not yet built

The Rust `src-tauri/` host and its `VaultHost` implementation are a first-build
task, not part of the Phase 0 skeleton. Building it will add the Tauri/Rust
toolchain as its own package (a likely workspace split at that point).
