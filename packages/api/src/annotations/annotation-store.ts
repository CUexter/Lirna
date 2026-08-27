import { randomUUID } from "node:crypto";
import type { db } from "@lirna/db";
import { annotations } from "@lirna/db/schema/annotations";
import { sourceStates } from "@lirna/db/schema/sources";
import { and, asc, eq } from "drizzle-orm";
import { validateAuthoredTarget } from "../authored-targets/authored-target";
import type { ActiveReadingDerivativeOperations } from "../sep-admission/active-reading-derivative";
import { DrizzleActiveReadingDerivativeStore } from "../sep-admission/active-reading-derivative-store";
import type {
  AnnotationColor,
  AnnotationKind,
  AnnotationOperations,
  AnnotationRecord,
  CreateAnnotationInput,
  UpdateAnnotationInput,
} from "./annotation-contract";
import { validateAnnotationBody } from "./annotation-contract";

export class DrizzleAnnotationStore implements AnnotationOperations {
  constructor(
    private readonly database: typeof db,
    private readonly activeReading: ActiveReadingDerivativeOperations = new DrizzleActiveReadingDerivativeStore(
      database,
    ),
  ) {}

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
    validateAuthoredTarget(component, input);
    const body = normalizeBody(input.body);
    validateAnnotationBody(input.kind, body);
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
    if (body !== undefined) validateAnnotationBody(input.kind, body);
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
    const active = await this.activeReading.read({ sourceId, stateId });
    return active.status === "active"
      ? active.value.reading.components.find(
          (component) => component.identity === componentIdentity,
        )
      : undefined;
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
