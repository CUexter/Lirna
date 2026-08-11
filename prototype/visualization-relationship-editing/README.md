# Visualization and relationship editing prototype

Throwaway prototype for **Prototype visualization and relationship editing**.
It compares three concept-scoped first-party visualization forms on one route:

- `A`: interactive explanatory diagram
- `B`: Manim-style animated explanation
- `C`: embedded Excalidraw canvas with an AI-generated native scene

Each variant explains one bounded concept while allowing Nathan to navigate
between conceptual depth and the Lirna objects supporting it. Relationship
changes are simulated in memory and distinguish concept semantics, visual
composition, evidence attachment, and links to supporting objects.

Obsidian-style whole-Vault Graph View and Dataview-like metadata queries are
deliberately excluded. They are separate topology and query-tooling decisions,
not concept Visualizations.

Run from the repository root:

```sh
python -m http.server 8000
```

Then open:

```text
http://localhost:8000/prototype/visualization-relationship-editing/
```

Use the bottom arrows or `?variant=A|B|C`. Switch conceptual depth with the top
tabs and use **Try editing this relationship** to inspect possible authority
boundaries. No files or durable data are changed.

The committed `embed/` directory is the disposable static build of the real
Excalidraw integration. To rebuild it after changing the integration source:

```sh
npm install
npm run build
```
