import { z } from "zod";

export const readingSemanticLocationSchema = z.object({
  version: z.literal(1),
  source: z.object({
    sourceId: z.string().uuid(),
    stateId: z.string().uuid(),
  }),
  scene: z.object({
    identity: z.string().trim().min(1).max(2_000),
    componentIdentity: z.string().trim().min(1).max(2_000),
    owner: z.enum(["article", "publisher-note"]),
  }),
  block: z.object({
    identity: z.string().trim().min(1).max(2_000),
    strategy: z.enum([
      "authored-anchor",
      "content-fingerprint",
      "scene-fallback",
    ]),
  }),
  progress: z.number().min(0).max(1),
  fallback: z.object({
    scrollTop: z.number().int().nonnegative(),
    blockIndex: z.number().int().nonnegative(),
    blockTag: z.string().trim().min(1).max(100),
    textExcerpt: z.string().max(500),
    authoredAnchor: z.string().max(2_000).nullable(),
  }),
});

export type ReadingSemanticLocation = z.infer<
  typeof readingSemanticLocationSchema
>;

export function semanticLocationMatchesPosition(
  semantic: ReadingSemanticLocation,
  position: {
    sourceId: string;
    stateId: string;
    componentIdentity: string;
    scrollTop: number;
  },
) {
  return (
    semantic.source.sourceId === position.sourceId &&
    semantic.source.stateId === position.stateId &&
    semantic.scene.identity === position.componentIdentity &&
    semantic.scene.componentIdentity === position.componentIdentity &&
    semantic.fallback.scrollTop === position.scrollTop
  );
}

export interface ReadingPositionRecord {
  sourceId: string;
  stateId: string;
  sourceTitle: string;
  componentIdentity: string;
  componentLabel: string;
  scrollTop: number;
  semanticLocation?: ReadingSemanticLocation;
  savedAt: string;
}

export interface SaveReadingPositionInput {
  sourceId: string;
  stateId: string;
  componentIdentity: string;
  componentLabel: string;
  scrollTop: number;
  semanticLocation?: ReadingSemanticLocation;
  savedAt?: string;
}

export interface ReadingPositionOperations {
  get(input?: {
    sourceId: string;
    stateId: string;
    componentIdentity: string;
  }): Promise<ReadingPositionRecord | undefined>;
  save(
    input: SaveReadingPositionInput,
  ): Promise<ReadingPositionRecord | undefined>;
}
