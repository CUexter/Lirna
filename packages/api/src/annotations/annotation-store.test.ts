import { describe, expect, test } from "bun:test";

import type {
  AnnotationRecord,
  CreateAnnotationInput,
} from "./annotation-contract";
import {
  DrizzleAnnotationStore,
  InvalidAnnotationAnchorError,
} from "./annotation-store";

const sourceId = "10000000-0000-4000-8000-000000000000";
const stateId = "20000000-0000-4000-8000-000000000000";
const annotationId = "30000000-0000-4000-8000-000000000000";

describe("DrizzleAnnotationStore mapping", () => {
  test("serializes stored annotations with ISO timestamps", async () => {
    const store = storeWith({ listRows: [{ annotation: row() }] });

    await expect(store.list(sourceId, stateId)).resolves.toEqual([record({})]);
  });

  test("refuses to create against an unavailable Source state", async () => {
    let insertCalls = 0;
    const store = storeWith({
      derivativeRows: [],
      onInsert: () => insertCalls++,
    });

    await expect(store.create(createInput())).resolves.toBeUndefined();
    expect(insertCalls).toBe(0);
  });

  test("normalizes a blank note to no body when creating", async () => {
    let inserted: { body?: string | null } | undefined;
    const store = storeWith({
      writeRows: [row({ body: null })],
      onInsert: (values) => {
        inserted = values;
      },
    });

    const created = await store.create(
      createInput({ kind: "highlight", body: "   " }),
    );
    expect(inserted?.body).toBeNull();
    expect(created?.body).toBeNull();
  });

  test("trims and keeps a note when creating", async () => {
    let inserted: { body?: string | null } | undefined;
    const store = storeWith({
      writeRows: [row({ body: "A useful note" })],
      onInsert: (values) => {
        inserted = values;
      },
    });

    const created = await store.create(
      createInput({ body: "  A useful note " }),
    );
    expect(inserted?.body).toBe("A useful note");
    expect(created?.body).toBe("A useful note");
  });

  test("rejects an anchor that disagrees with canonical component text", async () => {
    const store = storeWith({});

    await expect(
      store.create(createInput({ exactText: "fabricat" })),
    ).rejects.toBeInstanceOf(InvalidAnnotationAnchorError);
  });

  test("preserves the existing body when an update omits it", async () => {
    let updated: Record<string, unknown> | undefined;
    const store = storeWith({
      writeRows: [row()],
      onUpdate: (values) => {
        updated = values;
      },
    });

    await store.update({
      sourceId,
      stateId,
      id: annotationId,
      color: "blue",
      kind: "note",
    });
    expect(updated).toBeDefined();
    expect("body" in (updated ?? {})).toBeFalse();
  });

  test("clears the body when an update sends a blank note", async () => {
    let updated: Record<string, unknown> | undefined;
    const store = storeWith({
      writeRows: [row({ body: null })],
      onUpdate: (values) => {
        updated = values;
      },
    });

    await store.update({
      sourceId,
      stateId,
      id: annotationId,
      color: "blue",
      kind: "highlight",
      body: "  ",
    });
    expect(updated?.body).toBeNull();
  });

  test("reports whether a delete matched the Source state", async () => {
    const missing = storeWith({ stateRows: [] });
    await expect(
      missing.delete(sourceId, stateId, annotationId),
    ).resolves.toBeFalse();

    const deleted = storeWith({ writeRows: [{ id: annotationId }] });
    await expect(
      deleted.delete(sourceId, stateId, annotationId),
    ).resolves.toBeTrue();
  });
});

function createInput(
  overrides: Partial<CreateAnnotationInput> = {},
): CreateAnnotationInput {
  return {
    sourceId,
    stateId,
    componentIdentity: "article:main",
    kind: "note",
    offsetBasis: "normalized-derivative-text-v1",
    normalizedStartOffset: 4,
    normalizedEndOffset: 12,
    exactText: "evidence",
    prefix: "Read",
    suffix: " carefully.",
    color: "green",
    body: "A useful note",
    ...overrides,
  };
}

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: annotationId,
    sourceId,
    sourceStateId: stateId,
    componentIdentity: "article:main",
    kind: "note",
    publisherAnchor: null,
    offsetBasis: "normalized-derivative-text-v1",
    normalizedStartOffset: 4,
    normalizedEndOffset: 12,
    exactText: "evidence",
    prefix: "Read",
    suffix: " carefully.",
    color: "green",
    body: "Stored note",
    createdAt: new Date("2026-08-18T12:00:00.000Z"),
    updatedAt: new Date("2026-08-18T13:00:00.000Z"),
    ...overrides,
  };
}

function record(overrides: Partial<AnnotationRecord>): AnnotationRecord {
  return {
    id: annotationId,
    sourceId,
    sourceStateId: stateId,
    componentIdentity: "article:main",
    kind: "note",
    publisherAnchor: null,
    offsetBasis: "normalized-derivative-text-v1",
    normalizedStartOffset: 4,
    normalizedEndOffset: 12,
    exactText: "evidence",
    prefix: "Read",
    suffix: " carefully.",
    color: "green",
    body: "Stored note",
    createdAt: "2026-08-18T12:00:00.000Z",
    updatedAt: "2026-08-18T13:00:00.000Z",
    ...overrides,
  };
}

function storeWith({
  stateRows = [{ id: stateId }],
  derivativeRows = [{ payload: readingPayload() }],
  listRows = [],
  writeRows = [],
  onInsert,
  onUpdate,
}: {
  stateRows?: unknown[];
  derivativeRows?: unknown[];
  listRows?: unknown[];
  writeRows?: unknown[];
  onInsert?: (values: { body?: string | null }) => void;
  onUpdate?: (values: Record<string, unknown>) => void;
}) {
  const database = {
    select: (selection: Record<string, unknown>) => {
      if ("payload" in selection) {
        return {
          from: () => ({
            innerJoin: () => ({
              innerJoin: () => ({
                innerJoin: () => ({
                  where: () => ({
                    orderBy: () => ({
                      limit: () => Promise.resolve(derivativeRows),
                    }),
                  }),
                }),
              }),
            }),
          }),
        };
      }
      if ("annotation" in selection) {
        return {
          from: () => ({
            innerJoin: () => ({
              where: () => ({ orderBy: () => Promise.resolve(listRows) }),
            }),
          }),
        };
      }
      return {
        from: () => ({
          where: () => ({ limit: () => Promise.resolve(stateRows) }),
        }),
      };
    },
    insert: () => ({
      values: (values: { body?: string | null }) => {
        onInsert?.(values);
        return { returning: () => Promise.resolve(writeRows) };
      },
    }),
    update: () => ({
      set: (values: Record<string, unknown>) => {
        onUpdate?.(values);
        return {
          where: () => ({ returning: () => Promise.resolve(writeRows) }),
        };
      },
    }),
    delete: () => ({
      where: () => ({ returning: () => Promise.resolve(writeRows) }),
    }),
  };
  return new DrizzleAnnotationStore(database as never);
}

function readingPayload() {
  const component = {
    identity: "article:main",
    role: "main" as const,
    label: "Article",
    order: 0,
    requestedUrl: "https://example.com/article",
    finalUrl: "https://example.com/article",
    retrievedAt: "2026-08-18T10:00:00.000Z",
    sha256: "a".repeat(64),
    toc: [],
    introductoryBlocks: [],
    sections: [],
    figures: [],
    bibliography: [],
    plainText: "Readevidence carefully.",
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
      canonicalUrl: "https://example.com/article",
      observation: "submitted",
      admittedAt: "2026-08-18T10:00:00.000Z",
    },
    mainComponent: {
      identity: component.identity,
      requestedUrl: component.requestedUrl,
      finalUrl: component.finalUrl,
      retrievedAt: component.retrievedAt,
      sha256: component.sha256,
    },
    components: [component],
    capture: {
      completeness: "complete",
      readingReadiness: "ready",
      readinessReasons: [],
      diagnostics: [],
    },
    toc: [],
    introductoryBlocks: [],
    sections: [],
    plainText: component.plainText,
    provenance: {
      adapter: { id: "sep", version: "1" },
      parser: { id: "parse5", version: "7.3.0" },
      inputResourceHashes: [],
    },
  };
}
