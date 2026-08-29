# Module standards

Lirna favors deep modules: a small interface that hides substantial behavior.
Small files can support locality and AI navigation, but file count is not a goal.
Splitting cohesive behavior into pass-through files creates shallow modules and
does not satisfy this standard.

## Review questions

Before creating or extracting a module:

1. Apply the deletion test. If deletion only moves the implementation into one
   caller, the proposed module is shallow.
2. Name the behavior and domain concept that belong together.
3. Keep the interface smaller than the behavior it hides.
4. Put tests at the same seam callers use. The interface is the test surface.
5. Add an adapter only when behavior varies. One adapter is a hypothetical seam;
   two adapters make the seam real.
6. Check locality. Changes and bugs for one invariant should concentrate in one
   implementation.
7. Check leverage. Multiple callers should gain behavior without learning its
   implementation protocol.

Prefer one cohesive deep module over several pass-through modules. Prefer several
cohesive workflow modules over one module coordinating unrelated domain behavior,
state, rendering, and persistence.

## Executable policy

Run the repository's architecture and dependency checks through the root quality
commands:

```bash
bun run quality:architecture
bun run quality:fallow
```

The scripts and tool configuration are authoritative for current package rules,
route placement, import restrictions, ownership rules, and thresholds. Change an
executable rule and its tests together; do not copy its inventory into this
document.
