import type { InquiryOutputs } from "@/clients/inquiry";

import { readingReferences } from "./reading-reference-fixture";

type Reading = InquiryOutputs["sources"]["reading"];
export type ReadingComponent = Reading["components"][number];

export const capturedAt = "2026-08-20T00:00:00.000Z";

function syntheticFigure() {
  return {
    id: "synthetic-figure",
    caption: [{ kind: "text" as const, text: "Synthetic figure" }],
    description: {
      text: [{ kind: "text" as const, text: "Figure description" }],
    },
    dimensions: { width: 20, height: 10 },
    diagnostics: [
      {
        level: "warning" as const,
        code: "missing-semantic-asset",
        message: "The semantic figure asset was not retained.",
        source: {
          componentIdentity: "article",
          locator: "#synthetic-figure",
        },
      },
    ],
  };
}

export function readingComponent(
  overrides: Partial<ReadingComponent> = {},
): ReadingComponent {
  return {
    identity: "article",
    role: "main",
    label: "Article",
    order: 0,
    requestedUrl: "https://plato.stanford.edu/entries/synthetic/",
    finalUrl: "https://plato.stanford.edu/entries/synthetic/",
    retrievedAt: capturedAt,
    sha256: "a".repeat(64),
    toc: readingReferences.toc,
    introductoryBlocks: [
      {
        kind: "paragraph",
        children: [{ kind: "text", text: "A synthetic Source state passage." }],
      },
      {
        kind: "paragraph",
        children: [
          { kind: "text", text: "See " },
          {
            kind: "link",
            href: "#Poss",
            internal: true,
            children: [{ kind: "text", text: "Poss" }],
          },
          { kind: "text", text: " and " },
          {
            kind: "link",
            href: "#Ness",
            internal: true,
            children: [{ kind: "text", text: "Ness" }],
          },
          { kind: "text", text: "." },
        ],
      },
    ],
    sections: [
      {
        id: "claim",
        title: [{ kind: "text", text: "A synthetic claim" }],
        level: 2,
        blocks: [
          {
            kind: "paragraph",
            children: [
              { kind: "text", text: "Synthetic publication content " },
              { kind: "anchor", id: "note-1", children: [] },
              { kind: "anchor", id: "proposition-1", children: [] },
              { kind: "anchor", id: "Poss", children: [] },
              { kind: "anchor", id: "Ness", children: [] },
              {
                kind: "link",
                href: "notes.html#1",
                internal: false,
                children: [{ kind: "text", text: "[note 1]" }],
              },
              {
                kind: "link",
                href: "notes.html#4",
                internal: false,
                children: [{ kind: "text", text: "[note 4]" }],
              },
              {
                kind: "link",
                href: "notes.html#7",
                internal: false,
                children: [{ kind: "text", text: "[note 7]" }],
              },
              {
                kind: "link",
                href: "https://plato.stanford.edu/entries/synthetic.html#proposition-1",
                internal: false,
                children: [{ kind: "text", text: "[proposition 1]" }],
              },
              {
                kind: "citation",
                mentionId: "citation-one",
                label: "[1]",
                state: "resolved",
                candidates: ["entry-one"],
                rule: "synthetic rule",
                evidence: "synthetic evidence",
                entryId: "entry-one",
              },
            ],
          },
          {
            kind: "figure",
            figure: syntheticFigure(),
          },
          {
            kind: "paragraph",
            children: [{ kind: "text", text: "After the synthetic figure." }],
          },
          {
            kind: "paragraph",
            children: [
              {
                kind: "text",
                text: "Compare §2, §2.1, and §2.1.1 with numbered claim (1).",
              },
            ],
          },
        ],
        children: [],
      },
      ...readingReferences.sections,
    ],
    figures: [syntheticFigure()],
    bibliography: [
      {
        id: "references",
        title: "Publisher bibliography",
        entries: [
          {
            id: "entry-one",
            label: "[1]",
            text: "Ada Lovelace. Synthetic publisher entry.",
            anchor: "#entry-one",
            links: [
              {
                label: "Publisher record",
                href: "https://publisher.example/entry-one",
                onlineOnly: true,
              },
            ],
            provenance: { componentIdentity: "article", locator: "#entry-one" },
          },
          {
            id: "entry-two",
            label: "[2]",
            text: "Grace Hopper. Another publisher entry.",
            anchor: "#entry-two",
            links: [],
            provenance: { componentIdentity: "article", locator: "#entry-two" },
          },
        ],
        provenance: { componentIdentity: "article", locator: "#references" },
      },
    ],
    plainText:
      "A synthetic Source state passage.\n\nA synthetic claim\n\nSynthetic publication content [note 1] [proposition 1] [1]\n\nSynthetic figure Figure description\n\nAfter the synthetic figure.\n\nCompare §2, §2.1, and §2.1.1 with numbered claim (1).\n\nA referenced claim\n\n(1) Numbered target context.\n\nA nested claim\n\nA deeply nested claim",
    ...overrides,
  };
}
