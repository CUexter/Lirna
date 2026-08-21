export function readingPayload(sourceId: string, stateId: string) {
  const shared = {
    role: "main" as const,
    label: "Article",
    order: 0,
    requestedUrl: "https://example.com/article",
    finalUrl: "https://example.com/article",
    retrievedAt: "2026-08-18T10:00:00.000Z",
    sha256: "a".repeat(64),
    toc: [{ id: "passage", title: "Passage", children: [] }],
    introductoryBlocks: [],
    sections: [],
    figures: [],
    bibliography: [],
  };
  const main = {
    ...shared,
    identity: "article:main",
    sections: [
      {
        id: "passage",
        title: [
          {
            kind: "citation" as const,
            mentionId: "citation-mention-1",
            label: "Read",
            state: "unresolved" as const,
            candidates: [],
            rule: "synthetic",
            evidence: "Read",
          },
          { kind: "text" as const, text: " evidence carefully." },
        ],
        level: 2,
        blocks: [],
        children: [],
      },
    ],
    plainText: "Read evidence carefully.",
  };
  const supplement = {
    ...shared,
    identity: "article:supplement",
    role: "supplement" as const,
    label: "Supplement",
    order: 1,
    toc: [{ id: "supplement-passage", title: "Supplement", children: [] }],
    sections: [
      {
        id: "supplement-passage",
        title: [{ kind: "text" as const, text: "Separate component text." }],
        level: 2,
        blocks: [],
        children: [],
      },
    ],
    plainText: "Separate component text.",
  };
  return {
    version: 1,
    source: {
      id: sourceId,
      stateId,
      title: "Evidence",
      authors: [],
      publisher: "Example",
      publicationHistory: [],
      canonicalUrl: main.finalUrl,
      observation: "submitted",
      admittedAt: main.retrievedAt,
    },
    mainComponent: {
      identity: main.identity,
      requestedUrl: main.requestedUrl,
      finalUrl: main.finalUrl,
      retrievedAt: main.retrievedAt,
      sha256: main.sha256,
    },
    components: [main, supplement],
    capture: {
      completeness: "complete",
      readingReadiness: "ready",
      readinessReasons: [],
      diagnostics: [],
    },
    toc: main.toc,
    introductoryBlocks: main.introductoryBlocks,
    sections: main.sections,
    plainText: main.plainText,
    provenance: {
      adapter: { id: "sep", version: "1" },
      parser: { id: "parse5", version: "7.3.0" },
      inputResourceHashes: [],
    },
  };
}
