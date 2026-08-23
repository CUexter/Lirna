// biome-ignore lint/style/noExcessiveLinesPerFile: Reading route tests share this complete Source fixture.
import type { InquiryOutputs } from "@/clients/inquiry";

import { readingReferences } from "./-reading-reference-fixture";

export const sourceId = "10000000-0000-4000-8000-000000000000";
export const stateId = "20000000-0000-4000-8000-000000000000";

type Reading = InquiryOutputs["sources"]["reading"];
type Component = Reading["components"][number];

const capturedAt = "2026-08-20T00:00:00.000Z";

function component(overrides: Partial<Component> = {}): Component {
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
            figure: {
              id: "synthetic-figure",
              caption: [{ kind: "text", text: "Synthetic figure" }],
              description: {
                text: [{ kind: "text", text: "Figure description" }],
              },
              dimensions: { width: 20, height: 10 },
              diagnostics: [
                {
                  level: "warning",
                  code: "missing-semantic-asset",
                  message: "The semantic figure asset was not retained.",
                  source: {
                    componentIdentity: "article",
                    locator: "#synthetic-figure",
                  },
                },
              ],
            },
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
    figures: [
      {
        id: "synthetic-figure",
        caption: [{ kind: "text", text: "Synthetic figure" }],
        description: { text: [{ kind: "text", text: "Figure description" }] },
        dimensions: { width: 20, height: 10 },
        diagnostics: [
          {
            level: "warning",
            code: "missing-semantic-asset",
            message: "The semantic figure asset was not retained.",
            source: {
              componentIdentity: "article",
              locator: "#synthetic-figure",
            },
          },
        ],
      },
    ],
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

export function readingFixture(): Reading {
  const article = component();
  return {
    version: 1,
    source: {
      id: sourceId,
      stateId,
      title: "Synthetic Reading Source",
      authors: ["Ada Lovelace", "Grace Hopper"],
      publisher: "Synthetic Publisher",
      publicationHistory: ["First published 2026"],
      canonicalUrl: "https://plato.stanford.edu/entries/synthetic/",
      observation: "submitted",
      admittedAt: capturedAt,
    },
    mainComponent: {
      identity: article.identity,
      requestedUrl: article.requestedUrl,
      finalUrl: article.finalUrl,
      retrievedAt: capturedAt,
      sha256: article.sha256,
    },
    components: [
      article,
      component({
        identity: "supplement-one",
        role: "supplement",
        label: "Supplement one",
        parentIdentity: "article",
        order: 1,
        requestedUrl:
          "https://plato.stanford.edu/entries/synthetic/supplement-one.html",
        finalUrl:
          "https://plato.stanford.edu/entries/synthetic/supplement-one.html",
        bibliography: [
          {
            id: "supplement-references",
            title: "Publisher bibliography",
            entries: [
              {
                id: "supplement-entry-one",
                label: "[1]",
                text: "Supplement bibliography entry.",
                anchor: "#supplement-entry-one",
                links: [],
                provenance: {
                  componentIdentity: "supplement-one",
                  locator: "#supplement-entry-one",
                },
              },
            ],
            provenance: {
              componentIdentity: "supplement-one",
              locator: "#supplement-references",
            },
          },
        ],
        figures: [],
        introductoryBlocks: [
          {
            kind: "paragraph",
            children: [{ kind: "text", text: "First supplement content." }],
          },
          {
            kind: "paragraph",
            children: [
              { kind: "text", text: "Supplement citation context " },
              {
                kind: "citation",
                mentionId: "supplement-citation-one",
                label: "[1]",
                state: "resolved",
                candidates: ["supplement-entry-one"],
                rule: "synthetic rule",
                evidence: "synthetic evidence",
                entryId: "supplement-entry-one",
              },
            ],
          },
        ],
        sections: [],
        toc: [],
        plainText:
          "First supplement content.\n\nSupplement citation context [1]",
      }),
      component({
        identity: "supplement-two",
        role: "supplement",
        label: "Supplement two",
        parentIdentity: "article",
        order: 2,
        requestedUrl:
          "https://plato.stanford.edu/entries/synthetic/supplement-two.html",
        finalUrl:
          "https://plato.stanford.edu/entries/synthetic/supplement-two.html",
        bibliography: [],
        figures: [],
        introductoryBlocks: [
          {
            kind: "paragraph",
            children: [{ kind: "text", text: "Second supplement content." }],
          },
        ],
        sections: [],
        toc: [],
        plainText: "Second supplement content.",
      }),
      component({
        identity: "notes",
        role: "notes",
        label: "Notes",
        parentIdentity: "article",
        order: 3,
        requestedUrl: "https://plato.stanford.edu/entries/synthetic/notes.html",
        finalUrl: "https://plato.stanford.edu/entries/synthetic/notes.html",
        bibliography: [],
        figures: [],
        introductoryBlocks: [
          {
            kind: "paragraph",
            children: [
              {
                kind: "anchor",
                id: "1",
                children: [
                  {
                    kind: "link",
                    href: "index.html#note-1",
                    internal: false,
                    children: [{ kind: "text", text: "1." }],
                  },
                ],
              },
              {
                kind: "link",
                href: "https://plato.stanford.edu/entries/synthetic.html#proposition-1",
                internal: false,
                children: [{ kind: "text", text: "Back to proposition 1" }],
              },
              { kind: "text", text: " Publisher-authored note." },
              {
                kind: "citation",
                label: "[1]",
                state: "resolved",
                mentionId: "notes-citation-one",
                candidates: ["entry-one"],
                rule: "synthetic rule",
                evidence: "synthetic evidence",
                entryId: "entry-one",
              },
              { kind: "text", text: " See §1 and numbered claim (1)." },
            ],
          },
          {
            kind: "paragraph",
            children: [
              { kind: "anchor", id: "4", children: [] },
              { kind: "text", text: "4. Fourth publisher-authored note." },
            ],
          },
          {
            kind: "paragraph",
            children: [
              { kind: "anchor", id: "7", children: [] },
              { kind: "text", text: "7. Seventh publisher-authored note." },
            ],
          },
        ],
        sections: [],
        toc: [],
        plainText:
          "1. Publisher-authored note. [1] See §1 and numbered claim (1).\n\n4. Fourth publisher-authored note.\n\n7. Seventh publisher-authored note.",
      }),
    ],
    capture: {
      completeness: "partial",
      readingReadiness: "degraded",
      readinessReasons: ["One optional component was unavailable."],
      diagnostics: [
        {
          level: "warning",
          code: "synthetic-capture-warning",
          message: "Synthetic capture warning.",
          source: { componentIdentity: "article", locator: "capture" },
        },
      ],
    },
    toc: article.toc,
    introductoryBlocks: article.introductoryBlocks,
    sections: article.sections,
    plainText: article.plainText,
    provenance: {
      adapter: { id: "sep", version: "1" },
      parser: { id: "parse5", version: "7.3.0" },
      inputResourceHashes: [{ identity: "article", sha256: article.sha256 }],
    },
  };
}
