import type {
  ReadingBlock,
  ReadingInline,
  ReadingSection,
  SepReadingContract,
} from "../sep-admission/sep-reading-contract";
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
  rightsBasis: string;
  sensitivityLevel: string;
}): CitationMentionEvidence[] {
  const evidence: CitationMentionEvidence[] = [];
  for (const component of reading.components) {
    const add = (values: ReadingInline[]) => {
      const context = bounded(inlineText(values), maxContextLength);
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
            inferenceEligible: inferenceEligible(rightsBasis, sensitivityLevel),
          },
        });
      });
    };
    visitBlocks(component.introductoryBlocks, add);
    visitSections(component.sections, add);
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

function visitSections(
  sections: ReadingSection[],
  visit: (values: ReadingInline[]) => void,
) {
  for (const section of sections) {
    visit(section.title);
    visitBlocks(section.blocks, visit);
    visitSections(section.children, visit);
  }
}

function visitBlocks(
  blocks: ReadingBlock[],
  visit: (values: ReadingInline[]) => void,
) {
  for (const block of blocks) {
    if (block.kind === "statement") {
      visit(block.label);
      visit(block.body);
    } else if (block.kind === "list") {
      for (const item of block.items) visit(item);
    } else if (block.kind === "table") {
      visit(block.caption);
      visitTableRows([...block.head, ...block.body], visit);
    } else if (block.kind === "figure") {
      visit(block.figure.caption);
      visit(block.figure.description.text);
    } else if (block.kind !== "diagnostic") {
      visit(block.children);
    }
  }
}

function visitTableRows(
  rows: Array<{ cells: ReadingInline[][] }>,
  visit: (values: ReadingInline[]) => void,
) {
  for (const row of rows) for (const cell of row.cells) visit(cell);
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

function inlineText(values: ReadingInline[]): string {
  return values
    .map((value) => {
      if (value.kind === "text") return value.text;
      if (value.kind === "tex") return value.source;
      if (value.kind === "citation") return value.label;
      return inlineText(value.children);
    })
    .join("")
    .replace(/\s+/g, " ")
    .trim();
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

function inferenceEligible(rightsBasis: string, sensitivityLevel: string) {
  return (
    sensitivityLevel === "ordinary-cloud" &&
    !["reference-only", "inaccessible"].includes(rightsBasis)
  );
}

function bounded(value: string, limit: number) {
  return value.length <= limit ? value : `${value.slice(0, limit - 1)}…`;
}
