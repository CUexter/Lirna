#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [[ "${HERDR_ENV:-}" != "1" ]]; then
  printf '%s\n' "Run this command from a Herdr-managed pane." >&2
  exit 1
fi

if [[ -f "$root/.git" ]]; then
  printf '%s\n' "Refusing to run from a linked git worktree: $root" >&2
  exit 1
fi

for command_name in git gh herdr jq opencode; do
  command -v "$command_name" >/dev/null 2>&1 || {
    printf 'Required command is unavailable: %s\n' "$command_name" >&2
    exit 1
  }
done

declare -A models=(
  [110]="gpt-5.6-sol"
  [111]="gpt-5.6-sol"
  [112]="gpt-5.6-sol"
  [113]="gpt-5.6-terra"
  [114]="gpt-5.6-terra"
  [115]="gpt-5.6-terra"
  [116]="gpt-5.6-terra"
  [117]="gpt-5.6-luna"
  [118]="gpt-5.6-sol"
  [119]="gpt-5.6-sol"
  [120]="gpt-5.6-sol"
  [121]="gpt-5.6-sol"
  [122]="gpt-5.6-sol"
  [123]="gpt-5.6-sol"
)

declare -A efforts=(
  [110]="high"
  [111]="high"
  [112]="high"
  [113]="medium"
  [114]="high"
  [115]="medium"
  [116]="medium"
  [117]="medium"
  [118]="high"
  [119]="high"
  [120]="high"
  [121]="high"
  [122]="high"
  [123]="high"
)

if (( $# > 0 )); then
  tickets=("$@")
else
  tickets=({110..123})
fi

for ticket in "${tickets[@]}"; do
  if [[ -z "${models[$ticket]:-}" ]]; then
    printf 'Unsupported SEP ticket: %s\n' "$ticket" >&2
    exit 1
  fi
done

git_dir="$(git -C "$root" rev-parse --absolute-git-dir)"
state_dir="$git_dir/herdr-sep-implementation"
lock_dir="$git_dir/herdr-sep-implementation.lock"
mkdir -p "$state_dir"

if ! mkdir "$lock_dir" 2>/dev/null; then
  printf '%s\n' "Another SEP implementation pipeline is already running." >&2
  exit 1
fi
trap 'rmdir "$lock_dir" 2>/dev/null || true' EXIT

workspace_id="${HERDR_WORKSPACE_ID:?HERDR_WORKSPACE_ID is unavailable}"
provider="${HERDR_MODEL_PROVIDER:-openai}"

is_complete() {
  local issue="$1"
  [[ -f "$state_dir/$issue.done" ]] ||
    [[ "$(gh issue view "$issue" --repo CUexter/Lirna --json state --jq .state)" == "CLOSED" ]]
}

check_blockers() {
  local issue="$1"
  local blocker

  while IFS= read -r blocker; do
    [[ -z "$blocker" ]] && continue
    if ! is_complete "$blocker"; then
      printf 'Ticket #%s remains blocked by #%s.\n' "$issue" "$blocker" >&2
      exit 1
    fi
  done < <(
    gh api "repos/CUexter/Lirna/issues/$issue/dependencies/blocked_by" \
      --jq '.[].number'
  )
}

agent_status() {
  herdr agent get "$1" 2>/dev/null | jq -r '.result.agent.agent_status'
}

wait_for_agent() {
  local name="$1"
  local status

  status="$(agent_status "$name")"
  if [[ "$status" == "working" || "$status" == "unknown" ]]; then
    herdr agent wait "$name" >/dev/null
    status="$(agent_status "$name")"
  fi

  if [[ "$status" == "blocked" ]]; then
    printf 'Agent %s is blocked and needs input.\n' "$name" >&2
    herdr agent read "$name" --source visible --lines 120 || true
    exit 1
  fi

  if [[ "$status" != "idle" && "$status" != "done" ]]; then
    printf 'Agent %s settled in unexpected state: %s\n' "$name" "$status" >&2
    exit 1
  fi
}

wait_for_shell() {
  local pane_id="$1"
  local process_json

  for _ in {1..120}; do
    process_json="$(herdr pane process-info --pane "$pane_id")"
    if jq -e '
      .result.process_info.shell_pid as $shell
      | [.result.process_info.foreground_processes[].pid] == [$shell]
    ' <<<"$process_json" >/dev/null; then
      return
    fi
    sleep 1
  done

  printf 'Pane %s did not reach an available shell within 120 seconds.\n' "$pane_id" >&2
  exit 1
}

prompt_agent() {
  local name="$1"
  local prompt="$2"
  local output

  for _ in {1..3}; do
    if output="$(herdr agent prompt "$name" "$prompt" --wait 2>&1)"; then
      return
    fi
    if [[ "$output" != *"agent_prompt_stalled"* ]]; then
      printf '%s\n' "$output" >&2
      exit 1
    fi
    sleep 2
  done

  printf 'Agent %s did not accept its prompt after three attempts.\n' "$name" >&2
  exit 1
}

for ticket in "${tickets[@]}"; do
  if is_complete "$ticket"; then
    printf 'Skipping completed ticket #%s.\n' "$ticket"
    continue
  fi

  check_blockers "$ticket"

  name="sep_$ticket"
  model="${models[$ticket]}"
  effort="${efforts[$ticket]}"

  if herdr agent get "$name" >/dev/null 2>&1; then
    status="$(agent_status "$name")"
    if [[ "$status" == "working" || "$status" == "unknown" ]]; then
      printf 'Waiting for existing agent %s.\n' "$name"
      wait_for_agent "$name"
      touch "$state_dir/$ticket.done"
      continue
    fi
  else
    tab_json="$(
      herdr tab create \
        --workspace "$workspace_id" \
        --cwd "$root" \
        --label "SEP #$ticket" \
        --no-focus
    )"
    pane_id="$(jq -r '.result.root_pane.pane_id' <<<"$tab_json")"
    if [[ -z "$pane_id" || "$pane_id" == "null" ]]; then
      printf 'Herdr did not return a pane for ticket #%s.\n' "$ticket" >&2
      exit 1
    fi

    wait_for_shell "$pane_id"

    herdr agent start "$name" \
      --kind opencode \
      --pane "$pane_id" \
      --timeout 60000 \
      -- \
      -m "$provider/$model" >/dev/null
  fi

  prompt="$(cat <<EOF
Implement GitHub issue #$ticket completely in the current shared checkout.

Read \`gh issue view $ticket --comments\`, \`CONTEXT.md\`, repository AGENTS instructions, and the relevant ADRs before editing. The blockers are implemented in this checkout. Inspect their code and tests rather than recreating them.

Constraints:
- Do not create a worktree, branch, or commit.
- Preserve every unrelated or pre-existing change in this dirty shared checkout. If concurrent changes directly conflict with this ticket, stop and ask instead of reverting them.
- Scope is issue #$ticket only. Do not begin another ticket or change GitHub issue metadata.
- Do not add or redesign authentication; Lirna is a single-user system.
- Follow ADR 0006: exact captured publication bytes are immutable evidence, and captured HTML is never injected into the Reading UI.
- Use the narrowest complete frontend/backend vertical slice required by the issue.
- Use apply_patch for manual edits.
- Run targeted backend and frontend tests plus the strongest practical repository checks, and fix failures caused by this ticket.

This ticket was routed to \`$model\` with \`$effort\` reasoning. Do not report completion until its acceptance criteria are implemented and independently testable on both backend and frontend. At completion, report changed files, commands/results, acceptance coverage, and any residual risk. If a product, security, data-integrity, or architecture decision is unresolved, stop and ask rather than guessing.
EOF
)"

  printf 'Starting ticket #%s with %s (%s effort).\n' "$ticket" "$model" "$effort"
  prompt_agent "$name" "$prompt"
  wait_for_agent "$name"
  touch "$state_dir/$ticket.done"
done

printf '%s\n' "Requested SEP implementation tickets completed."
