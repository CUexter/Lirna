export const annotationColors = ["yellow", "green", "blue", "pink"] as const;
export type AnnotationColor = (typeof annotationColors)[number];

export interface AnnotationRecord {
  id: string;
  sourceStateId: string;
  componentIdentity: string;
  startOffset: number;
  endOffset: number;
  exactText: string;
  color: AnnotationColor;
  body: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateAnnotationInput {
  sourceId: string;
  stateId: string;
  componentIdentity: string;
  startOffset: number;
  endOffset: number;
  exactText: string;
  color: AnnotationColor;
  body?: string;
}

export interface UpdateAnnotationInput {
  sourceId: string;
  stateId: string;
  id: string;
  color: AnnotationColor;
  /** Omitted preserves the existing body; an empty or blank value clears it. */
  body?: string;
}

export interface AnnotationOperations {
  list(sourceId: string, stateId: string): Promise<AnnotationRecord[]>;
  create(input: CreateAnnotationInput): Promise<AnnotationRecord | undefined>;
  update(input: UpdateAnnotationInput): Promise<AnnotationRecord | undefined>;
  delete(sourceId: string, stateId: string, id: string): Promise<boolean>;
}
