# PWA-first web core with a narrow desktop Tauri host

Lirna ships **one responsive PWA web core** as the primary client for desktop and
mobile browsers, backed by a separately hosted backend (API, worker, PostgreSQL)
on Nathan-controlled infrastructure. Direct desktop Vault-folder access is a
hard first-build requirement that a pure PWA cannot satisfy, so a **narrow,
least-privilege desktop Tauri host** loads the same web core and exposes only the
native Vault adapter (open a selected Markdown file, refuse stale writes, perform
conflict-checked atomic saves). This was chosen and prototyped in issue #4.

## Status

accepted

## Considered Options

- **Pure PWA everywhere** — rejected: browsers cannot grant the direct
  Vault-folder access Nathan requires on desktop.
- **Full native desktop app (Tauri owns the UI)** — rejected: duplicates the web
  core and abandons the shared responsive product.
- **Tauri mobile clients** — rejected: the prototype found no mobile-native
  capability that justifies them; revisit only if a later prototype demonstrates
  a necessary native capability.

## Consequences

- Client storage is a recoverable **replica/outbox**, never canonical; the app
  works with the backend stopped and reconciles later.
- No SSR anywhere — the web core is a static, offline-precached bundle that both
  the browser PWA and the Tauri host load.
- Offline replica/outbox semantics, resumable research-thread events, and
  Markdown conflict detection must stay **host-independent**: the Vault-adapter
  port lives in the shared web core (`client/`); only its Tauri implementation
  lives in the desktop host (`desktop/`).
