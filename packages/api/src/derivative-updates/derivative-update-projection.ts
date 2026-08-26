import type { annotations } from "@lirna/db/schema/annotations";
import type { citationResolutions } from "@lirna/db/schema/citation-resolutions";
import type { readingPositions } from "@lirna/db/schema/reading-positions";
import type { sourceStateDerivativeActivations } from "@lirna/db/schema/sources";
import { readingSemanticLocationSchema } from "../reading-position/reading-position-contract";
import type { SepReadingContract } from "../sep-admission/sep-reading-contract";
import { sepReadingDerivativeKind } from "../sep-admission/sep-reading-contract";
import type { AuthoredAnchor } from "./derivative-analysis";
import type {
  DerivativeActivation,
  DerivativeComparison,
  ReadingDerivativeCandidate,
} from "./derivative-update-contract";

export function projectAuthoredAnchors(
  annotationRows: Array<typeof annotations.$inferSelect>,
  positionRows: Array<typeof readingPositions.$inferSelect>,
  resolutionRows: Array<typeof citationResolutions.$inferSelect>,
): AuthoredAnchor[] {
  const latest = new Map<string, (typeof resolutionRows)[number]>();
  for (const resolution of resolutionRows)
    latest.set(
      `${resolution.componentIdentity}\u0000${resolution.mentionId}`,
      resolution,
    );
  return [
    ...annotationRows.map((item) => anchor("annotation", item.id, item)),
    ...positionRows.map(positionAnchor),
    ...[...latest.values()]
      .filter(({ action }) => action === "selected")
      .map((item) =>
        anchor("citation-resolution", item.id, item, item.derivativeId),
      ),
  ];
}

export function invalidComparison(
  baselineDerivativeId: string | undefined,
  anchors: AuthoredAnchor[],
): DerivativeComparison {
  return {
    ...(baselineDerivativeId ? { baselineDerivativeId } : {}),
    semantic: { changedComponents: [] },
    structure: [
      emptyStructure("components"),
      emptyStructure("sections"),
      emptyStructure("figures"),
      emptyStructure("bibliography"),
    ],
    diagnostics: { added: [], removed: [] },
    relocations: anchors.map((item) => ({
      recordType: item.recordType,
      recordId: item.recordId,
      classification: "unresolved",
      original: {
        componentIdentity: item.componentIdentity,
        ...(item.derivativeId ? { derivativeId: item.derivativeId } : {}),
      },
      candidates: 0,
      reason:
        "The candidate is invalid; original evidence remains authoritative.",
    })),
  };
}

function emptyStructure(
  subject: DerivativeComparison["structure"][number]["subject"],
) {
  return {
    subject,
    before: 0,
    after: 0,
    afterSha256:
      "4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e06c40bc26ac15c9da3f7c8",
  };
}

export function projectCandidate(input: {
  id: string;
  sourceStateId: string;
  previousDerivativeId?: string;
  generation: ReadingDerivativeCandidate["generation"];
  validation: ReadingDerivativeCandidate["validation"];
  comparison: DerivativeComparison;
  reading?: SepReadingContract;
  createdAt: Date;
}): ReadingDerivativeCandidate {
  return {
    id: input.id,
    sourceStateId: input.sourceStateId,
    kind: sepReadingDerivativeKind,
    ...(input.previousDerivativeId
      ? { previousDerivativeId: input.previousDerivativeId }
      : {}),
    valid: input.validation.status === "valid",
    generation: input.generation,
    validation: input.validation,
    comparison: input.comparison,
    ...(input.reading ? { reading: input.reading } : {}),
    createdAt: input.createdAt.toISOString(),
  };
}

export function serializeActivation(
  activation: typeof sourceStateDerivativeActivations.$inferSelect,
  consequences: DerivativeComparison,
): DerivativeActivation {
  return {
    id: activation.id,
    derivativeId: activation.derivativeId,
    sequence: activation.sequence,
    actorId: activation.actorId,
    reason: activation.reason,
    activatedAt: activation.activatedAt.toISOString(),
    consequences,
  };
}

function anchor(
  recordType: "annotation" | "citation-resolution",
  recordId: string,
  item:
    | typeof annotations.$inferSelect
    | typeof citationResolutions.$inferSelect,
  derivativeId?: string,
): AuthoredAnchor {
  return {
    recordType,
    recordId,
    componentIdentity: item.componentIdentity,
    ...(derivativeId ? { derivativeId } : {}),
    normalizedStartOffset: item.normalizedStartOffset,
    normalizedEndOffset: item.normalizedEndOffset,
    exactText: item.exactText,
    prefix: item.prefix,
    suffix: item.suffix,
    publisherAnchor: item.publisherAnchor,
    ...(recordType === "citation-resolution" &&
    "bibliographyComponentIdentity" in item
      ? {
          ...(item.bibliographyComponentIdentity
            ? {
                bibliographyComponentIdentity:
                  item.bibliographyComponentIdentity,
              }
            : {}),
          ...(item.bibliographyEntryId
            ? { bibliographyEntryId: item.bibliographyEntryId }
            : {}),
        }
      : {}),
  };
}

function positionAnchor(
  item: typeof readingPositions.$inferSelect,
): AuthoredAnchor {
  const semantic = item.semanticLocation
    ? readingSemanticLocationSchema.parse(item.semanticLocation)
    : undefined;
  return {
    recordType: "reading-position",
    recordId: `${item.sourceStateId}:${item.componentIdentity}`,
    componentIdentity: item.componentIdentity,
    exactText: semantic?.fallback.textExcerpt ?? "",
    prefix: "",
    suffix: "",
    publisherAnchor:
      semantic?.fallback.authoredAnchor ?? semantic?.block.identity ?? null,
  };
}
