import { z } from "zod";

import type { ReadingComponent } from "../sep-admission/sep-reading-contract";
import {
  projectReadingArticle,
  projectVersionOneReadingArticle,
} from "../sep-admission/sep-reading-text";

export const authoredTargetOffsetBasis =
  "normalized-derivative-text-v1" as const;

export interface AuthoredTarget {
  publisherAnchor: string | null;
  offsetBasis: typeof authoredTargetOffsetBasis;
  normalizedStartOffset: number;
  normalizedEndOffset: number;
  exactText: string;
  prefix: string;
  suffix: string;
}

export interface AuthoredTargetInput
  extends Omit<AuthoredTarget, "publisherAnchor"> {
  publisherAnchor?: string;
}

const authoredTargetShape = {
  offsetBasis: z.literal(authoredTargetOffsetBasis),
  normalizedStartOffset: z.number().int().nonnegative(),
  normalizedEndOffset: z.number().int().positive(),
  exactText: z.string(),
  prefix: z.string(),
  suffix: z.string(),
};

export const authoredTargetSchema = z.object({
  publisherAnchor: z.string().nullable(),
  ...authoredTargetShape,
});

export const authoredTargetInputSchema = z
  .object({
    publisherAnchor: z.string().trim().min(1).max(2_000).optional(),
    ...authoredTargetShape,
    exactText: z.string().min(1).max(20_000),
    prefix: z.string().max(32),
    suffix: z.string().max(32),
  })
  .refine(
    (target) => target.normalizedEndOffset > target.normalizedStartOffset,
    {
      message: "Authored target end offset must follow its start offset",
      path: ["normalizedEndOffset"],
    },
  )
  .refine(
    (target) =>
      target.normalizedEndOffset - target.normalizedStartOffset ===
      target.exactText.length,
    {
      message: "Authored target range must match its exact text",
      path: ["exactText"],
    },
  );

const contextLength = 32;

export class InvalidAuthoredTargetError extends Error {
  constructor(reason = "Authored target") {
    super(`${reason} does not match the active Reading derivative`);
    this.name = "InvalidAuthoredTargetError";
  }
}

export function validateAuthoredTarget(
  component: ReadingComponent,
  target: AuthoredTarget | AuthoredTargetInput,
) {
  const { plainText } = component;
  const start = target.normalizedStartOffset;
  const end = target.normalizedEndOffset;
  if (target.offsetBasis !== authoredTargetOffsetBasis) {
    throw new InvalidAuthoredTargetError("Authored target offset basis");
  }
  if (start < 0 || end <= start || end > plainText.length) {
    throw new InvalidAuthoredTargetError("Authored target offsets");
  }
  if (plainText.slice(start, end) !== target.exactText) {
    throw new InvalidAuthoredTargetError("Authored target text");
  }
  if (
    plainText.slice(Math.max(0, start - contextLength), start) !== target.prefix
  ) {
    throw new InvalidAuthoredTargetError("Authored target prefix");
  }
  if (plainText.slice(end, end + contextLength) !== target.suffix) {
    throw new InvalidAuthoredTargetError("Authored target suffix");
  }
  if (
    target.publisherAnchor &&
    !publisherAnchorContains(component, target.publisherAnchor, start, end)
  ) {
    throw new InvalidAuthoredTargetError("Publisher anchor");
  }
}

export function authoredTargetForPublisherAnchor(
  component: ReadingComponent,
  publisherAnchor: string,
): AuthoredTarget {
  const span = canonicalAnchorSpans(component)?.find(
    (candidate) =>
      candidate.id === publisherAnchor && candidate.end > candidate.start,
  );
  if (!span) throw new InvalidAuthoredTargetError("Publisher anchor");
  return {
    publisherAnchor,
    offsetBasis: authoredTargetOffsetBasis,
    normalizedStartOffset: span.start,
    normalizedEndOffset: span.end,
    exactText: component.plainText.slice(span.start, span.end),
    prefix: component.plainText.slice(
      Math.max(0, span.start - contextLength),
      span.start,
    ),
    suffix: component.plainText.slice(span.end, span.end + contextLength),
  };
}

function publisherAnchorContains(
  component: ReadingComponent,
  id: string,
  start: number,
  end: number,
) {
  return canonicalAnchorSpans(component)?.some(
    (span) => span.id === id && span.start <= start && end <= span.end,
  );
}

function canonicalAnchorSpans(component: ReadingComponent) {
  for (const project of [
    projectReadingArticle,
    projectVersionOneReadingArticle,
  ]) {
    const projection = project(
      component.introductoryBlocks,
      component.sections,
    );
    if (projection.text === component.plainText) {
      return projection.publisherAnchorSpans;
    }
  }
  return undefined;
}
