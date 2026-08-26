export function candidateFixture(valid: boolean) {
  return {
    id: "60000000-0000-4000-8000-000000000000",
    sourceStateId: "20000000-0000-4000-8000-000000000000",
    kind: "sep-reading-v1" as const,
    previousDerivativeId: "40000000-0000-4000-8000-000000000000",
    valid,
    generation: {
      version: 2,
      parser: { id: "parse5", version: "7.3.0" },
      renderer: { id: "lirna-reading-react", version: "1" },
      inputResourceHashes: [{ identity: "article", sha256: "a".repeat(64) }],
    },
    validation: {
      status: valid ? ("valid" as const) : ("invalid" as const),
      checks: [
        {
          subject: "typed-structure" as const,
          status: valid ? ("passed" as const) : ("failed" as const),
          messages: valid ? [] : ["Invalid structure"],
        },
      ],
    },
    comparison: {
      baselineDerivativeId: "40000000-0000-4000-8000-000000000000",
      semantic: { changedComponents: [] },
      structure: [
        {
          subject: "components" as const,
          before: 1,
          after: 1,
          beforeSha256: "a".repeat(64),
          afterSha256: "a".repeat(64),
        },
      ],
      diagnostics: { added: ["warning:new"], removed: [] },
      relocations: [
        {
          recordType: "annotation" as const,
          recordId: "annotation-1",
          classification: "unresolved" as const,
          original: { componentIdentity: "article" },
          candidates: 0,
          reason: "No passage matches the original quote and context.",
        },
        {
          recordType: "reading-position" as const,
          recordId: "position-1",
          classification: "exact" as const,
          original: { componentIdentity: "article" },
          target: {
            componentIdentity: "article",
            normalizedStartOffset: 12,
            normalizedEndOffset: 18,
          },
          candidates: 1,
          reason: "The original passage remains exact.",
        },
      ],
    },
    createdAt: "2026-08-25T00:00:00.000Z",
  };
}
