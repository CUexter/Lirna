import type { db } from "@lirna/db";
import { readingPositions } from "@lirna/db/schema/reading-positions";
import {
  sourceStateDerivativeActivations,
  sourceStateDerivatives,
  sourceStates,
  sources,
} from "@lirna/db/schema/sources";
import { and, desc, eq } from "drizzle-orm";

import {
  readSepReadingDerivative,
  sepReadingDerivativeKind,
} from "../sep-admission/sep-reading-contract";
import type {
  ReadingPositionOperations,
  ReadingPositionRecord,
  SaveReadingPositionInput,
} from "./reading-position-contract";
import {
  readingSemanticLocationSchema,
  semanticLocationMatchesPosition,
} from "./reading-position-contract";

export class DrizzleReadingPositionStore implements ReadingPositionOperations {
  constructor(private readonly database: typeof db) {}

  async get(input?: {
    sourceId: string;
    stateId: string;
    componentIdentity: string;
  }): Promise<ReadingPositionRecord | undefined> {
    const query = this.database
      .select({ position: readingPositions, source: sources })
      .from(readingPositions)
      .innerJoin(
        sourceStates,
        eq(sourceStates.id, readingPositions.sourceStateId),
      )
      .innerJoin(sources, eq(sources.id, sourceStates.sourceId));
    const [row] = input
      ? await query
          .where(
            and(
              eq(sources.id, input.sourceId),
              eq(sourceStates.id, input.stateId),
              eq(readingPositions.componentIdentity, input.componentIdentity),
            ),
          )
          .limit(1)
      : await query.orderBy(desc(readingPositions.savedAt)).limit(1);
    return row ? serialize(row.position, row.source) : undefined;
  }

  async save(
    input: SaveReadingPositionInput,
  ): Promise<ReadingPositionRecord | undefined> {
    const [existing] = await this.database
      .select({ payload: sourceStateDerivatives.payload, source: sources })
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
      .innerJoin(sources, eq(sources.id, sourceStates.sourceId))
      .where(
        and(
          eq(sourceStates.id, input.stateId),
          eq(sources.id, input.sourceId),
          eq(sourceStateDerivativeActivations.kind, sepReadingDerivativeKind),
          eq(sourceStateDerivatives.sourceStateId, input.stateId),
          eq(sourceStateDerivatives.kind, sepReadingDerivativeKind),
          eq(sourceStateDerivatives.valid, true),
        ),
      )
      .orderBy(desc(sourceStateDerivativeActivations.activatedAt))
      .limit(1);
    const component = existing
      ? readSepReadingDerivative(existing.payload).components.find(
          (item) => item.identity === input.componentIdentity,
        )
      : undefined;
    if (!existing || !component) return undefined;
    if (input.semanticLocation && !semanticMatches(input, component.role))
      return undefined;

    const [position] = await this.database
      .insert(readingPositions)
      .values({
        sourceStateId: input.stateId,
        componentIdentity: input.componentIdentity,
        componentLabel: component.label,
        scrollTop: input.scrollTop,
        semanticLocation: input.semanticLocation ?? null,
        savedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [
          readingPositions.sourceStateId,
          readingPositions.componentIdentity,
        ],
        set: {
          componentLabel: component.label,
          scrollTop: input.scrollTop,
          semanticLocation: input.semanticLocation ?? null,
          savedAt: new Date(),
        },
      })
      .returning();
    return position ? serialize(position, existing.source) : undefined;
  }
}

function semanticMatches(
  input: SaveReadingPositionInput,
  role:
    | "main"
    | "supplement"
    | "notes"
    | "figure-description"
    | "unknown-component",
) {
  const semantic = input.semanticLocation;
  if (!semantic) return true;
  return (
    semanticLocationMatchesPosition(semantic, input) &&
    semantic.scene.owner === (role === "notes" ? "publisher-note" : "article")
  );
}

function serialize(
  position: typeof readingPositions.$inferSelect,
  source: typeof sources.$inferSelect,
): ReadingPositionRecord {
  return {
    componentIdentity: position.componentIdentity,
    componentLabel: position.componentLabel,
    savedAt: position.savedAt.toISOString(),
    scrollTop: position.scrollTop,
    ...(position.semanticLocation
      ? {
          semanticLocation: readingSemanticLocationSchema.parse(
            position.semanticLocation,
          ),
        }
      : {}),
    sourceId: source.id,
    sourceTitle: source.title,
    stateId: position.sourceStateId,
  };
}
