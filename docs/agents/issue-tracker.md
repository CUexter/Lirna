# Issue tracker: GitHub

Issues and specs for this repo live as GitHub issues on `CUexter/Lirna`. Use the
`gh` CLI for all operations.

## Conventions

- **Create an issue**: `gh issue create --title "..." --body "..."`. Use a heredoc for multi-line bodies.
- **Read an issue**: `gh issue view <number> --comments`, also fetching labels when needed.
- **List issues**: `gh issue list --state open --json number,title,body,labels,comments` with appropriate label and state filters.
- **Comment on an issue**: `gh issue comment <number> --body "..."`
- **Apply or remove labels**: `gh issue edit <number> --add-label "..."` or `--remove-label "..."`
- **Close**: `gh issue close <number> --comment "..."`

Infer the repository from `git remote -v`; `gh` does this automatically inside
this clone.

## Pull requests as a triage surface

**PRs as a request surface: no.**

GitHub shares one number space across issues and pull requests. Resolve an
ambiguous number with `gh pr view <number>` and fall back to
`gh issue view <number>`.

## Skill operations

When a skill says to publish to the issue tracker, create a GitHub issue. When a
skill says to fetch a ticket, run `gh issue view <number> --comments`.

## Wayfinding operations

- **Map**: one issue labelled `wayfinder:map` containing Destination, Notes, Decisions so far, Not yet specified, and Out of scope.
- **Child ticket**: an issue attached through GitHub's sub-issues API and labelled `wayfinder:research`, `wayfinder:prototype`, `wayfinder:grilling`, or `wayfinder:task`. If sub-issues are unavailable, use a map task list and put `Part of #<map>` at the top of the child body.
- **Blocking**: use GitHub's native issue dependencies. POST to `repos/CUexter/Lirna/issues/<child>/dependencies/blocked_by` with the blocker's numeric database `issue_id`. If dependencies are unavailable, put `Blocked by: #<number>` at the top of the child body.
- **Frontier**: open, unassigned child tickets with no open blockers, in map order.
- **Claim**: `gh issue edit <number> --add-assignee @me` before any ticket work.
- **Resolve**: post the answer as a resolution comment, close the ticket, then append a one-line linked gist to the map's Decisions so far.
