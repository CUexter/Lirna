# Module standards

Lirna favors deep modules: a small interface that hides substantial behavior.
Small files support locality and AI navigation, but file count is not a goal.
Splitting one module into pass-through files creates shallow modules and is not
an acceptable way to satisfy these standards.

## Required checks

`npm run check:architecture` enforces these repository-wide constraints:

- TypeScript modules have a hard ceiling of 700 lines.
- Existing larger modules have explicit non-growing caps in the check. The cap
  must shrink or disappear when those modules are deepened.
- Client modules cannot import server-owned implementation.
- Server modules cannot import client-owned implementation.
- Shared contract modules cannot depend on client or server implementation.
- Client modules import shared contracts through `@shared/*`, not directory
  traversal.
- Files under `client/src/routes/` create TanStack Router routes. Feature
  implementation and its tests live with the owning modules under
  `client/src/components/`.

The check reports modules above 400 lines as advisory hotspots. A hotspot is a
prompt to examine depth and locality, not an automatic instruction to split.

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
