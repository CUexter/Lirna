# Lirna

Lirna is Nathan's first-party personal research and learning application. Read
`CONTEXT.md` before naming domain concepts or charting product decisions.

The private Obsidian vault at `~/vaults` is evidence and integration data, not
repository content. Never copy vault notes, journals, source documents, or other
personal material into this repository. Reference paths and describe patterns
only when planning requires it.

Prior Ariadne work at `~/ariadne` and `CUexter/ariadne` is evidence, not a set of
defaults. A prior decision applies only after it survives Lirna's destination
and constraints.

## Agent skills

### Coding-agent dependency policy

Use `npm run dependency:add -- <one-package-request>` as the only supported npm
dependency mutation path. It records exact assessment evidence after a
scripts-disabled install. Do not use direct `npm install`, `uninstall`, `update`,
or `link`, or execute packages through `npx` or `npm exec`.

`npm search`, `npm view`, repository `npm run` scripts, and exact lockfile
installation with `npm ci --ignore-scripts` remain available. The pre-commit
hook and CI detect unassessed direct manifest or lockfile additions; they are
detection and supported-command controls, not a claim that every external
process is technically prevented from invoking npm.

### Issue tracker

Issues live in this repo's GitHub Issues; use `gh` from this clone. See
`docs/agents/issue-tracker.md`.

### Triage labels

Use the five default triage roles. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `CONTEXT.md` at the root plus `docs/adr/`. See
`docs/agents/domain.md`.
