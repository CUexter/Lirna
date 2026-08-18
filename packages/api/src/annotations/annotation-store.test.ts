import { describe, expect, test } from "bun:test";

import type {
  AnnotationRecord,
  CreateAnnotationInput,
} from "./annotation-contract";
import { DrizzleAnnotationStore } from "./annotation-store";

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
    const store = storeWith({ stateRows: [], onInsert: () => insertCalls++ });

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

    const created = await store.create(createInput({ body: "   " }));
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
    startOffset: 4,
    endOffset: 12,
    exactText: "evidence",
    color: "green",
    ...overrides,
  };
}

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: annotationId,
    sourceStateId: stateId,
    componentIdentity: "article:main",
    startOffset: 4,
    endOffset: 12,
    exactText: "evidence",
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
    sourceStateId: stateId,
    componentIdentity: "article:main",
    startOffset: 4,
    endOffset: 12,
    exactText: "evidence",
    color: "green",
    body: "Stored note",
    createdAt: "2026-08-18T12:00:00.000Z",
    updatedAt: "2026-08-18T13:00:00.000Z",
    ...overrides,
  };
}

function storeWith({
  stateRows = [{ id: stateId }],
  listRows = [],
  writeRows = [],
  onInsert,
  onUpdate,
}: {
  stateRows?: unknown[];
  listRows?: unknown[];
  writeRows?: unknown[];
  onInsert?: (values: { body?: string | null }) => void;
  onUpdate?: (values: Record<string, unknown>) => void;
}) {
  const database = {
    select: () => ({
      from: () => ({
        innerJoin: () => ({
          where: () => ({
            orderBy: () => Promise.resolve(listRows),
          }),
        }),
        where: () => ({
          limit: () => Promise.resolve(stateRows),
        }),
      }),
    }),
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
