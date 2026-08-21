import type { InquiryOutputs } from "@/clients/inquiry";

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
    toc: [{ id: "claim", title: "A synthetic claim", children: [] }],
    introductoryBlocks: [
      {
        kind: "paragraph",
        children: [{ kind: "text", text: "A synthetic Source state passage." }],
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
        ],
        children: [],
      },
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
      "A synthetic Source state passage.\n\nA synthetic claim\n\nSynthetic publication content [1]\n\nSynthetic figure Figure description\n\nAfter the synthetic figure.",
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
        bibliography: [],
        figures: [],
        introductoryBlocks: [
          {
            kind: "paragraph",
            children: [{ kind: "text", text: "First supplement content." }],
          },
        ],
        sections: [],
        toc: [],
        plainText: "First supplement content.",
      }),
      component({
        identity: "supplement-two",
        role: "supplement",
        label: "Supplement two",
        parentIdentity: "article",
        order: 2,
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
