# OpenAI Codex and GPT-5.6 Sol, Terra, and Luna

Research retrieved on **2026-08-17**. OpenAI and OpenCode documentation is
mutable, so prices, limits, and model availability should be rechecked before a
purchase or deployment decision.

## Executive summary

- **Codex is a software-development agent and product, not a single model.** It
  uses models to write, review, edit, debug, and explain code across the Codex
  app, CLI, IDE extension, web and mobile interfaces, CI/CD, and SDK.
- **Sol, Terra, and Luna are distinct official OpenAI models**, not OpenCode
  aliases or reasoning presets. They trade capability for cost and speed.
- **Sol** is the flagship for ambiguous, difficult, high-value work. **Terra**
  is the practical default for everyday production work. **Luna** is optimized
  for clear, repeatable, high-volume tasks.
- At standard API rates for requests with at most 272K input tokens, Sol costs
  **$5 input / $30 output**, Terra **$2 / $12**, and Luna **$0.20 / $1.20** per
  million tokens. Long-context requests cost more.
- OpenAI does not publish parameter counts, architecture, training-corpus
  details, or a controlled benchmark comparing all three models. The relative
  rankings below reflect OpenAI's positioning, not an independently measured
  quality ratio.

## Codex versus a Codex model

[OpenAI describes Codex](https://developers.openai.com/codex) as its coding
agent. The agent supplies the execution environment, tools, repository context,
task orchestration, and user interfaces; a selected model supplies the language
and reasoning capability. Codex can therefore support multiple models and can
change its recommended model without becoming a different product.

This distinction matters because OpenAI still offers specialized models such as
`gpt-5.3-codex`, while its current
[code-generation guide](https://developers.openai.com/api/docs/guides/code-generation)
recommends the latest general-purpose GPT-5.6 family for most new Codex and API
coding work.

The official GPT-5.6 identifiers are:

| Display name | API model ID | Positioning |
| --- | --- | --- |
| GPT-5.6 Sol | `gpt-5.6-sol` | Flagship/frontier model |
| GPT-5.6 Terra | `gpt-5.6-terra` | Intelligence-cost balance, roughly the previous mini tier |
| GPT-5.6 Luna | `gpt-5.6-luna` | Cost-sensitive high-volume model, roughly the previous nano tier |

The unsuffixed `gpt-5.6` alias currently routes to Sol. OpenAI says the tiers
roughly correspond to its earlier flagship, mini, and nano tiers; that is market
positioning, not evidence that their architectures are equivalent.

## Capability comparison

OpenAI's [Codex model-selection guidance](https://developers.openai.com/codex/models)
draws the following practical boundaries:

| Area | Sol | Terra | Luna |
| --- | --- | --- | --- |
| Best fit | Ambiguous, difficult, open-ended, high-value work | Everyday production work needing strong reasoning and tools | Clear, specific, repeatable, high-volume work |
| Typical coding use | Complex changes, architectural reasoning, difficult debugging, polished implementation | Routine features, maintenance, tests, reviews, general agent work | Focused edits, transformations, extraction, classification, routing, background automation |
| Relative capability | Highest | Intermediate | Lowest in the family |
| Relative speed and cost | Generally slowest and most expensive | Balanced | Fastest and cheapest |
| Selection rule | Use when judgment or failure cost dominates | Use as the pragmatic default | Use when the task can be tightly specified and scaled |

OpenAI describes Terra as competitive with GPT-5.5 at lower cost, but it does
not publish a single official benchmark table directly comparing Sol, Terra,
and Luna. Cost differences should not be interpreted as benchmark ratios.

If the appropriate tier is unclear, OpenAI recommends starting with Sol, then
moving down to the least expensive model and lowest reasoning effort that still
meets the quality requirement.

## Shared technical capabilities

The individual model cards for
[Sol](https://developers.openai.com/api/docs/models/gpt-5.6-sol),
[Terra](https://developers.openai.com/api/docs/models/gpt-5.6-terra), and
[Luna](https://developers.openai.com/api/docs/models/gpt-5.6-luna) publish the
same fundamental limits:

| Property | All three models |
| --- | --- |
| Input | Text and images |
| Native output | Text |
| Context window | 1,050,000 tokens |
| Maximum input | 922,000 tokens |
| Maximum output | 128,000 tokens |
| Knowledge cutoff | 2026-02-16 |
| Reasoning efforts | `none`, `low`, `medium`, `high`, `xhigh`, `max` |
| Default reasoning effort | `medium` |
| API support | Responses, Chat Completions, Batch |

All three support streaming, structured outputs, function calling, prompt
caching, image input, web search, and file search. Through the Responses API,
the family can use web and file search, image generation, code interpreter,
hosted shell, `apply_patch`, skills, computer use, MCP, and tool search.

The family also adds programmatic tool calling, explicit prompt-cache controls,
persisted reasoning, `max` reasoning effort, and beta multi-agent orchestration.
`reasoning.mode: "pro"` is an execution mode rather than a separate model.
Likewise, Codex's Ultra setting refers to harness-level subagent orchestration,
not another reasoning effort or API model.

These models do not directly support Realtime, Assistants, fine-tuning,
embeddings, standalone image or video endpoints, speech, transcription, or
translation. Image generation is available as a Responses API tool even though
the models' native output modality is text.

## API token pricing

The following [OpenAI API prices](https://developers.openai.com/api/docs/pricing)
are in US dollars per one million tokens. Each rate is shown as **input / cached
input / cache write / output**.

| Model | Standard, up to 272K input | Standard, over 272K input |
| --- | ---: | ---: |
| `gpt-5.6-sol` | $5 / $0.50 / $6.25 / $30 | $10 / $1 / $12.50 / $45 |
| `gpt-5.6-terra` | $2 / $0.20 / $2.50 / $12 | $4 / $0.40 / $5 / $18 |
| `gpt-5.6-luna` | $0.20 / $0.02 / $0.25 / $1.20 | $0.40 / $0.04 / $0.50 / $1.80 |

Once a request exceeds 272K input tokens, long-context rates apply to the
**entire request**, not only the portion beyond 272K. Cache writes cost 1.25
times uncached input; cache reads cost 10% of uncached input.

Other service tiers change these rates:

- Batch and Flex cost 50% of standard rates.
- Fast costs 2 times standard rates.
- Eligible regional-processing endpoints add 10%.
- Built-in tools are additional. For example, web search costs $10 per 1,000
  calls plus search-content tokens at the selected model's rates. File search,
  hosted shell, and code-interpreter containers also have separate charges.

The [API changelog](https://developers.openai.com/api/docs/changelog) dates the
family's release to 2026-07-09. It records a 20% Terra price reduction and an 80%
Luna price reduction on 2026-07-30. The table above reflects those reduced
rates.

### Worked estimate

For one standard short-context request containing 100,000 uncached input tokens
and 10,000 output tokens:

| Model | Input cost | Output cost | Estimated total |
| --- | ---: | ---: | ---: |
| Sol | $0.50 | $0.30 | **$0.80** |
| Terra | $0.20 | $0.12 | **$0.32** |
| Luna | $0.02 | $0.012 | **$0.032** |

This estimate excludes tools, cache writes, regional processing, and additional
agent turns. Agentic coding commonly requires multiple turns, so a task's total
cost can be materially higher than a single-request estimate.

## Codex subscriptions and credits

OpenAI's [Codex pricing page](https://developers.openai.com/codex/pricing)
currently publishes these subscription prices:

| Plan | Price |
| --- | ---: |
| Free | $0/month |
| Go | $8/month |
| Plus | $20/month |
| Pro 5x | $100/month |
| Pro 20x | $200/month |
| Business | $20/user/month annually or $25 monthly |
| Enterprise and Edu | Contact sales |
| API key | Usage-based API pricing |

Plus explicitly includes Sol, Terra, and Luna. Included usage is not a fixed
token allowance because context size, reasoning effort, tools, retrieval, and
caching change consumption. OpenAI currently publishes these approximate local
message ranges per shared five-hour window:

| Plan | Sol | Terra | Luna |
| --- | ---: | ---: | ---: |
| Plus | 10-100 | 25-200 | 250-2,000 |
| Pro 5x | 50-500 | 125-1,000 | 1,250-10,000 |
| Pro 20x | 200-2,000 | 500-4,000 | 5,000-40,000 |
| Business | 10-100 | 25-200 | 250-2,000 |

Additional weekly limits may apply. The broad ranges are important: a long,
tool-heavy, high-reasoning interaction consumes substantially more allowance
than a small focused request.

For purchased Codex credits, the current rates per million tokens are:

| Model | Input credits | Cached-input credits | Output credits |
| --- | ---: | ---: | ---: |
| Sol | 125 | 12.5 | 750 |
| Terra | 50 | 5 | 300 |
| Luna | 5 | 0.5 | 30 |

OpenAI says GPT-5.6 interactions average roughly 5-40 credits per message, but
the same workload factors make that only a planning range.

## Using these models in OpenCode

[OpenCode model selectors](https://opencode.ai/docs/models/) use the form
`provider_id/model_id`:

- `openai/gpt-5.6-sol` uses the direct OpenAI provider. OpenCode can connect to
  OpenAI using ChatGPT Plus/Pro OAuth or an API key.
- `opencode/gpt-5.6-sol` routes the model through OpenCode Zen. This changes the
  provider and billing path, not the underlying OpenAI model tier.
- OpenCode model variants such as `low`, `medium`, `high`, and `xhigh` are
  reasoning settings. Sol, Terra, and Luna are models, not variants.

[OpenCode Zen](https://opencode.ai/docs/zen/) lists all three GPT-5.6 tiers as
pay-as-you-go models. Its current token rates match OpenAI's standard rates,
including the long-context threshold. Zen passes card fees through at cost
(currently 4.4% plus $0.30 per transaction); below a $5 balance it defaults to a
$20 automatic reload, which can be changed or disabled. With a direct API key,
the provider bills usage directly.

## Recommendations

| Workload | Recommended starting point | Reason |
| --- | --- | --- |
| Difficult repository-wide change or uncertain debugging | Sol | Failure cost and ambiguity justify stronger judgment |
| Most interactive coding and maintenance | Terra | Strong tool use and reasoning at 40% of Sol's standard token price |
| Bulk, well-specified edits or background classification | Luna | One tenth of Terra's standard token price |
| Quality is uncertain | Sol, then evaluate Terra and Luna | Establish a quality baseline before optimizing cost |
| High-volume production workflow | Evaluate all three on representative tasks | Model price is only useful alongside error, retry, and review costs |

The lowest model price does not always produce the lowest system cost. A cheaper
model can require more retries, supervision, or follow-up turns. Selection should
therefore be based on representative task evaluations measuring correctness,
latency, total tokens, tool calls, and human-review time.

## Evidence limits

OpenAI has not publicly documented:

- Parameter counts or model architecture.
- Training-corpus composition.
- Weight relationships or whether Terra and Luna are distilled from Sol.
- A controlled quantitative benchmark table directly comparing all three.

The analysis therefore does not assign invented quality percentages or treat
pricing ratios as capability scores. Also, safety controls for cyber and biology
tasks may block or pause legitimate dual-use requests, so published model
capability does not guarantee that every such task will execute without review.

## Primary sources

All sources were retrieved on 2026-08-17.

- [OpenAI Codex](https://developers.openai.com/codex)
- [Codex model selection](https://developers.openai.com/codex/models)
- [Codex pricing and credits](https://developers.openai.com/codex/pricing)
- [OpenAI code-generation guide](https://developers.openai.com/api/docs/guides/code-generation)
- [GPT-5.6 guide](https://developers.openai.com/api/docs/guides/latest-model)
- [OpenAI API changelog](https://developers.openai.com/api/docs/changelog)
- [GPT-5.6 Sol model card](https://developers.openai.com/api/docs/models/gpt-5.6-sol)
- [GPT-5.6 Terra model card](https://developers.openai.com/api/docs/models/gpt-5.6-terra)
- [GPT-5.6 Luna model card](https://developers.openai.com/api/docs/models/gpt-5.6-luna)
- [OpenAI API pricing](https://developers.openai.com/api/docs/pricing)
- [OpenCode models](https://opencode.ai/docs/models/)
- [OpenCode OpenAI provider](https://opencode.ai/docs/providers/#openai)
- [OpenCode Zen](https://opencode.ai/docs/zen/)
- [Models.dev OpenAI catalog](https://models.dev/providers/openai)
