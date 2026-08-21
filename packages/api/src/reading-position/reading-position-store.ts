import type { db } from "@lirna/db";
import { readingPositions } from "@lirna/db/schema/reading-positions";
import { sourceStates, sources } from "@lirna/db/schema/sources";
import { desc, eq } from "drizzle-orm";

import type {
  ReadingPositionOperations,
  ReadingPositionRecord,
  SaveReadingPositionInput,
} from "./reading-position-contract";

export class DrizzleReadingPositionStore implements ReadingPositionOperations {
  constructor(private readonly database: typeof db) {}

  async get(): Promise<ReadingPositionRecord | undefined> {
    const [row] = await this.database
      .select({ position: readingPositions, source: sources })
      .from(readingPositions)
      .innerJoin(
        sourceStates,
        eq(sourceStates.id, readingPositions.sourceStateId),
      )
      .innerJoin(sources, eq(sources.id, sourceStates.sourceId))
      .orderBy(desc(readingPositions.savedAt))
      .limit(1);
    return row ? serialize(row.position, row.source) : undefined;
  }

  async save(
    input: SaveReadingPositionInput,
  ): Promise<ReadingPositionRecord | undefined> {
    const [existing] = await this.database
      .select({ source: sources })
      .from(sourceStates)
      .innerJoin(sources, eq(sources.id, sourceStates.sourceId))
      .where(eq(sourceStates.id, input.stateId))
      .limit(1);
    if (!existing || existing.source.id !== input.sourceId) return undefined;

    const [position] = await this.database
      .insert(readingPositions)
      .values({
        sourceStateId: input.stateId,
        componentIdentity: input.componentIdentity,
        componentLabel: input.componentLabel,
        scrollTop: input.scrollTop,
        savedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: readingPositions.sourceStateId,
        set: {
          componentIdentity: input.componentIdentity,
          componentLabel: input.componentLabel,
          scrollTop: input.scrollTop,
          savedAt: new Date(),
        },
      })
      .returning();
    return position ? serialize(position, existing.source) : undefined;
  }
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
    sourceId: source.id,
    sourceTitle: source.title,
    stateId: position.sourceStateId,
  };
}
