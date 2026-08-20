---
name: ticket-model-routing
description: Route tickets to GPT-5.6 Sol, Terra, or Luna. Use when assigning issues to models or cutting backlog agent cost.
---

# Ticket Model Routing

Pick cheapest model that still do job well. Count retry, review, and failure cost.

## Do

1. Read [`openai-codex-model-research.md`](../../../docs/openai-codex-model-research.md). Know current model ability, evidence limits, and cost order.
2. Get all ticket facts. For GitHub, run `gh issue view <number> --comments`. Read acceptance, blockers, dependencies, linked decisions, repo work, and checks. Mark missing facts.
3. Pick floor with gates below. Ticket title not enough. Give one concrete escalation trigger.
4. Try downshift on each Sol or Terra ticket: clarify, decide first, or split. Keep work together when coordination cost bigger than model saving.
5. For GitHub, append or replace exact routing block below. Preserve all other body text. For other inputs, only report.
6. Return every ticket once in output table. Claims must point to ticket or research note.

## Gates

### Luna

Use `gpt-5.6-luna` only when all true:

- Goal and bounds clear.
- Known repo pattern, mechanical work, or focused edit.
- Local blast radius. Easy rollback.
- Objective tests or deterministic checks.
- Failure cheap. No security, privacy, data, or migration danger.
- No open product, domain, or architecture choice.

### Sol

Use `gpt-5.6-sol` when any true:

- Product, domain, or architecture judgment needed.
- Requirements conflict, important facts missing, or several costly meanings possible.
- Cross-cutting, hard to undo, or blast radius unclear.
- Security, privacy, data integrity, concurrency, or production migration risk.
- Bug root cause unknown and reproduction or observability weak.
- Novel research, exceptional polish, or strong independent judgment needed.

Missing spec means provisional Sol. Name fact that would permit downshift.

### Terra

Use `gpt-5.6-terra` when Luna fails and Sol does not fire. Normal home for production features, multi-file work, reproducible bugs, tests, and review inside known bounds.

## Effort

- `low`: deterministic Luna, strong checks.
- `medium`: normal Luna or Terra.
- `high`: Terra near Sol, or consequential Sol.
- `xhigh` or `max`: only exceptional ambiguity or consequence shown by evidence.

Effort tune model. Effort not make Luna or Terra become Sol.

## Output

| Ticket | Model | Effort | Confidence | Evidence | Escalate when |
| --- | --- | --- | --- | --- | --- |

- Model: canonical OpenAI model ID. Assume no billing route.
- Confidence: `high`, `medium`, or `low` from ticket and repo evidence.
- Evidence: shortest concrete fact that sets floor.
- Escalate when: one observable reason to move up.

GitHub body block:

```markdown
## Model routing

- Model: `gpt-5.6-terra`
- Effort: `medium`
- Confidence: `high`
- Evidence: The shortest concrete reason that sets the capability floor.
- Escalate when: One observable condition that requires the next tier.
```

Use real values. Keep heading and labels exact.

After table, give model counts and safe downshifts with exact ticket changes. Give cost estimate only with token or message assumptions and arithmetic. Else give relative cost order.
