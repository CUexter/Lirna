import { createHash } from "node:crypto";
import type { SepReadingContract } from "../sep-admission/reading/contract";
import { compareDerivativeStructure } from "./derivative-structure";
import type {
  DerivativeComparison,
  RelocationOutcome,
} from "./derivative-update-contract";
import { componentHasTarget } from "./reading-traversal";

export interface AuthoredAnchor {
  recordType: RelocationOutcome["recordType"];
  recordId: string;
  componentIdentity: string;
  derivativeId?: string;
  normalizedStartOffset?: number;
  normalizedEndOffset?: number;
  exactText: string;
  prefix: string;
  suffix: string;
  publisherAnchor?: string | null;
  bibliographyComponentIdentity?: string;
  bibliographyEntryId?: string;
}

export function compareReadingDerivatives(
  before: SepReadingContract | undefined,
  after: SepReadingContract,
  baselineDerivativeId: string | undefined,
  anchors: AuthoredAnchor[],
): DerivativeComparison {
  const beforeDiagnostics = new Set(
    before?.capture.diagnostics.map(diagnosticIdentity) ?? [],
  );
  const afterDiagnostics = new Set(
    after.capture.diagnostics.map(diagnosticIdentity),
  );
  return {
    ...(baselineDerivativeId ? { baselineDerivativeId } : {}),
    semantic: semanticChanges(before, after),
    structure: compareDerivativeStructure(before, after),
    diagnostics: {
      added: [...afterDiagnostics].filter(
        (item) => !beforeDiagnostics.has(item),
      ),
      removed: [...beforeDiagnostics].filter(
        (item) => !afterDiagnostics.has(item),
      ),
    },
    relocations: anchors.map((anchor) => relocateAnchor(anchor, after)),
  };
}

function semanticChanges(
  before: SepReadingContract | undefined,
  after: SepReadingContract,
) {
  const previous = new Map(
    before?.components.map((component) => [component.identity, component]) ??
      [],
  );
  const next = new Map(
    after.components.map((component) => [component.identity, component]),
  );
  const identities = new Set([...previous.keys(), ...next.keys()]);
  return {
    changedComponents: [...identities].flatMap((identity) => {
      const beforeText = previous.get(identity)?.plainText;
      const afterText = next.get(identity)?.plainText;
      if (beforeText === afterText) return [];
      return [
        {
          identity,
          ...(beforeText === undefined
            ? {}
            : { beforeTextSha256: textHash(beforeText) }),
          ...(afterText === undefined
            ? {}
            : { afterTextSha256: textHash(afterText) }),
        },
      ];
    }),
  };
}

function textHash(text: string) {
  return createHash("sha256").update(text).digest("hex");
}

function relocateAnchor(
  anchor: AuthoredAnchor,
  reading: SepReadingContract,
): RelocationOutcome {
  const original = {
    componentIdentity: anchor.componentIdentity,
    ...(anchor.derivativeId ? { derivativeId: anchor.derivativeId } : {}),
  };
  if (
    anchor.recordType === "citation-resolution" &&
    !hasResolvedBibliographyTarget(reading, anchor)
  )
    return {
      recordType: anchor.recordType,
      recordId: anchor.recordId,
      classification: "unresolved",
      original,
      candidates: 0,
      reason:
        "The selected Bibliography entry is absent; the original resolution evidence remains authoritative.",
    };
  const component = reading.components.find(
    ({ identity }) => identity === anchor.componentIdentity,
  );
  if (
    component &&
    anchor.recordType === "reading-position" &&
    anchor.publisherAnchor &&
    componentHasTarget(component, anchor.publisherAnchor)
  )
    return {
      recordType: anchor.recordType,
      recordId: anchor.recordId,
      classification: "exact",
      original,
      target: { componentIdentity: component.identity },
      candidates: 1,
      reason:
        "The original semantic scene and authored block target still exist.",
    };
  if (
    component &&
    anchor.normalizedStartOffset !== undefined &&
    anchor.normalizedEndOffset !== undefined &&
    component.plainText.slice(
      anchor.normalizedStartOffset,
      anchor.normalizedEndOffset,
    ) === anchor.exactText
  )
    return locatedOutcome({
      anchor,
      original,
      classification: "exact",
      componentIdentity: component.identity,
      start: anchor.normalizedStartOffset,
    });
  const candidates = reading.components.flatMap((candidate) =>
    occurrences(candidate.plainText, anchor.exactText)
      .filter((start) => contextMatches(candidate.plainText, start, anchor))
      .map((start) => ({ componentIdentity: candidate.identity, start })),
  );
  if (candidates.length === 1 && candidates[0])
    return locatedOutcome({
      anchor,
      original,
      classification: "context-relocated",
      componentIdentity: candidates[0].componentIdentity,
      start: candidates[0].start,
    });
  return {
    recordType: anchor.recordType,
    recordId: anchor.recordId,
    classification: candidates.length > 1 ? "ambiguous" : "unresolved",
    original,
    candidates: candidates.length,
    reason:
      candidates.length > 1
        ? "Multiple passages match the original quote and context; the original evidence remains authoritative."
        : "No passage matches the original quote and context; the original evidence remains authoritative.",
  };
}

function hasResolvedBibliographyTarget(
  reading: SepReadingContract,
  anchor: AuthoredAnchor,
) {
  if (!anchor.bibliographyComponentIdentity || !anchor.bibliographyEntryId)
    return false;
  return reading.components
    .find(({ identity }) => identity === anchor.bibliographyComponentIdentity)
    ?.bibliography.some((group) =>
      group.entries.some(({ id }) => id === anchor.bibliographyEntryId),
    );
}

function locatedOutcome({
  anchor,
  original,
  classification,
  componentIdentity,
  start,
}: {
  anchor: AuthoredAnchor;
  original: RelocationOutcome["original"];
  classification: "exact" | "context-relocated";
  componentIdentity: string;
  start: number;
}): RelocationOutcome {
  return {
    recordType: anchor.recordType,
    recordId: anchor.recordId,
    classification,
    original,
    target: {
      componentIdentity,
      normalizedStartOffset: start,
      normalizedEndOffset: start + anchor.exactText.length,
    },
    candidates: 1,
    reason:
      classification === "exact"
        ? "The original component and normalized offsets still identify the exact text."
        : "One passage matches the original exact text and bounded context.",
  };
}

function contextMatches(text: string, start: number, anchor: AuthoredAnchor) {
  const before = text.slice(Math.max(0, start - anchor.prefix.length), start);
  const end = start + anchor.exactText.length;
  return (
    before === anchor.prefix &&
    text.slice(end, end + anchor.suffix.length) === anchor.suffix
  );
}

function occurrences(text: string, exact: string) {
  if (!exact) return [];
  const values: number[] = [];
  let cursor = 0;
  while (cursor <= text.length - exact.length) {
    const found = text.indexOf(exact, cursor);
    if (found < 0) break;
    values.push(found);
    cursor = found + 1;
  }
  return values;
}

function diagnosticIdentity(
  diagnostic: SepReadingContract["capture"]["diagnostics"][number],
) {
  return JSON.stringify([
    diagnostic.level,
    diagnostic.code,
    diagnostic.message,
    diagnostic.source.componentIdentity,
    diagnostic.source.locator,
  ]);
}
