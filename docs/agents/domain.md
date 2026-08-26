# Domain Docs

Lirna is a single-context repository.

## Before exploring

- Read `CONTEXT.md` at the repository root.
- Read relevant ADRs under `docs/adr/` when that directory exists.
- If either is absent, proceed silently. Create domain documentation lazily when a term or durable architectural decision is actually resolved.

## Vocabulary

Use the glossary's canonical terms in issue titles, specifications, code, and
tests. Do not revive an avoided synonym without explicitly reopening the term.
If a needed concept is missing, use the domain-modeling workflow rather than
silently inventing competing language.

## ADR conflicts

Surface any contradiction with an existing ADR explicitly instead of silently
overriding it.

## Documentation roles

Follow [ADR 0009](../adr/0009-code-authority-and-documentation-roles.md):

- Reference documentation reflects what the code currently does and how to use
  or operate it. Keep it at public seams, prefer generated or checked facts, and
  change it with the implementation it describes.
- Decision documentation records why a durable choice exists, its alternatives,
  and its consequences. Research is evidence, not an accepted decision.

Do not create prose that restates readable implementation. Make behavior clear
through names, types, interfaces, tests, executable configuration, and errors;
use comments only for non-obvious constraints or reasoning.
