import { fromMarkdown } from "mdast-util-from-markdown";
import { z } from "zod";

import type { EvidenceRelation } from "./research-thread-contract";

const evidenceRelationSchema = z.enum([
  "supports",
  "qualifies",
  "conflicts",
  "background",
]);
const claimSchema = z.object({
  key: z.string().trim().min(1).max(100),
  text: z.string().trim().min(1).max(4_000),
  kind: z.enum(["source-dependent", "interpretation", "original-reasoning"]),
  evidence: z
    .array(
      z.object({
        alias: z.string().trim().min(1).max(100),
        relation: evidenceRelationSchema,
      }),
    )
    .max(20),
});

export const answerLedgerSchema = z.object({
  claims: z.array(claimSchema).min(1).max(100),
});

export type AnswerLedger = z.infer<typeof answerLedgerSchema>;

export type AnswerValidationProblem =
  | { code: "malformed-ledger" }
  | { code: "duplicate-claim-key"; claimKey: string }
  | { code: "duplicate-claim-text"; claimKey: string }
  | { code: "unknown-evidence-alias"; claimKey?: string; alias: string }
  | { code: "unresolved-candidate-handle"; claimKey: string; alias: string }
  | {
      code: "source-dependent-claim-without-direct-evidence";
      claimKey: string;
    }
  | {
      code: "undeclared-evidence-relation";
      alias: string;
      relation: EvidenceRelation;
    }
  | { code: "malformed-evidence-relation"; alias: string }
  | { code: "stale-evidence" }
  | { code: "missing-ledger-claim"; claimKey: string }
  | { code: "uncited-source-dependent-claim"; claimKey: string };

export type AnswerValidationResult =
  | { outcome: "valid"; ledger: AnswerLedger }
  | { outcome: "invalid"; problems: AnswerValidationProblem[] };

// fallow-ignore-next-line complexity
export function validateAnswerLedger(
  input: unknown,
  admittedAliases: ReadonlySet<string>,
): AnswerValidationResult {
  const envelope = z
    .object({ claims: z.array(z.unknown()).min(1).max(100) })
    .safeParse(input);
  if (!envelope.success)
    return { outcome: "invalid", problems: [{ code: "malformed-ledger" }] };

  const claims: AnswerLedger["claims"] = [];
  const problems: AnswerValidationProblem[] = [];
  const keys = new Set<string>();
  const texts = new Set<string>();
  for (const inputClaim of envelope.data.claims) {
    const parsed = claimSchema.safeParse(inputClaim);
    if (!parsed.success) {
      problems.push({ code: "malformed-ledger" });
      continue;
    }
    const claim = parsed.data;
    claims.push(claim);
    if (keys.has(claim.key))
      problems.push({ code: "duplicate-claim-key", claimKey: claim.key });
    keys.add(claim.key);
    if (texts.has(claim.text))
      problems.push({ code: "duplicate-claim-text", claimKey: claim.key });
    texts.add(claim.text);
    for (const item of claim.evidence) {
      if (item.alias.startsWith("candidate_"))
        problems.push({
          code: "unresolved-candidate-handle",
          claimKey: claim.key,
          alias: item.alias,
        });
      else if (!admittedAliases.has(item.alias))
        problems.push({
          code: "unknown-evidence-alias",
          claimKey: claim.key,
          alias: item.alias,
        });
    }
    if (
      claim.kind === "source-dependent" &&
      !claim.evidence.some(
        ({ relation }) => relation === "supports" || relation === "qualifies",
      )
    )
      problems.push({
        code: "source-dependent-claim-without-direct-evidence",
        claimKey: claim.key,
      });
  }
  return problems.length
    ? { outcome: "invalid", problems }
    : { outcome: "valid", ledger: { claims } };
}

export function validateResearchAnswer(
  content: string,
  ledgerInput: unknown,
  admittedAliases: ReadonlySet<string>,
): AnswerValidationResult {
  const validated = validateAnswerLedger(ledgerInput, admittedAliases);
  if (validated.outcome === "invalid") return validated;
  const markers = answerMarkers(content);
  const problems: AnswerValidationProblem[] = [];
  const declared = new Set(
    validated.ledger.claims.flatMap((claim) =>
      claim.evidence.map(({ alias, relation }) => `${alias}:${relation}`),
    ),
  );
  for (const marker of markers) {
    if (!marker.relation) {
      problems.push({
        code: "malformed-evidence-relation",
        alias: marker.alias,
      });
      continue;
    }
    if (!admittedAliases.has(marker.alias)) {
      problems.push({ code: "unknown-evidence-alias", alias: marker.alias });
      continue;
    }
    const key = `${marker.alias}:${marker.relation}`;
    if (!declared.has(key))
      problems.push({
        code: "undeclared-evidence-relation",
        alias: marker.alias,
        relation: marker.relation,
      });
  }
  for (const claim of validated.ledger.claims) {
    const claimIndex = content.indexOf(claim.text);
    if (claimIndex < 0) {
      problems.push({ code: "missing-ledger-claim", claimKey: claim.key });
      continue;
    }
    if (
      claim.kind === "source-dependent" &&
      !claim.evidence.some(
        ({ alias, relation }) =>
          (relation === "supports" || relation === "qualifies") &&
          claimMarkers(content, claimIndex + claim.text.length).has(
            `${alias}:${relation}`,
          ),
      )
    )
      problems.push({
        code: "uncited-source-dependent-claim",
        claimKey: claim.key,
      });
  }
  return problems.length
    ? { outcome: "invalid", problems }
    : { outcome: "valid", ledger: validated.ledger };
}

function claimMarkers(content: string, offset: number) {
  const markers = new Set<string>();
  let suffix = content.slice(offset);
  let match = suffix.match(/^\s*\[\^([^\]|\s]+)(?:\|([^\]\s]+))?\]/);
  while (match) {
    const parsedRelation = relation(match[2]);
    if (match[1] && parsedRelation)
      markers.add(`${match[1]}:${parsedRelation}`);
    suffix = suffix.slice(match[0].length);
    match = suffix.match(/^\s*\[\^([^\]|\s]+)(?:\|([^\]\s]+))?\]/);
  }
  match = suffix.match(/^\s*:::quote\[([^\]|\s]+)(?:\|([^\]\s]+))?\]\r?\n:::/);
  while (match) {
    const parsedRelation = relation(match[2]);
    if (match[1] && parsedRelation)
      markers.add(`${match[1]}:${parsedRelation}`);
    suffix = suffix.slice(match[0].length);
    match = suffix.match(
      /^\s*:::quote\[([^\]|\s]+)(?:\|([^\]\s]+))?\]\r?\n:::/,
    );
  }
  return markers;
}

function answerMarkers(content: string) {
  const markers: Array<{
    alias: string;
    relation: EvidenceRelation | undefined;
  }> = [];
  collectMarkers(fromMarkdown(content) as MarkdownNode, content, markers);
  return markers;
}

// fallow-ignore-next-line complexity
function collectMarkers(
  node: MarkdownNode,
  content: string,
  markers: Array<{ alias: string; relation: EvidenceRelation | undefined }>,
) {
  if (
    ["code", "inlineCode", "html", "link", "linkReference"].includes(node.type)
  )
    return;
  const source = nodeSource(node, content);
  if (node.type === "paragraph" && source) {
    const quote = source.match(
      /^:::quote\[([^\]|\s]+)(?:\|([^\]\s]+))?\]\r?\n:::\s*$/,
    );
    if (quote) {
      markers.push({ alias: quote[1] ?? "", relation: relation(quote[2]) });
      return;
    }
  }
  if (node.type === "text" && source) {
    for (const match of source.matchAll(
      /\[\^([^\]|\s]+)(?:\|([^\]\s]+))?\]/g,
    )) {
      if (source[match.index - 1] !== "\\")
        markers.push({ alias: match[1] ?? "", relation: relation(match[2]) });
    }
  }
  for (const child of node.children ?? [])
    collectMarkers(child, content, markers);
}

function relation(value: string | undefined): EvidenceRelation | undefined {
  if (!value) return "supports";
  const parsed = evidenceRelationSchema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}

function nodeSource(node: MarkdownNode, content: string) {
  const start = node.position?.start.offset;
  const end = node.position?.end.offset;
  return start === undefined || end === undefined
    ? undefined
    : content.slice(start, end);
}

interface MarkdownNode {
  type: string;
  children?: MarkdownNode[];
  position?: { start: { offset?: number }; end: { offset?: number } };
}
