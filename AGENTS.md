# Lirna

Lirna is Nathan's first-party personal research and learning application. Read
`CONTEXT.md` before naming domain concepts or charting product decisions.

The private Obsidian vault at `~/vaults` is evidence and integration data, not
repository content. Never copy vault notes, journals, source documents, or other
personal material into this repository. Reference paths and describe patterns
only when planning requires it.

## Commits

All commit messages MUST follow [Conventional Commits](https://www.conventionalcommits.org/):
`<type>[optional scope][!]: <description>` with type one of `feat`, `fix`,
`docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, `revert`.
Example: `feat(sep): split reading workspace by domain`. The
`.husky/commit-msg` hook rejects anything else.

## Agent skills

### Issue tracker

Issues live in this repo's GitHub Issues; use `gh` from this clone. See
`docs/agents/issue-tracker.md`.

### Triage labels

Use the five default triage roles. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `CONTEXT.md` at the root plus `docs/adr/`. See
`docs/agents/domain.md`.
