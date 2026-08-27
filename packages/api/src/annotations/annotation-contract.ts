import type {
  AuthoredTarget,
  AuthoredTargetInput,
} from "../authored-targets/authored-target";

export const annotationColors = ["yellow", "green", "blue", "pink"] as const;
export type AnnotationColor = (typeof annotationColors)[number];
export const annotationKinds = ["highlight", "note"] as const;
export type AnnotationKind = (typeof annotationKinds)[number];

export class InvalidAnnotationError extends Error {
  constructor(message = "Annotation kind does not match its body") {
    super(message);
    this.name = "InvalidAnnotationError";
  }
}

export function validateAnnotationBody(
  kind: AnnotationKind,
  body: string | null,
) {
  if (kind !== (body ? "note" : "highlight")) {
    throw new InvalidAnnotationError();
  }
}

export interface AnnotationRecord extends AuthoredTarget {
  id: string;
  sourceId: string;
  sourceStateId: string;
  componentIdentity: string;
  kind: AnnotationKind;
  color: AnnotationColor;
  body: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateAnnotationInput extends AuthoredTargetInput {
  sourceId: string;
  stateId: string;
  componentIdentity: string;
  kind: AnnotationKind;
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
