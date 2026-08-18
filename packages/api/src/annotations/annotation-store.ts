import { randomUUID } from "node:crypto";
import type { db } from "@lirna/db";
import { annotations } from "@lirna/db/schema/annotations";
import { sourceStates } from "@lirna/db/schema/sources";
import { and, asc, eq } from "drizzle-orm";

import type {
  AnnotationColor,
  AnnotationOperations,
  AnnotationRecord,
  CreateAnnotationInput,
  UpdateAnnotationInput,
} from "./annotation-contract";

export class DrizzleAnnotationStore implements AnnotationOperations {
  constructor(private readonly database: typeof db) {}

  async list(sourceId: string, stateId: string): Promise<AnnotationRecord[]> {
    const rows = await this.database
      .select({ annotation: annotations })
      .from(annotations)
      .innerJoin(sourceStates, eq(sourceStates.id, annotations.sourceStateId))
      .where(
        and(eq(sourceStates.id, stateId), eq(sourceStates.sourceId, sourceId)),
      )
      .orderBy(
        asc(annotations.componentIdentity),
        asc(annotations.startOffset),
      );
    return rows.map(({ annotation }) => serializeAnnotation(annotation));
  }

  async create(
    input: CreateAnnotationInput,
  ): Promise<AnnotationRecord | undefined> {
    if (!(await this.sourceStateExists(input.sourceId, input.stateId))) {
      return undefined;
    }
    const [annotation] = await this.database
      .insert(annotations)
      .values({
        id: randomUUID(),
        sourceStateId: input.stateId,
        componentIdentity: input.componentIdentity,
        startOffset: input.startOffset,
        endOffset: input.endOffset,
        exactText: input.exactText,
        color: input.color,
        body: normalizeBody(input.body),
      })
      .returning();
    return annotation ? serializeAnnotation(annotation) : undefined;
  }

  async update(
    input: UpdateAnnotationInput,
  ): Promise<AnnotationRecord | undefined> {
    if (!(await this.sourceStateExists(input.sourceId, input.stateId))) {
      return undefined;
    }
    const [annotation] = await this.database
      .update(annotations)
      .set({
        color: input.color,
        ...(input.body === undefined
          ? {}
          : { body: normalizeBody(input.body) }),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(annotations.id, input.id),
          eq(annotations.sourceStateId, input.stateId),
        ),
      )
      .returning();
    return annotation ? serializeAnnotation(annotation) : undefined;
  }

  async delete(
    sourceId: string,
    stateId: string,
    id: string,
  ): Promise<boolean> {
    if (!(await this.sourceStateExists(sourceId, stateId))) return false;
    const deleted = await this.database
      .delete(annotations)
      .where(
        and(eq(annotations.id, id), eq(annotations.sourceStateId, stateId)),
      )
      .returning({ id: annotations.id });
    return deleted.length > 0;
  }

  private async sourceStateExists(sourceId: string, stateId: string) {
    const rows = await this.database
      .select({ id: sourceStates.id })
      .from(sourceStates)
      .where(
        and(eq(sourceStates.id, stateId), eq(sourceStates.sourceId, sourceId)),
      )
      .limit(1);
    return rows.length > 0;
  }
}

function normalizeBody(body: string | undefined) {
  const value = body?.trim();
  return value ? value : null;
}

function serializeAnnotation(
  annotation: typeof annotations.$inferSelect,
): AnnotationRecord {
  return {
    ...annotation,
    color: annotation.color as AnnotationColor,
    createdAt: annotation.createdAt.toISOString(),
    updatedAt: annotation.updatedAt.toISOString(),
  };
}
