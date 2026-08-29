# Frontend feature structure research

Research date: 2026-08-29

## Recommendation

Use a pragmatic feature-first structure, not a full Feature-Sliced Design (FSD)
hierarchy:

1. Keep TanStack Router's required files in `src/routes` and preserve names such
   as `__root.tsx`, `index.tsx`, and `$sourceId/$stateId.tsx`.
2. Make route files own URL and router concerns: path/search schemas, params,
   loaders and preloading, route-level pending/error behavior, and translation
   between URL state and feature props.
3. Put each product surface under `src/features/<feature>`, with React modules
   under `components/`, hooks under `hooks/`, and feature-local utilities,
   fixtures, and tests beside the capability that owns them.
4. Split a feature into capability folders only after it is large enough that a
   stable behavioral seam is visible. Keep the current Reading workspace
   capability split; do not impose the same depth on smaller features.
5. Keep app bootstrap, API clients, infrastructure, and generic test support
   outside feature folders. Treat the Offline working set as a cross-feature
   product capability under `features/`, not as generic infrastructure.
6. Use direct imports to defining files. Do not add `index.ts` barrels merely to
   create feature public APIs.
7. Let filenames use their directory context while exported symbols remain
   unambiguous. For example, prefer
   `features/source-library/components/Header.tsx` exporting `LibraryHeader`
   over `components/sources-library/LibraryHeader.tsx`.

This preserves Lirna's existing domain-oriented direction while making ownership
clearer than a generic `components` tree. It also follows Lirna's deep-module
standard: folder count is not a goal, and a new directory should represent a
cohesive capability rather than a pass-through layer.

## Evidence

### React: organize around component and state ownership

React's official documentation does not prescribe a filesystem architecture.
Its relevant guidance is behavioral:

- [Thinking in React](https://react.dev/learn/thinking-in-react) says to break a
  UI into a component hierarchy, map components to the information architecture,
  and keep each component concerned with one thing. It also notes that a header
  need not become a component until its complexity justifies extraction.
- The same guide places each piece of state at the closest sensible common owner
  and recommends a minimal, non-duplicated state representation.
- [Sharing State Between Components](https://react.dev/learn/sharing-state-between-components)
  describes a single owner for each piece of state and explicitly notes that some
  state should remain close to leaf components while coordinated state moves to
  the closest common parent.

Filesystem implication: keep behavior near the component hierarchy that owns it.
Do not centralize every hook, type, or stateful controller by technical kind.
Extract a feature capability when components need a shared owner or when the
behavior is independently cohesive, not because a taxonomy demands another
folder.

### Redux: feature folders over technical layers

The official [Redux Style Guide](https://redux.js.org/style-guide/#structure-files-as-feature-folders-with-single-file-logic)
labels feature folders the recommended pattern. Its rationale is that the same
feature logic should live together rather than being split into global
`components`, `reducers`, and `actions` folders.

The official [Redux FAQ: Code Structure](https://redux.js.org/faq/code-structure/#what-should-my-file-structure-look-like-how-should-i-group-my-action-creators-and-reducers-in-my-project-where-should-my-selectors-go)
is intentionally less absolute: Redux itself has no required project layout, but
it specifically recommends feature folders. Its example separates:

- `app` for application-wide setup and layout;
- `common` for genuinely generic hooks, components, and utilities; and
- `features` for all functionality belonging to a feature.

Although Lirna does not need to copy Redux's exact folder names, the ownership
rule transfers cleanly: `useSepAdmission`, its fixtures, preview components, and
tests belong with Source admission, not in separate global `hooks`, `components`,
and test trees.

### TanStack Router: preserve the route tree, not all page implementation

TanStack Router's official
[File-Based Routing](https://tanstack.com/router/latest/docs/routing/file-based-routing)
guide calls file-based routing the preferred configuration. It says route files
and directories represent the route hierarchy and provide consistent URL
organization, generated type linkages, and automatic code splitting. It also
explicitly supports mixing directory and flat route forms where each is useful.

The official
[Code-Based Routing](https://tanstack.com/router/latest/docs/routing/code-based-routing)
guide reinforces the distinction: both modes produce the same route tree;
file-based routing uses the filesystem and generation while code-based routing
manually declares parent routes and adds children. The guide discourages putting
an entire code-based route tree and application in one file.

Filesystem implication: `src/routes` is framework-owned topology. Keep its
special filenames and let it expose the URL contract, but do not require every
component, hook, and utility used by a route to live there. A route can directly
import a feature entry component from its defining file.

For Lirna, a route adapter should generally own:

- `createFileRoute` and its exact generated path;
- `validateSearch`, params, hashes, and route-specific navigation;
- route loaders, preloading, and route error/pending boundaries where used; and
- conversion of router values into explicit feature props.

The feature should generally own:

- workflow queries and mutations that are meaningful outside the URL grammar;
- feature-local state and controllers;
- page composition and rendering;
- feature-specific error and empty states; and
- colocated unit and integration tests.

This is a seam, not a line-count rule. A tiny route may render its complete UI
inline. Once a route accumulates a real workflow, the route should become a thin
framework adapter to that workflow.

### Feature-Sliced Design: useful principles, excessive machinery for Lirna

The official FSD documentation provides useful secondary pattern evidence:

- [Layers](https://feature-sliced.design/docs/reference/layers) defines seven
  standardized layers but says projects do not have to use every layer and
  should add only layers that bring value.
- The same page says not everything needs to be a Feature, a one-page block need
  not become a Widget, and Pages may contain substantial non-reused UI directly.
- [Slices and segments](https://feature-sliced.design/docs/reference/slices-segments)
  prioritizes high cohesion and low coupling. It permits any internal slice
  organization, while its standard segments organize by technical nature.
- [Excessive entities](https://feature-sliced.design/docs/guides/issues/excessive-entities)
  explicitly recommends deferred decomposition over preemptive slicing. It says
  an application may have no Entities layer and warns that globally accessible
  entities create ambiguity, coupling, broad refactor impact, and cross-import
  dilemmas.
- [Public API](https://feature-sliced.design/docs/reference/public-api) warns that
  wildcard exports hide interfaces and expose internals. It also documents
  circular imports, impaired tree shaking, larger bundles, and slower development
  servers as risks of index-file barrels. Within a slice, it recommends relative
  imports with full paths.

The risk in adopting all of FSD for Lirna is not FSD itself; its current docs are
careful about these tradeoffs. The risk is treating its maximum taxonomy as a
checklist. An `app/pages/widgets/features/entities/shared` conversion would add
placement debates and shallow forwarding modules before Lirna has reuse patterns
that justify them. It would also conflict with the requested direct-import rule
because canonical FSD slice APIs are commonly implemented as `index.ts` barrels.

Use the principles instead: cohesive product slices, directional dependencies,
few truly shared modules, and deferred extraction.

### Bulletproof React: pragmatic secondary evidence

The canonical
[Bulletproof React project structure](https://github.com/alan2207/bulletproof-react/blob/master/docs/project-structure.md)
uses `app`, `features`, shared infrastructure, and testing areas. It recommends
keeping most product code in feature folders and including only the feature
subfolders that are actually needed. It also now recommends direct imports
instead of feature barrels because barrels can impair Vite tree shaking and
performance. Finally, it advises composing independent features at the
application layer rather than freely importing across features.

This is an example architecture rather than a React standard, but it supports the
same target: feature-local implementation, deliberately small shared areas,
direct imports, and application-level composition.

## Comparison

| Concern | Technical-type folders | Feature folders | Full FSD | Recommended for Lirna |
| --- | --- | --- | --- | --- |
| Finding all code for a change | Scattered across `components`, `hooks`, and `utils` | Usually local | Local after learning layer and segment rules | Feature-local |
| Route ownership | Often mixed into page components | Can be ambiguous | Usually App/Pages depending on router | Framework files own URL contracts; features own workflows |
| Tests | Commonly separated | Colocated with behavior | Colocated inside slices/segments | Colocated, except route-tree contract tests |
| Shared code | Generic folders tend to grow | Requires promotion discipline | Formally constrained by layers | Named app/client/infrastructure areas; promote only after reuse |
| Dependency rules | Usually implicit | Simple feature-to-infrastructure direction | Strong layer and slice rules | Simple direction plus explicit exceptions |
| Cost | Low initially, high navigation cost later | Low to moderate | Moderate to high taxonomy and enforcement cost | Low; depth grows with proven complexity |
| Barrels | Optional | Optional | Typical slice public API | No barrels; direct file imports |

## Lirna assessment

The former conceptual structure was already closer to feature folders than its
`components` name suggested:

- `components/sources-library` was the Source library feature.
- `components/source-admission` was the Source admission feature.
- `components/reading-workspace` was the Reading workspace feature and had earned
  capability folders such as `article`, `bibliography`, `citation-resolution`,
  `navigation`, `opening`, `position`, and `tools`.
- `components/annotations` supported the Reading workspace. It is a
  domain concept that may eventually be used by Owned-note surfaces, but that
  future reuse should not force a premature top-level slice now.
- `components/app-shell` was application composition, not a product feature.
- `clients` is typed transport infrastructure used by multiple features.
- `offline-working-set` is an explicit Lirna product capability with persistence,
  browser integration, lifecycle behavior, and UI. It is neither a generic util
  nor merely a Reading workspace subcomponent.
- `utils` combined unrelated application infrastructure such as query
  client setup and server transport concerns. These deserve focused names rather
  than a permanent miscellaneous bucket.
- `test-support` is appropriately application-wide only for helpers reused across
  feature boundaries. Feature fixtures and harnesses should stay in their feature.

The route files currently do more than declare topology. For example, the Source
library route coordinates fetching, deletion, Offline working set reconciliation,
and optimistic visual removal, while the Source-state route translates URL state
into Reading workspace navigation. The latter is appropriate route adaptation;
the former workflow is a candidate to move behind the Source library feature
when this structure is adopted.

## Concrete target tree

This is a target ownership map, not a requirement to move every file in one
change. Names shown under the large Reading workspace are representative of the
current capability split; preserve additional colocated tests and implementation
files in the matching capability.

```text
apps/web/src/
├── main.tsx
├── routeTree.gen.ts                         # generated; never hand-organize
├── routes/                                  # TanStack Router topology
├── app/components/                          # providers and global shell
├── clients/                                 # typed backend transport
├── infrastructure/
│   ├── queryClient.ts
│   └── server/
│       ├── components/ErrorMessage.tsx
│       ├── error.ts
│       └── url.ts
├── test-support/                            # cross-feature test helpers only
└── features/
    ├── source-library/
    │   ├── components/
    │   │   ├── Page.tsx
    │   │   ├── Header.tsx
    │   │   ├── Toolbar.tsx
    │   │   ├── Card.tsx
    │   │   └── ...
    │   ├── format.ts
    │   └── types.ts
    ├── source-admission/
    │   ├── components/{Preview,Decision,CaptureDetails}.tsx
    │   ├── hooks/useAdmission.ts
    │   └── test-support/
    ├── offline-working-set/
    │   ├── components/{Inventory,Panel}.tsx
    │   └── ...                              # persistence and lifecycle modules
    └── reading-workspace/
        ├── components/{Workspace,View,Toc}.tsx
        ├── hooks/
        ├── annotations/{components,hooks,test-support}/
        ├── article/components/
        ├── bibliography/{components,hooks}/
        ├── citation-resolution/{components,hooks}/
        ├── navigation/{components,hooks}/
        ├── opening/hooks/
        ├── position/hooks/
        ├── tools/{components,hooks}/
        └── test-support/
```

Keep route-tree integration tests that specifically validate TanStack route
behavior under `apps/web/tests/routes`. Move a test beside a feature when it can
exercise the feature through feature props without depending on the generated
route tree.

## Import examples

Use direct paths and descriptive exported symbols:

```tsx
// routes/sources/index.tsx
import { LibraryPage } from "@/features/source-library/components/Page";

// routes/sources/admission.tsx
import { SepAdmissionPreview } from "@/features/source-admission/components/Preview";

// routes/sources/$sourceId/$stateId.tsx
import { ReadingWorkspace } from "@/features/reading-workspace/components/Workspace";
import { SourceInformation } from "@/features/reading-workspace/tools/components/SourceInformation";

// Inside the Reading workspace, use relative full paths.
import { ReadingArticlePane } from "../article/components/Pane";
import { ReadingToolsPanel } from "../tools/components/Panel";
```

Do not add `features/source-library/index.ts`, capability-level barrels, or a
global `features/index.ts`. Directory context reduces filename repetition;
explicit symbols preserve useful names in JSX, stack traces, and search results.

## Dependency direction

Use this simple direction rather than FSD's full layer matrix:

```text
main/routes/app
    -> features
    -> offline-working-set
    -> clients/infrastructure
    -> @lirna/ui

features
    -> clients/infrastructure
    -> offline-working-set only where the capability is genuinely required
    -> @lirna/ui

clients/infrastructure/offline-working-set
    -/-> features
```

Avoid feature-to-feature imports by default. Compose features in route or app
code. The initial exception is code that is currently part of the Reading
workspace: keep Annotations nested there. If a second independent surface begins
using substantial Annotation behavior, promote a cohesive Annotation capability
then, with an interface based on the two real callers.

## Applied conventions

The migration applies these rules:

1. Product code lives under `features/<feature>`.
2. React modules live under the nearest owning `components/` folder and use the
   directory context to avoid redundant filenames.
3. Feature hooks and fixtures stay with their feature.
4. Route filenames remain unchanged and route files retain URL concerns.
5. Former `utils` modules now have focused infrastructure destinations; there is
   no replacement catch-all utility bucket.
6. Imports remain direct, with no feature or capability barrels.
