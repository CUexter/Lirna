export interface ReadingPositionRecord {
  sourceId: string;
  stateId: string;
  sourceTitle: string;
  componentIdentity: string;
  componentLabel: string;
  scrollTop: number;
  savedAt: string;
}

export interface SaveReadingPositionInput {
  sourceId: string;
  stateId: string;
  componentIdentity: string;
  componentLabel: string;
  scrollTop: number;
}

export interface ReadingPositionOperations {
  get(): Promise<ReadingPositionRecord | undefined>;
  save(
    input: SaveReadingPositionInput,
  ): Promise<ReadingPositionRecord | undefined>;
}
