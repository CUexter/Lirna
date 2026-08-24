import { expect, test } from "bun:test";
import { render } from "@testing-library/react";

import { CitationActions, Figure, ReadingSection } from "./content";

const missingAssetDiagnostic = {
  level: "warning" as const,
  code: "missing-semantic-asset",
  message: "The semantic figure asset was not retained.",
  source: { componentIdentity: "active:/", locator: "<img>" },
};

test("hides semantic diagnostics while preserving figure content", () => {
  const view = render(
    <Figure
      figure={{
        id: "figure-1",
        caption: [],
        description: {
          text: [{ kind: "text", text: "SEP man icon" }],
        },
        dimensions: {},
        diagnostics: [missingAssetDiagnostic],
      }}
    />,
  );

  expect(view.getByText("SEP man icon")).toBeTruthy();
  expect(view.queryByText("Rendering note: missing-semantic-asset")).toBeNull();
});

test("renders supported TeX as accessible mathematical notation", () => {
  const view = render(
    <ReadingSection
      section={{
        id: "notation",
        title: [{ kind: "text", text: "Notation" }],
        level: 2,
        blocks: [
          {
            kind: "paragraph",
            children: [{ kind: "tex", source: "\\frac{x}{2}", display: false }],
          },
          {
            kind: "paragraph",
            children: [{ kind: "tex", source: "x^2", display: true }],
          },
        ],
        children: [],
      }}
    />,
  );

  expect(view.container.querySelectorAll(".katex")).toHaveLength(2);
  expect(view.container.querySelector(".katex-display")).toBeTruthy();
  expect(view.queryByTitle("Original TeX source")).toBeNull();
  expect(view.container.querySelector("math")).toBeTruthy();
});

test("places section link targets on their headings", () => {
  const view = render(
    <ReadingSection
      section={{
        id: "linked-section",
        title: [{ kind: "text", text: "Linked section" }],
        level: 2,
        blocks: [
          {
            kind: "paragraph",
            children: [{ kind: "text", text: "Section body." }],
          },
        ],
        children: [],
      }}
    />,
  );

  const heading = view.getByRole("heading", { name: "Linked section" });
  expect(heading.id).toBe("linked-section");
  expect(heading.parentElement?.id).toBe("");
});

test("preserves TeX source when mathematical notation cannot be rendered", () => {
  const view = render(
    <ReadingSection
      section={{
        id: "notation",
        title: [{ kind: "text", text: "Notation" }],
        level: 2,
        blocks: [
          {
            kind: "paragraph",
            children: [{ kind: "tex", source: "\\unknown{x}", display: false }],
          },
        ],
        children: [],
      }}
    />,
  );

  expect(view.getByTitle("Original TeX source").textContent).toBe(
    "\\unknown{x}",
  );
  const fallback = view.container.querySelector('[data-rendering="degraded"]');
  expect(fallback).toBeTruthy();
  expect(fallback?.textContent).toContain(
    "Mathematical notation could not be rendered.",
  );
});

test("renders authored anchors without exposing citation resolution state", () => {
  const view = render(
    <CitationActions.Provider value={{ open: () => undefined }}>
      <ReadingSection
        section={{
          id: "links",
          title: [{ kind: "text", text: "Links" }],
          level: 2,
          blocks: [
            {
              kind: "paragraph",
              children: [
                {
                  kind: "anchor",
                  id: "note-1",
                  children: [{ kind: "text", text: "Target" }],
                },
                {
                  kind: "citation",
                  mentionId: "citation-one",
                  label: "[1]",
                  state: "resolved",
                  candidates: ["entry-one"],
                  rule: "test",
                  evidence: "test",
                  entryId: "entry-one",
                },
              ],
            },
          ],
          children: [],
        }}
      />
    </CitationActions.Provider>,
  );

  expect(view.container.querySelector("#note-1")?.textContent).toBe("Target");
  expect(
    view.getByRole("button", { name: "Citation: [1] (resolved)" }),
  ).toBeTruthy();
  expect(view.queryByText("resolved")).toBeNull();
});

test("separates a proposition number from its paragraph text", () => {
  const view = render(
    <ReadingSection
      section={{
        id: "propositions",
        title: [{ kind: "text", text: "Propositions" }],
        level: 2,
        blocks: [
          {
            kind: "paragraph",
            children: [
              { kind: "text", text: "(4)" },
              { kind: "text", text: "Not all John's pets are mammals." },
            ],
          },
        ],
        children: [],
      }}
    />,
  );

  expect(view.getByText("(4)").classList).toContain("mr-2");
});
