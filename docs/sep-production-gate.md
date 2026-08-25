# SEP production gate

Issue #123 makes the controlled first-class SEP journey a release gate. The
gate uses only synthetic prose and minimal structural fragments. It does not
read Vault content or retain material from the optional live check.

## Commands

Each layer can fail independently:

```bash
bun run test:sep:backend
bun run test:sep:frontend
bun run test:sep:database
bun run test:sep:browser
```

Run the complete production gate with:

```bash
bun run test:sep:production
```

`Quality / quality` requires the `Production SEP journey` job in addition to
the general static, type, build, database, and browser jobs. The production
browser command builds `apps/web` and serves the built output rather than the
Vite development server. The independent backend command provisions a
disposable PostgreSQL database when `POSTGRES_ADMIN_URL` is unset and runs the
complete capture-to-activation journey as well as its focused unit proofs.

## Controlled evidence

The backend gate sends requests only through the controlled SEP transport. It
captures a main entry, publisher citation information, publisher-authored Notes,
a transitively discovered Supplement, a figure description, and a semantic
asset. It proves visible bounds, redirect rejection, exact preview-to-admission
hashes with no second fetch, immutable PostgreSQL evidence, inert hostile
markup, typed Derivative generation, explicit activation, and rollback. No
inference operation or model is configured or called in that evidence path.

The structural corpus represents current and historical authored hierarchy,
legacy anchors, tagged statements, exact TeX, figures, semantic and layout
tables, Notes-based publisher Footnotes, Bibliography ambiguity, malformed
markup diagnostics, and capture of an archive URL into archive-aware identity.
The fragments are synthetic;
they contain no article body or personal material.

The browser gate runs in desktop and mobile Firefox projects. It covers the
Admission preview and exact selection, typed Reading workspace, Notes and
Supplement navigation, semantic assets, Annotation draft and semantic resume,
manual Citation resolution without inference, Source update inspection,
Derivative activation and rollback, explicit Offline working-set retention,
and verified reading after the backend is blocked. It also checks keyboard
focus, landmarks, accessible names, serious and critical axe rules including
contrast, reduced-motion preference, and understandable loading, degraded, and
backend-unavailable states.

## Performance budgets

`config/sep-production-budgets.json` records the controlled baseline and the
CI-failing upper bounds. Measurements use retained response bytes and elapsed
wall time at the public seams. They are deliberately conservative because
shared CI hosts are noisy, while still rejecting hangs, payload explosions,
unbounded assets, and order-of-magnitude regressions.

| Measure | Controlled baseline | CI budget | Rationale |
| --- | ---: | ---: | --- |
| Bounded capture | 20 ms | 2,000 ms | Controlled in-memory origin; leaves substantial CI scheduling headroom. |
| Admission and initial Derivative | 33 ms | 1,000 ms | Includes transactional persistence and typed derivation. |
| Reading API payload | 27,686 bytes | 1,000,000 bytes | Prevents accidental evidence-body or unbounded manifest delivery. |
| Initial production workspace load | 341 ms | 5,000 ms | Desktop/mobile maximum; includes API substitute latency, rendering, notation, and semantic asset. |
| Source-component transition | 111 ms | 2,000 ms | Desktop/mobile maximum; must remain an interactive local transition. |
| Largest retained semantic asset | 43 bytes | 250,000 bytes | Measured from the controlled backend capture; the browser replica is checked separately against the same budget. |
| Verified offline start | 219 ms | 5,000 ms | Desktop/mobile maximum; includes failed backend request, integrity validation, and IndexedDB replica load. |

The general web bundle budgets remain separately enforced by
`bun run quality:bundle`. Production SEP budgets do not replace capture's
domain limits of 64 components, 256 assets, 50 MB per resource, and 250 MB per
standard Source-state bundle.

## Optional live check

The live check is deliberately excluded from deterministic CI. Run it only by
explicit opt-in:

```bash
SEP_LIVE_CHECK=1 bun run test:sep:live
```

`SEP_LIVE_ENTRY_URL` may select another canonical active entry. The command is
restricted to HTTPS `plato.stanford.edu`, follows at most three revalidated
redirects, reads at most 2 MB per response, performs only the entry and
citation-information observations with at least one second between every HTTP
request (including redirects), and returns booleans, actual request counts, and
byte counts. It has no database or Admission store and
never admits, writes, or preserves response content. Failure means either SEP
publication structure changed or the controlled fixture expectations need
review; it is not a deterministic release failure.
