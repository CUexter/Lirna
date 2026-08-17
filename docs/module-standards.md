# Module standards

Lirna favors deep modules: a small interface that hides substantial behavior.
Small files support locality and AI navigation, but file count is not a goal.
Splitting one module into pass-through files creates shallow modules and is not
an acceptable way to satisfy these standards.

## Required checks

`bun run quality:architecture` runs the executable policy in
`scripts/check-architecture.mjs` across the current Bun workspaces under
`apps/*` and `packages/*`. It enforces these repository-wide constraints:

- Workspace dependencies are declared, acyclic, and limited to the allowed
  application-to-package and package-to-package direction.
- Cross-workspace source imports use a declared package export; undeclared
  package subpaths and relative workspace traversal fail.
- Browser code may use `@lirna/env/web`, but never the server environment or
  server-owned implementation.
- TanStack Router route creators live under `apps/web/src/routes/`.
- Native controls are implemented only by their designated primitives in
  `packages/ui`; application code consumes those owned primitives.

Biome remains responsible for module size and complexity. The architecture
policy deliberately does not duplicate a line-count ceiling or maintain legacy
layout exceptions.

## Review questions

Before extracting a module:

1. Apply the deletion test. If deleting it merely moves its implementation into
   one caller, the proposed module is shallow.
2. Name the behavior and domain concept that belong together.
3. Keep the interface smaller than the behavior it hides.
4. Put tests at the same seam callers use. The interface is the test surface.
5. Add an adapter only when behavior really varies. One adapter is a hypothetical
   seam; two adapters make the seam real.

Prefer one cohesive 500-line deep module over five 100-line pass-through modules.
Prefer several cohesive workflow modules over one file that coordinates unrelated
domain behavior, state, rendering, and persistence.
