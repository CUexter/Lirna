# Architectural visualization for module-deepening opportunities

Research date: 2026-08-21

## Recommendation

Adopt **dependency-cruiser** as Lirna's first architecture visualizer, subject to
a short local trial. Use **DependaCharta** as the runner-up if maintainers value
interactive expand-and-collapse exploration enough to accept a Java 17 or Docker
analysis step.

Do not build a custom dashboard. dependency-cruiser already provides the useful
primitive Lirna is missing: one resolved module graph that can be rendered as a
package overview, narrowed to a seam and preserved as JSON, Mermaid, DOT, D2,
HTML matrix, or CI-oriented output. Its `archi` reporter collapses dependencies
to chosen folders, `ddot` summarizes folders, `focus` retains a module and its
neighbors, and `reaches` retains transitive dependents
([official CLI](https://github.com/sverweij/dependency-cruiser/blob/main/doc/cli.md#--output-type-specify-the-output-format),
[official filtering options](https://github.com/sverweij/dependency-cruiser/blob/main/doc/options-reference.md#report-level-options)).
Its metrics report includes afferent coupling, efferent coupling, and
instability for modules and folders
([official metrics documentation](https://github.com/sverweij/dependency-cruiser/blob/main/doc/cli.md#metrics---generate-a-report-with-stability-metrics-for-each-folder)).

This recommendation is intentionally narrower than "find deep modules
automatically." No evaluated tool reads a package's behavioral responsibility,
invariants, ordering constraints, error contract, or learning cost. None of the
evaluated visualizers natively classifies Lirna's package `exports` as intended
interfaces and all other reachable files as implementation. The graph should
nominate seams for human review; package manifests, Fallow, and CodeGraph should
then supply evidence the graph does not contain.

This is a tool-selection recommendation, not an accepted architecture decision.
No candidate was installed or added to the repository during this research.

## Why this fits Lirna

Lirna is a private Bun workspace whose applications and packages live under
`apps/*` and `packages/*`; it currently uses TypeScript 6.0.3 and Bun 1.3.13
([root package](../package.json)). dependency-cruiser 18.2.0 declares support
for TypeScript `>=2.0.0 <7.0.0` and requires Node `^22 || ^24 || >=26`
([upstream package](https://github.com/sverweij/dependency-cruiser/blob/v18.2.0/package.json)).
The local Node version observed during this research was 24.18.1, so the trial
should run the analyzer with Node while continuing to use Bun as Lirna's package
manager. Bun-runtime compatibility should not be assumed merely because Bun can
install the package.

The visualizer complements rather than replaces the existing checks:

- Fallow already rejects cycles, boundary violations, unresolved and unlisted
  dependencies, and duplicate exports, while warning about unused code
  ([Fallow configuration](../.fallowrc.json)). Its zones enforce package-level
  directions such as `api -> db`, but an allowed zone edge does not show whether
  the caller entered through an intentionally narrow interface.
- `scripts/check-architecture.ts` enforces selected workspace, import, route,
  environment, and UI policies; it is a policy checker rather than a navigable
  dependency picture ([architecture checker](../scripts/check-architecture.ts)).
- CodeGraph is better for a focused symbol call path and blast radius after a
  suspicious seam is selected. dependency-cruiser's artifacts are better suited
  to repeatable whole-repository and folder-level comparison.
- Package manifests provide interface intent that the visualizer does not. For
  example, `@lirna/api` exposes five explicit keys
  ([API manifest](../packages/api/package.json)), while `@lirna/db` exposes `.`
  and the broad `./*` pattern ([database manifest](../packages/db/package.json)).
  Node documents `exports` as the mechanism for defining package entry points
  and encapsulating unexported subpaths
  ([Node package entry points](https://nodejs.org/api/packages.html#package-entry-points)).

The first graph should therefore test a concrete question: does `@lirna/db` act
as a cohesive implementation behind a small interface, or are consumers coupled
directly to schema and test-support files through its wildcard export? The graph
can show exact incoming edges and their concentration. The manifest determines
which of those edges are explicit or wildcard-backed. A maintainer must decide
whether each subpath is a legitimate interface or leaked implementation.

## Weighted comparison

Scores are judgments for Lirna, not vendor benchmarks. Each category is scored
from 1 (poor) to 5 (strong), multiplied by the stated weight. "Signals" covers
exact edges, cycles, fan-in/fan-out or equivalent coupling evidence, and support
for spotting deep imports. "Operations" covers local use, privacy, reproducible
artifacts, setup burden, and CI suitability.

| Candidate | Graph fit 25% | TS resolution 20% | Navigation 15% | Signals 15% | Operations 15% | Maintenance 10% | Weighted |
|---|---:|---:|---:|---:|---:|---:|---:|
| **dependency-cruiser** | 5 | 5 | 3 | 5 | 4 | 5 | **4.55** |
| **DependaCharta** | 4 | 4 | 5 | 4 | 3 | 4 | **4.05** |
| Skott | 4 | 4 | 4 | 3 | 4 | 4 | 3.85 |
| CodeCharta | 3 | 3 | 5 | 4 | 3 | 5 | 3.75 |
| Nx Project Graph | 3 | 4 | 5 | 2 | 4 | 5 | 3.70 |
| Madge | 3 | 4 | 2 | 3 | 4 | 2 | 3.15 |
| CodeSee Maps | 4 | 3 | 5 | 3 | 1 | 2 | 3.10 |
| Sourcetrail | 4 | 3 | 5 | 3 | 2 | 1 | 3.15 |

The close numerical results do not make the tools interchangeable. The decisive
factor is whether the artifact preserves Lirna's exact file edges while allowing
the same graph to be collapsed to package seams and narrowed to one candidate.
dependency-cruiser does that with the least new conceptual machinery.

## Candidate assessments

### 1. dependency-cruiser: select

**Strengths**

- It analyzes JavaScript and TypeScript dependencies and uses configurable
  resolution, including a TypeScript project option
  ([official CLI](https://github.com/sverweij/dependency-cruiser/blob/main/doc/cli.md#--ts-config-use-a-typescript-configuration-file-project)).
- It preserves module dependencies and dependents in JSON, including circular
  paths and dependency metadata
  ([official output format](https://github.com/sverweij/dependency-cruiser/blob/main/doc/output-format.md)).
- `collapse`, `focus`, and `reaches` support the two views needed here: a small
  workspace/package overview and an exact seam investigation
  ([official CLI](https://github.com/sverweij/dependency-cruiser/blob/main/doc/cli.md#options-also-available-in-dependency-cruiser-configurations)).
- It emits stable text artifacts and graph-source formats suitable for local use
  and CI. DOT gives the richest graph, Mermaid renders in GitHub and GitLab, D2
  supports multiple layout engines, and the HTML reporter is a dependency matrix
  ([official reporters](https://github.com/sverweij/dependency-cruiser/blob/main/doc/cli.md#--output-type-specify-the-output-format)).
- It is MIT-licensed and actively released; version 18.2.0 was current during
  this research
  ([license](https://github.com/sverweij/dependency-cruiser/blob/v18.2.0/LICENSE),
  [releases](https://github.com/sverweij/dependency-cruiser/releases)).
- Analysis is local. Source code and graph data need not leave the machine.

**Limits**

- DOT/SVG rendering requires Graphviz, which was not installed locally during
  this research. Mermaid and JSON allow a zero-Graphviz trial; Graphviz should
  only be added if the trial proves useful.
- Its wrapped DOT page offers links and basic interaction, not DependaCharta's
  exploratory package/file expansion. A full unfiltered file graph can still
  become a hairball.
- Coupling metrics are structural proxies. High fan-out is expected for a
  composition root, and high fan-in can identify a useful shared abstraction
  rather than a defect.
- It does not supply a semantic package-interface model. Exact imports must be
  compared with Lirna's `exports`; broad wildcard exports still require judgment.
- It overlaps with Fallow on cycles and dependency policies. Lirna should use it
  for visualization and evidence, not duplicate every existing quality gate.

### 2. DependaCharta: runner-up

DependaCharta is the strongest human exploration experience evaluated. Its
visualization nests files in packages, supports expanding and collapsing the
hierarchy, aggregates edges between collapsed containers, and provides filters
for cycles and architectural feedback dependencies
([official repository](https://github.com/MaibornWolff/DependaCharta),
[visualization README](https://github.com/MaibornWolff/DependaCharta/tree/main/visualization)).
Its analyzer supports TypeScript and TSX, and its source implements resolution
for `tsconfig`/`jsconfig` paths, bundler aliases, and module-federation remotes
([analyzer README](https://github.com/MaibornWolff/DependaCharta/tree/main/analysis),
[alias resolver](https://github.com/MaibornWolff/DependaCharta/blob/main/analysis/src/main/kotlin/de/maibornwolff/dependacharta/pipeline/analysis/analyzers/common/AliasPathResolver.kt)).

It remains second because the analyzer requires Java 17 or Docker, its generated
model and web visualization add more moving parts than a Node-native CLI, and
it is still a young `0.x` project
([analysis instructions](https://github.com/MaibornWolff/DependaCharta/tree/main/analysis),
[releases](https://github.com/MaibornWolff/DependaCharta/releases)). It is
BSD-3-Clause licensed and can run locally
([license](https://github.com/MaibornWolff/DependaCharta/blob/main/LICENSE)).
It also does not interpret package `exports` as Lirna's interface boundary.

Promote it over dependency-cruiser only if the trial establishes that maintainers
will repeatedly explore package/file neighborhoods and that static Mermaid or
SVG views are too cumbersome.

### 3. Skott: credible lightweight alternative

Skott supports JavaScript and TypeScript, exposes cycle and graph analysis, can
scope analysis with a working directory, and includes a local web application
for visualization
([official README](https://github.com/antoine-coulon/skott#readme)). It is
MIT-licensed ([license](https://github.com/antoine-coulon/skott/blob/main/LICENSE)).
It is a reasonable Node-native fallback if dependency-cruiser's output is too
static.

It ranks below DependaCharta because its default graph is less centered on nested
workspace-package exploration, and below dependency-cruiser because it provides
less built-in package/folder coupling reporting and artifact variety for this
specific review. It also does not make `exports` an interface/deep-import model.

### 4. CodeCharta: metrics companion, not first dependency visualizer

CodeCharta's software-map metaphor is strong for navigating hierarchical code
metrics, and its UnifiedParser supports TypeScript and TSX
([official documentation](https://docs.codecharta.com/),
[UnifiedParser documentation](https://docs.codecharta.com/parser/unifiedparser)).
The visualization can filter edges and compare metric-rich code maps
([official repository](https://github.com/MaibornWolff/codecharta)). It is
BSD-3-Clause licensed
([license](https://github.com/MaibornWolff/codecharta/blob/main/LICENSE)).

Its primary visual grammar is a code city whose buildings encode metrics, not a
small seam-first dependency diagram. That makes it better for hotspot and size
exploration than for answering "which exact consumer bypasses this package
interface?" It also introduces an analysis pipeline and map format that overlap
more with Fallow's health and complexity evidence than dependency-cruiser's
focused edge artifacts do.

### 5. Nx Project Graph: wrong granularity

Nx provides an interactive project graph with search, focus, grouping, and
affected-project views
([official project-graph documentation](https://nx.dev/features/explore-graph)).
Nx is actively maintained and MIT-licensed
([repository](https://github.com/nrwl/nx),
[license](https://github.com/nrwl/nx/blob/master/LICENSE)).

Its natural node is an Nx project. Lirna needs exact file edges inside and across
workspace packages to recognize bypasses and weak internal seams. Introducing Nx
for a higher-level graph would also add a workspace model and tooling layer that
Lirna otherwise does not use. It is credible for teams already using Nx, but not
the minimal choice here.

### 6. Madge: reject for the primary role

Madge can generate dependency graphs, list circular dependencies, emit JSON, and
process TypeScript through a supplied `tsconfig`
([official README](https://github.com/pahen/madge#readme)). It is MIT-licensed
([license](https://github.com/pahen/madge/blob/master/LICENSE)).

It is easy to understand but lacks dependency-cruiser's configurable package
collapse, folder metrics, richer report formats, and focused/transitive
navigation. Its latest published release was 8.0.0 in August 2024 during this
research, which is a weaker maintenance signal than the selected candidates
([releases](https://github.com/pahen/madge/releases)). It remains useful for a
one-off cycle picture, but Fallow already covers cycles.

### 7. CodeSee Maps: availability and privacy risk

CodeSee's documentation describes interactive maps with collapsible directories
and dependency relationships, which is conceptually close to the desired human
workflow ([Maps documentation](https://docs.codesee.io/docs/maps)). Its service
is hosted and stores repository-derived metadata under its documented data model
([security and privacy documentation](https://docs.codesee.io/docs/security-and-data-privacy)).

Current public self-service availability could not be established: documentation
remained online, while the application endpoint presented a Cloudflare Access
login during this research ([application](https://app.codesee.io/)). Pricing and
an acceptable private-source path were also not verifiable from accessible
first-party material. Do not select a hosted service for Lirna's private source
until availability, data handling, retention, cost, export, and deletion terms
can all be confirmed. This is an availability finding, not a claim that the
product has been discontinued.

### 8. Sourcetrail: reject as archived

Sourcetrail offered strong interactive source exploration, but its official
repository was archived on 2021-12-14 and is read-only
([official repository](https://github.com/CoatiSoftware/Sourcetrail)). An
archived code browser is not an appropriate new architecture dependency.

## Interface-depth limitation

The visualizer can compute or preserve:

- Resolved file-to-file imports and re-exports.
- Incoming and outgoing coupling at file or collapsed-folder level.
- Cycles and concrete cycle paths.
- Package/folder clusters and focused neighborhoods.
- Structural metrics and reproducible graph artifacts.

It cannot decide:

- Whether `@lirna/db/schema/sources` is a legitimate public entry point or a
  persistence detail that a deeper operation should hide.
- Whether a high-fan-in utility is a strong abstraction or merely shared
  mechanism.
- Whether a package's interface is simple to learn relative to the behavior it
  hides.
- Whether two frequently connected files share one responsibility.
- Whether a composition root's high fan-out is appropriate.

Use package `exports` as explicit interface evidence, Fallow as the existing
policy/health gate, and CodeGraph for symbol-level investigation. Do not combine
their outputs into a universal "module depth score." A useful visualization
leads a maintainer to a concrete design question; it does not answer that
question by itself.

## Minimal trial

Do not commit configuration or install Graphviz for the first pass. If the trial
is approved, add dependency-cruiser as a pinned development dependency with Bun,
but execute its documented Node entry point because the package declares a Node
runtime range:

```sh
bun add --dev --exact dependency-cruiser@18.2.0

node node_modules/dependency-cruiser/bin/dependency-cruise.mjs \
  apps packages \
  --no-config \
  --include-only '^(apps|packages)/' \
  --exclude '(routeTree\.gen\.ts|\.(test|spec)\.[cm]?[jt]sx?)$' \
  --collapse '^(apps|packages)/[^/]+' \
  --output-type mermaid \
  --output-to /tmp/lirna-packages.mmd

node node_modules/dependency-cruiser/bin/dependency-cruise.mjs \
  apps packages \
  --no-config \
  --include-only '^(apps|packages)/' \
  --exclude '(routeTree\.gen\.ts|\.(test|spec)\.[cm]?[jt]sx?)$' \
  --metrics \
  --output-type json \
  --output-to /tmp/lirna-dependencies.json

node node_modules/dependency-cruiser/bin/dependency-cruise.mjs \
  apps packages \
  --no-config \
  --include-only '^(apps|packages)/' \
  --exclude 'routeTree\.gen\.ts$' \
  --focus '^packages/db/' \
  --focus-depth 1 \
  --output-type mermaid \
  --output-to /tmp/lirna-db.mmd
```

These commands follow dependency-cruiser's documented directory, filtering,
collapse, focus, metrics, JSON, and Mermaid interfaces
([official CLI](https://github.com/sverweij/dependency-cruiser/blob/main/doc/cli.md)).
They deliberately write temporary artifacts outside the repository. Tests are
excluded from the overview and full JSON to reduce noise, but retained in the
focused database run so test-support imports remain visible.

Accept the tool only if the trial demonstrates all of the following:

1. Workspace imports resolve to Lirna files rather than appearing as unresolved
   external package names.
2. The collapsed graph is readable without hiding the `api -> db` and
   `auth -> db` relationships.
3. The focused database graph identifies exact consumers of schema and
   test-support modules.
4. JSON preserves enough evidence to reproduce every displayed edge.
5. A maintainer can move from overview to one design question in under two
   minutes.

Reject the trial if it produces only a force-directed hairball, resolves Bun
workspace packages incorrectly, or adds no useful evidence beyond Fallow and
CodeGraph. If only navigation fails, trial DependaCharta next rather than writing
a custom renderer.

## Decision boundary

The recommended adoption scope is one on-demand local command and disposable
artifacts. Do not initially add a CI gate, commit generated graphs, duplicate
Fallow's rules, or prescribe a refactor from a metric. If repeated use proves
valuable, the smallest next step is a root script that emits one collapsed
overview and one focused graph to a CI artifact. Any repository configuration
should then record only resolution, filtering, and presentation options needed
to make those outputs deterministic.
