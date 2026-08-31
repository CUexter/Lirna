# AI chat UI framework research for issue #39

Research date: 2026-08-31

## Recommendation

**Use the official shadcn/ui chat primitives with Vercel AI SDK 7 directly,
then build Lirna-owned message-part renderers for claims, uncertainty, and exact
evidence.** Start with `MessageScroller`, `Message`, `Bubble`, and `Marker`; add
only the ordinary shadcn controls needed for the composer and evidence
inspection. Do not adopt a second chat runtime for issue #39.

This is the smallest approach that fits Lirna's existing Base UI-flavored
shadcn package, React 19/Vite client SPA, bundle budget, and source-ownership
rules. More importantly, it leaves the Research thread, Citation, Source state,
and Evidence relation as Lirna domain records rather than forcing them into a
generic library's thread or URL-source model. AI SDK `UIMessage` should be the
typed streaming and rendering projection of that durable model, not its
authority.

Use AI Elements as a design and implementation reference, especially for
message actions and evidence disclosure, but do not install its complete
message renderer initially. Reconsider assistant-ui only if Lirna later needs a
general chat interaction runtime across many independent assistant surfaces and
is willing to put that runtime between product state and rendering.

This is a research recommendation, not an accepted architecture decision.

## Lirna constraints

- `apps/web` is a React 19 client-rendered Vite SPA using TanStack Router and
  Tailwind 4; none of the candidates needs to participate in route generation
  ([web package](../apps/web/package.json),
  [Vite config](../apps/web/vite.config.ts)). A side panel should therefore be a
  feature component composed into the Reading workspace, not a framework page.
- `packages/ui` owns shadcn source with style `base-lyra`, Base UI, and
  `@shadcn/react`; new components must go through `bun run ui:add` so formatting
  and the coverage baseline remain correct
  ([UI package](../packages/ui/package.json),
  [components.json](../packages/ui/components.json), [repository guidance](../AGENTS.md)).
- The workspace already uses AI SDK 7, but `apps/web` does not yet declare
  `@ai-sdk/react` ([root package](../package.json),
  [web package](../apps/web/package.json)). The UI implementation should add and
  align the React binding explicitly rather than depend on workspace hoisting.
- Issue [#39](https://github.com/CUexter/Lirna/issues/39) requires a durable
  Research thread, exact Source-state evidence, claim-level Evidence relations,
  visible uncertainty/conflict/missing evidence, and no automatic Draft or
  Owned-note creation. A generic `source-url` part cannot represent that
  contract by itself ([Lirna vocabulary](../CONTEXT.md)).

## Comparison

| Concern | Vercel AI Elements | assistant-ui | Official shadcn chat primitives |
| --- | --- | --- | --- |
| React/Vite/TanStack fit | React source components should bundle in Vite, but the setup page lists Next.js 14 as a prerequisite. No router coupling. React 19 and Tailwind 4 match Lirna ([setup](https://elements.ai-sdk.dev/docs/setup)). | Official installation recommends either Next.js or Vite, supports React 18/19, and now serves Base UI-flavored registry source selected by `base-*` styles ([installation](https://www.assistant-ui.com/docs/installation), [Base UI support](https://www.assistant-ui.com/docs/base-ui), [package](https://www.npmjs.com/package/@assistant-ui/react)). No router coupling. | Exact fit: shadcn ships Base UI variants, the components are copied source, and Lirna already has the headless `@shadcn/react` dependency. `MessageScroller` only requires a height-constrained parent ([release](https://ui.shadcn.com/docs/changelog/2026-06-chat-components), [scroller](https://ui.shadcn.com/docs/components/base/message-scroller)). |
| AI SDK integration | Designed around `useChat`, `UIMessage.parts`, streaming text, and AI SDK source parts ([message](https://elements.ai-sdk.dev/components/message), [sources](https://elements.ai-sdk.dev/components/sources)). The repository's component workspace currently develops against AI SDK 6, so generated source must be checked against Lirna's AI SDK 7 rather than assumed compatible ([package source](https://github.com/vercel/ai-elements/blob/main/packages/elements/package.json)). | First-party `@assistant-ui/ai-sdk` explicitly targets `ai@^7` and wraps or adapts `useChat`; current docs recommend `useChatRuntime` ([runtime overview](https://www.assistant-ui.com/docs/runtimes/ai-sdk/overview)). Strongest turnkey integration, at the cost of another state/runtime layer. | Deliberately owns no AI state or transport. Official examples use `useChat`, while `@shadcn/helpers/ai-sdk` can deterministically exercise all AI SDK part types for tests and demos ([AI SDK helper](https://ui.shadcn.com/docs/helpers/ai-sdk)). Direct ownership is preferable for Lirna's domain projection. |
| Streaming behavior | `MessageResponse` uses Streamdown for incomplete markdown, and `Conversation` examples follow streaming status ([message](https://elements.ai-sdk.dev/components/message)). | Runtime and `Thread` own running state, auto-scroll, cancellation, branching, and message rendering ([architecture](https://www.assistant-ui.com/docs/architecture), [Thread](https://www.assistant-ui.com/elements/thread)). | `MessageScroller` specifically handles streamed growth, following only at the live edge, preserving the reader's position, restoring saved threads, prepending history, and message jumps without owning transport or messages ([scroller](https://ui.shadcn.com/docs/components/base/message-scroller)). |
| Parts and citations | Best ready-made catalog. It renders AI SDK `source-url` parts and offers an inline-citation card with quotes. However, its docs say inline citations are not integrated with Streamdown or AI SDK and require structured output plus manual parsing ([sources](https://elements.ai-sdk.dev/components/sources), [inline citation](https://elements.ai-sdk.dev/components/inline-citation)). These are presentation patterns, not Lirna Evidence relations. | Message primitives route text, files, reasoning, sources, tools, and custom data through renderers; Sources supports URL and document parts in runtime or props-driven forms ([message primitive](https://www.assistant-ui.com/docs/primitives/message), [Sources](https://www.assistant-ui.com/elements/sources)). Still requires a custom renderer for exact evidence and relation semantics. | Message is intentionally presentational and accepts arbitrary content. AI SDK 7 can stream typed persistent `data-*` parts, update them by stable ID, and validate them on the server, which directly supports a Lirna-specific evidence part ([Message](https://ui.shadcn.com/docs/components/base/message), [AI SDK streaming data](https://ai-sdk.dev/docs/ai-sdk-ui/streaming-data), [persistence and validation](https://ai-sdk.dev/docs/ai-sdk-ui/chatbot-message-persistence)). |
| Accessibility | Component docs claim keyboard access and ARIA labels; source includes hidden labels for icon actions. Treat this as a useful baseline, not a complete transcript accessibility contract ([message docs](https://elements.ai-sdk.dev/components/message), [message source](https://github.com/vercel/ai-elements/blob/main/packages/elements/src/message.tsx)). | The complete Thread advertises accessibility and provides headless primitives. It is the most comprehensive ready-made surface, but it also defaults `autoFocus` to `true`, which should be disabled inside a reading side panel to avoid stealing focus ([Thread](https://www.assistant-ui.com/elements/thread)). | Strongest documented primitive-level contract: labelled focusable scroll region, `role="log"`, additions-only announcements, optional `aria-busy`, inert inactive controls, preserved focus/reader position, and real DOM rows for assistive technology ([scroller accessibility](https://ui.shadcn.com/docs/components/base/message-scroller#accessibility)). Message actions remain Lirna's responsibility ([Message accessibility](https://ui.shadcn.com/docs/components/base/message#accessibility)). |
| Source ownership | Registry installs editable source. Selective adoption is possible, but generated files bring their own component assumptions and should use Lirna's wrapper rather than the AI Elements CLI ([setup](https://elements.ai-sdk.dev/docs/setup), [Apache-2.0 license](https://github.com/vercel/ai-elements/blob/main/LICENSE)). | Registry installs editable visual components, but behavior and state remain in published runtime packages. The style-aware registry now matches Lirna's Base UI style ([installation](https://www.assistant-ui.com/docs/installation), [MIT license](https://github.com/assistant-ui/assistant-ui/blob/main/LICENSE)). | Native match for Lirna's existing source-owned component flow and license. The hard scroller behavior is a small tested headless package while visual source remains local ([release](https://ui.shadcn.com/docs/changelog/2026-06-chat-components), [MIT license](https://github.com/shadcn-ui/ui/blob/main/LICENSE.md)). |
| Dependency/bundle pressure | Selective source installation avoids a monolithic runtime, but the current `MessageResponse` imports Streamdown plus CJK, code, math, and Mermaid plugins; the repository package also carries Shiki and KaTeX. This is a high-cost default for a side-panel first slice ([message source](https://github.com/vercel/ai-elements/blob/main/packages/elements/src/message.tsx), [package source](https://github.com/vercel/ai-elements/blob/main/packages/elements/package.json)). | Highest fixed dependency surface. Current package metadata reports about 2.17 MB unpacked for `@assistant-ui/react` and 0.70 MB for `@assistant-ui/ai-sdk`, before their dependency graphs; the runtime depends on Zustand, Zod, assistant-stream/core/store/tap, safe-content-frame, and other packages ([React package](https://www.npmjs.com/package/@assistant-ui/react), [AI SDK adapter](https://www.npmjs.com/package/@assistant-ui/ai-sdk)). Unpacked size is not browser bundle size, but it is a useful complexity signal. | Lowest initial surface. Copied layout components mostly reuse Lirna dependencies; `MessageScroller` uses `@shadcn/react`, whose current package is about 56 KB unpacked and has no listed runtime dependencies ([package](https://www.npmjs.com/package/@shadcn/react)). Markdown can be chosen and measured separately. |
| Maintenance/activity | Vercel-owned, Apache-2.0, created in 2025, and receiving commits in August 2026; the latest tagged CLI release shown by GitHub is March 2026 ([repository](https://github.com/vercel/ai-elements), [commits](https://github.com/vercel/ai-elements/commits/main/), [releases](https://github.com/vercel/ai-elements/releases)). Active, but the AI SDK version lag deserves validation. | Mature and very active: repository dates to 2023, current packages and releases were published in August 2026, with explicit current/legacy AI SDK tracks ([repository](https://github.com/assistant-ui/assistant-ui), [commits](https://github.com/assistant-ui/assistant-ui/commits/main/), [releases](https://github.com/assistant-ui/assistant-ui/releases)). Larger API surface increases migration exposure. | Most established source platform of the three. Chat primitives shipped in June 2026; shadcn 4.19.0 shipped in August and the repository remains active ([chat release](https://ui.shadcn.com/docs/changelog/2026-06-chat-components), [repository](https://github.com/shadcn-ui/ui), [releases](https://github.com/shadcn-ui/ui/releases)). Chat coverage is intentionally incomplete and incremental. |
| Side-panel embedding | Examples are bounded flex layouts and components take ordinary class names; no full-app requirement ([message](https://elements.ai-sdk.dev/components/message)). | `Thread` works in an `h-full` parent and can be composed from primitives for a different layout. Disable its default autofocus in a reading panel ([Thread](https://www.assistant-ui.com/elements/thread)). | Explicitly fills a constrained parent and owns only the transcript viewport. This is the cleanest side-panel contract ([scroller usage](https://ui.shadcn.com/docs/components/base/message-scroller#usage)). |

No production bundle was built for this research. Package unpacked sizes are not
transfer-size estimates; the implementation must use Lirna's existing bundle
budget to measure the selected component set.

## Integration implications

1. Add the selected components through
   `bun run ui:add message-scroller message bubble marker`, not raw `shadcn add`.
   Review generated ownership and upgrade `@shadcn/react` from Lirna's current
   0.2.1 only if the generated source requires the current 0.3 API.
2. Add `@ai-sdk/react` to `apps/web` at a version aligned with the workspace's
   AI SDK 7 resolution. Use `useChat` for transient request/stream state, but
   load and save Research-thread turns through Lirna's API. AI SDK itself
   recommends stable IDs, server validation, and persisted `UIMessage` shape;
   Lirna should additionally retain its richer domain records and project them
   into typed messages
   ([persistence guide](https://ai-sdk.dev/docs/ai-sdk-ui/chatbot-message-persistence),
   [`useChat`](https://ai-sdk.dev/docs/reference/ai-sdk-ui/use-chat)).
3. Define a typed persistent part such as `data-evidence` carrying stable Lirna
   identifiers, exact locator/display data, and the Evidence relation. Render it
   with a Lirna component that can open the exact Source-state evidence. Do not
   infer support from citation presence, and do not replace this part with the
   AI SDK's URL-only `source` shape.
4. Represent uncertainty, missing evidence, and conflicting evidence as typed
   answer state or parts, not prose styling conventions. Validate persisted
   parts server-side before replaying or sending them back to a model.
5. Keep the side panel height-constrained with the composer outside the
   transcript viewport. On narrow screens, use the same feature component in an
   existing Sheet/Drawer pattern rather than maintaining a second chat UI. Keep
   reading focus stable and announce completed answer updates without announcing
   every token.
6. Start with plain text or the lightest renderer that meets issue #39. If
   streamed Markdown is required, compare a narrowly configured Streamdown
   renderer with the existing bundle budget; do not import AI Elements' default
   code/math/Mermaid/CJK plugin set automatically.
7. Use `@shadcn/helpers/ai-sdk` only as an optional deterministic test/dev tool
   for streams containing text, evidence data, failures, and source parts. It is
   not needed in the production UI path
   ([helper](https://ui.shadcn.com/docs/helpers/ai-sdk)).

## Why not the alternatives

**AI Elements is the runner-up.** It is source-owned, visually compatible, and
closest to AI SDK's native parts. It would be the better choice for a generic AI
chat whose citations are URLs. Issue #39 instead needs exact Lirna evidence and
relation semantics, while the default message renderer brings an avoidable
Markdown/plugin dependency stack and its repository currently develops against
AI SDK 6.

**assistant-ui is capable but too deep for this slice.** Its runtime solves
thread state, branching, editing, regeneration, transport adaptation, and
optional persistence. Lirna already needs its own durable Research-thread model,
so adopting that runtime now creates two abstractions for the same lifecycle and
the largest dependency surface. Its primitives become attractive if later
features prove that Lirna needs those interaction semantics across several chat
surfaces, not merely a source-grounded side panel.

## Validation performed

- Read issue #39, `CONTEXT.md`, web/UI/root package manifests, shadcn configs,
  Vite configuration, and the Reading workspace's existing panel-oriented
  structure. No private Vault content was accessed.
- Used only official documentation, official repositories, GitHub repository
  metadata, and npm package metadata. No third-party comparison articles were
  used.
- Checked current package metadata and repository activity on 2026-08-31.
  Dependency versions and sizes are snapshots and should be rechecked when the
  implementation begins.
- Did not install components, change dependencies, build a prototype, or modify
  application code.
