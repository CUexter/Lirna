import { randomUUID } from "node:crypto";
import type { db } from "@lirna/db";
import { annotations } from "@lirna/db/schema/annotations";
import {
  sourceStateDerivativeActivations,
  sourceStateDerivatives,
  sourceStates,
} from "@lirna/db/schema/sources";
import { and, asc, desc, eq } from "drizzle-orm";
import {
  readSepReadingDerivative,
  sepReadingDerivativeKind,
} from "../sep-admission/sep-reading-contract";
import {
  InvalidAnnotationAnchorError,
  validateAnnotationAnchor,
} from "./annotation-anchor";
import type {
  AnnotationColor,
  AnnotationKind,
  AnnotationOperations,
  AnnotationRecord,
  CreateAnnotationInput,
  UpdateAnnotationInput,
} from "./annotation-contract";

export { InvalidAnnotationAnchorError } from "./annotation-anchor";

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
        asc(annotations.normalizedStartOffset),
      );
    return rows.map(({ annotation }) => serializeAnnotation(annotation));
  }

  async create(
    input: CreateAnnotationInput,
  ): Promise<AnnotationRecord | undefined> {
    const component = await this.readingComponent(
      input.sourceId,
      input.stateId,
      input.componentIdentity,
    );
    if (!component) {
      return undefined;
    }
    validateAnnotationAnchor(component, input);
    const body = normalizeBody(input.body);
    if (input.kind !== (body ? "note" : "highlight")) {
      throw new InvalidAnnotationAnchorError();
    }
    const [annotation] = await this.database
      .insert(annotations)
      .values({
        id: randomUUID(),
        sourceId: input.sourceId,
        sourceStateId: input.stateId,
        componentIdentity: input.componentIdentity,
        kind: input.kind,
        publisherAnchor: input.publisherAnchor ?? null,
        offsetBasis: input.offsetBasis,
        normalizedStartOffset: input.normalizedStartOffset,
        normalizedEndOffset: input.normalizedEndOffset,
        exactText: input.exactText,
        prefix: input.prefix,
        suffix: input.suffix,
        color: input.color,
        body,
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
    const body =
      input.body === undefined ? undefined : normalizeBody(input.body);
    if (body !== undefined && input.kind !== (body ? "note" : "highlight")) {
      throw new InvalidAnnotationAnchorError();
    }
    const [annotation] = await this.database
      .update(annotations)
      .set({
        color: input.color,
        ...(body === undefined ? {} : { body, kind: input.kind }),
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

  private async readingComponent(
    sourceId: string,
    stateId: string,
    componentIdentity: string,
  ) {
    const [row] = await this.database
      .select({ payload: sourceStateDerivatives.payload })
      .from(sourceStateDerivativeActivations)
      .innerJoin(
        sourceStateDerivatives,
        eq(
          sourceStateDerivatives.id,
          sourceStateDerivativeActivations.derivativeId,
        ),
      )
      .innerJoin(
        sourceStates,
        eq(sourceStates.id, sourceStateDerivativeActivations.sourceStateId),
      )
      .where(
        and(
          eq(sourceStates.id, stateId),
          eq(sourceStates.sourceId, sourceId),
          eq(sourceStateDerivativeActivations.kind, sepReadingDerivativeKind),
          eq(sourceStateDerivatives.sourceStateId, stateId),
          eq(sourceStateDerivatives.kind, sepReadingDerivativeKind),
          eq(sourceStateDerivatives.valid, true),
        ),
      )
      .orderBy(
        desc(sourceStateDerivativeActivations.activatedAt),
        desc(sourceStateDerivativeActivations.id),
      )
      .limit(1);
    const reading = row ? readSepReadingDerivative(row.payload) : undefined;
    return reading?.components.find(
      (component) => component.identity === componentIdentity,
    );
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
    kind: annotation.kind as AnnotationKind,
    offsetBasis: annotation.offsetBasis as AnnotationRecord["offsetBasis"],
    createdAt: annotation.createdAt.toISOString(),
    updatedAt: annotation.updatedAt.toISOString(),
  };
}
