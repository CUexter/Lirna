# Lirna

Lirna is Nathan's first-party personal research and learning application. Read
`CONTEXT.md` before naming domain concepts or charting product decisions.

The private Obsidian vault at `~/vaults` is evidence and integration data, not
repository content. Never copy vault notes, journals, source documents, or other
personal material into this repository. Reference paths and describe patterns
only when planning requires it.

## File size

Prefer application files at or below 300 non-blank lines. When a change would
take a file beyond that review target, review its cohesion and module boundary;
split it only when the split creates a natural seam or hides implementation
detail. Biome enforces 500 non-blank lines as the hard limit.

## Commits

All commit messages MUST follow [Conventional Commits](https://www.conventionalcommits.org/):
`<type>[optional scope][!]: <description>` with type one of `feat`, `fix`,
`docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, `revert`.
Example: `feat(sep): split reading workspace by domain`. The
`.husky/commit-msg` hook rejects anything else.

## Shadcn components

Add shadcn components with `bun run ui:add <component...>` (never raw
`shadcn add`). The wrapper runs shadcn against `packages/ui`, formats the new
files with Biome, and appends them to `config/coverage-baseline.json` so the
coverage ratchet treats them as reviewed legacy exclusions; any later edit to a
baselined file forces unit-test coverage (hash mismatch). To retroactively
baseline files added without the wrapper, run
`bun run ui:add -- --baseline-only <file...>`.

## Agent skills

### Issue tracker

Issues live in this repo's GitHub Issues; use `gh` from this clone. See
`docs/agents/issue-tracker.md`.

### Triage labels

Use the five default triage roles. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `CONTEXT.md` at the root plus `docs/adr/`. See
`docs/agents/domain.md`.
