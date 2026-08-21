export const annotationColors = ["yellow", "green", "blue", "pink"] as const;
export type AnnotationColor = (typeof annotationColors)[number];
export const annotationKinds = ["highlight", "note"] as const;
export type AnnotationKind = (typeof annotationKinds)[number];
export const annotationOffsetBasis = "normalized-derivative-text-v1" as const;

export interface AnnotationRecord {
  id: string;
  sourceId: string;
  sourceStateId: string;
  componentIdentity: string;
  kind: AnnotationKind;
  publisherAnchor: string | null;
  offsetBasis: typeof annotationOffsetBasis;
  normalizedStartOffset: number;
  normalizedEndOffset: number;
  exactText: string;
  prefix: string;
  suffix: string;
  color: AnnotationColor;
  body: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateAnnotationInput {
  sourceId: string;
  stateId: string;
  componentIdentity: string;
  kind: AnnotationKind;
  publisherAnchor?: string;
  offsetBasis: typeof annotationOffsetBasis;
  normalizedStartOffset: number;
  normalizedEndOffset: number;
  exactText: string;
  prefix: string;
  suffix: string;
  color: AnnotationColor;
  body?: string;
}

export interface UpdateAnnotationInput {
  sourceId: string;
  stateId: string;
  id: string;
  color: AnnotationColor;
  kind: AnnotationKind;
  /** Omitted preserves the existing body; an empty or blank value clears it. */
  body?: string;
}

export interface AnnotationOperations {
  list(sourceId: string, stateId: string): Promise<AnnotationRecord[]>;
  create(input: CreateAnnotationInput): Promise<AnnotationRecord | undefined>;
  update(input: UpdateAnnotationInput): Promise<AnnotationRecord | undefined>;
  delete(sourceId: string, stateId: string, id: string): Promise<boolean>;
}
