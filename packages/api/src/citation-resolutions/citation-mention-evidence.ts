import {
  readingInlineText,
  visitReadingInlineGroups,
} from "../sep-admission/reading-content";
import type {
  ReadingInline,
  SepReadingContract,
} from "../sep-admission/sep-reading-contract";
import {
  citationInferenceRequest,
  decideCitationInference,
  type RightsBasis,
  type SensitivityLevel,
} from "../source-handling-policy/source-handling-policy";
import type {
  CitationMentionCandidate,
  CitationMentionEvidence,
} from "./citation-resolution-contract";

const maxCandidates = 12;
const maxContextLength = 512;
const maxCandidateTextLength = 1_000;

export function deriveCitationMentionEvidence({
  derivativeId,
  reading,
  rightsBasis,
  sensitivityLevel,
}: {
  derivativeId: string;
  reading: SepReadingContract;
  rightsBasis: RightsBasis;
  sensitivityLevel: SensitivityLevel;
}): CitationMentionEvidence[] {
  const evidence: CitationMentionEvidence[] = [];
  for (const component of reading.components) {
    const add = (values: ReadingInline[]) => {
      const context = bounded(readingInlineText(values), maxContextLength);
      visitInlines(values, (mention) => {
        if (mention.state === "resolved") return;
        evidence.push({
          id: `${derivativeId}:${component.identity}:${mention.mentionId}`,
          sourceId: reading.source.id,
          sourceStateId: reading.source.stateId,
          derivativeId,
          componentIdentity: component.identity,
          mentionId: mention.mentionId,
          label: mention.label,
          context,
          state: mention.state,
          deterministicReason: reasonForRule(mention.rule),
          candidates: candidatesForMention(
            reading,
            component.identity,
            mention.candidates,
            mention.rule,
          ),
          policy: {
            rightsBasis,
            sensitivityLevel,
            citationInference: decideCitationInference(
              { rightsBasis, sensitivityLevel },
              citationInferenceRequest.endpointClass,
            ),
          },
        });
      });
    };
    visitReadingInlineGroups(
      component.introductoryBlocks,
      component.sections,
      add,
    );
  }
  return evidence.toSorted(
    (left, right) =>
      left.componentIdentity.localeCompare(right.componentIdentity) ||
      left.mentionId.localeCompare(right.mentionId),
  );
}

function candidatesForMention(
  reading: SepReadingContract,
  citingComponentIdentity: string,
  candidateIds: string[],
  rule: string,
): CitationMentionCandidate[] {
  const citingComponent = reading.components.find(
    (component) => component.identity === citingComponentIdentity,
  );
  const localIds = new Set(
    citingComponent?.bibliography.flatMap((group) =>
      group.entries.map((entry) => entry.id),
    ) ?? [],
  );
  const component = candidateIds.some((id) => localIds.has(id))
    ? citingComponent
    : reading.components.find(
        (candidate) => candidate.identity === reading.mainComponent.identity,
      );
  if (!component) return [];
  const requested = new Set(candidateIds.slice(0, maxCandidates));
  return component.bibliography
    .flatMap((group) => group.entries)
    .filter((entry) => requested.has(entry.id))
    .slice(0, maxCandidates)
    .map((entry) => ({
      id: `${component.identity}:${entry.id}`,
      bibliographyComponentIdentity: component.identity,
      bibliographyEntryId: entry.id,
      label: entry.label || entry.text,
      text: bounded(entry.text, maxCandidateTextLength),
      reason: reasonForRule(rule),
    }));
}

function visitInlines(
  values: ReadingInline[],
  visit: (value: Extract<ReadingInline, { kind: "citation" }>) => void,
) {
  for (const value of values) {
    if (value.kind === "citation") visit(value);
    else if ("children" in value) visitInlines(value.children, visit);
  }
}

function reasonForRule(rule: string) {
  if (rule === "authored-author-year") {
    return "The authored surname and year matched more than one Bibliography entry.";
  }
  if (rule === "authored-fragment-target") {
    return "The authored fragment target matched the bounded Bibliography candidates.";
  }
  if (rule === "normalized-authored-label") {
    return "The normalized authored label matched the bounded Bibliography candidates.";
  }
  return `Deterministic rule: ${rule}`;
}

function bounded(value: string, limit: number) {
  return value.length <= limit ? value : `${value.slice(0, limit - 1)}…`;
}
