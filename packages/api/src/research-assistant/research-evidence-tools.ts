import { randomUUID } from "node:crypto";
import { tool } from "ai";
import { z } from "zod";

import type { ReadingComponent } from "../sep-admission/reading/contract";
import type {
  EvidenceResolutionObservation,
  EvidenceResolutionResult,
} from "./evidence-resolution";
import { createEvidenceResolver } from "./evidence-resolver";
import {
  type AnswerLedger,
  validateAnswerLedger,
} from "./research-answer-ledger";
import {
  defaultResearchEvidenceBudget,
  type ResearchEvidenceBudget,
  type ResearchEvidenceSessionSnapshot,
  researchEvidenceIndexVersion,
  researchEvidenceResolverVersion,
  validateResearchEvidenceBudget,
} from "./research-evidence-session-contract";
import {
  observed,
  sourceComponentReader,
  unresolved,
} from "./research-evidence-tool-support";
import type { AliasedResearchPassageReference } from "./research-thread-contract";

type EvidenceComponent = Pick<
  ReadingComponent,
  "identity" | "label" | "plainText" | "role"
>;

interface ResearchEvidenceToolOptions {
  components: EvidenceComponent[];
  sourceStateId: string;
  derivativeId: string;
  currentDerivativeId?: () => Promise<string | undefined>;
  observe?: (observation: EvidenceResolutionObservation) => void;
  update?: (snapshot: ResearchEvidenceSessionSnapshot) => void;
  budget?: ResearchEvidenceBudget;
}

export function createResearchEvidenceSession(
  options: ResearchEvidenceToolOptions,
) {
  const sessionId = `session_${randomUUID()}`;
  const budget = validateResearchEvidenceBudget(
    options.budget ?? defaultResearchEvidenceBudget,
  );
  const componentIdentities = new Set(
    options.components.map(({ identity }) => identity),
  );
  const resolver = createEvidenceResolver({
    sessionId,
    sourceStateId: options.sourceStateId,
    derivativeId: options.derivativeId,
    components: options.components,
    currentDerivativeId: options.currentDerivativeId,
  });
  let discoveries = 0;
  let admissions = 0;
  let candidates = 0;
  let evidenceCharacters = 0;
  let admittedCount = 0;
  let refusedCount = 0;
  let modelSteps = 0;
  let budgetExhausted = false;
  let answerLedger: AnswerLedger | undefined;
  let answerLedgerAttempts = 0;
  let expired = false;
  const admittedAliases = new Set<string>();
  const admittedReferences = new Map<
    string,
    Extract<EvidenceResolutionResult, { outcome: "admitted" }>
  >();
  const componentScope = new Set<string>();
  const reasonCodes = new Set<EvidenceResolutionObservation["reasonCode"]>();

  const discover = async ({
    intent,
    componentScope: requestedScope,
    limit,
  }: {
    intent: string;
    componentScope: string[];
    limit: number;
  }) => {
    const startedAt = performance.now();
    for (const identity of requestedScope) componentScope.add(identity);
    if (discoveries >= budget.maximumDiscoveries) {
      budgetExhausted = true;
      return finish(
        unresolved(
          "budget-exhausted",
          "discovery-budget-exhausted",
          requestedScope,
        ),
        "findEvidence",
        startedAt,
      );
    }
    discoveries += 1;
    if (requestedScope.some((identity) => !componentIdentities.has(identity)))
      return finish(
        unresolved("refused", "scope-denied", requestedScope),
        "findEvidence",
        startedAt,
      );
    const candidateLimit = Math.min(
      limit,
      budget.maximumCandidatesPerDiscovery,
    );
    const rankedCandidates = await resolver.find({
      sourceStateId: options.sourceStateId,
      componentIdentities: requestedScope,
      intent,
      limit: Math.max(2, candidateLimit),
    });
    if (rankedCandidates.length === 0)
      return finish(
        unresolved("none", "no-relevant-passage", requestedScope, 0),
        "findEvidence",
        startedAt,
      );
    const outcome =
      rankedCandidates.length > 1 &&
      rankedCandidates[0]?.relevanceScore ===
        rankedCandidates[1]?.relevanceScore
        ? "ambiguous"
        : "candidates";
    const selected =
      outcome === "ambiguous"
        ? rankedCandidates
            .filter(
              ({ relevanceScore }) =>
                relevanceScore === rankedCandidates[0]?.relevanceScore,
            )
            .slice(0, budget.maximumCandidatesPerDiscovery)
        : rankedCandidates.slice(0, candidateLimit);
    candidates += selected.length;
    return finish(
      {
        kind: "evidence-discovery" as const,
        outcome,
        componentScope: requestedScope,
        candidateCount: selected.length,
        candidates: selected,
        ...(outcome === "ambiguous"
          ? { reasonCode: "equally-ranked-passages" as const }
          : {}),
      },
      "findEvidence",
      startedAt,
    );
  };

  const admit = async ({ candidateHandle }: { candidateHandle: string }) => {
    const startedAt = performance.now();
    if (admissions >= budget.maximumAdmissions) {
      budgetExhausted = true;
      return finish(
        unresolved("budget-exhausted", "admission-budget-exhausted", []),
        "admitEvidence",
        startedAt,
      );
    }
    admissions += 1;
    const result = await resolver.admit({
      sessionId,
      sourceStateId: options.sourceStateId,
      candidateHandle,
    });
    if (
      result.outcome === "admitted" &&
      evidenceCharacters + result.passage.length >
        budget.maximumTotalEvidenceCharacters
    ) {
      budgetExhausted = true;
      return finish(
        unresolved("budget-exhausted", "evidence-character-budget-exhausted", [
          result.componentIdentity,
        ]),
        "admitEvidence",
        startedAt,
      );
    }
    if (result.outcome === "admitted") {
      evidenceCharacters += result.passage.length;
      admittedCount += 1;
      admittedAliases.add(result.evidenceAlias);
      admittedReferences.set(result.evidenceAlias, result);
    }
    return finish(result, "admitEvidence", startedAt);
  };

  const prepareAnswer = ({ claims }: { claims: unknown[] }) => {
    answerLedgerAttempts += 1;
    const result = validateAnswerLedger(
      { claims },
      expired ? new Set() : admittedAliases,
    );
    answerLedger = result.outcome === "valid" ? result.ledger : undefined;
    return {
      kind: "answer-ledger" as const,
      ...result,
    };
  };

  function finish<Result extends EvidenceResolutionResult>(
    result: Result,
    operation: EvidenceResolutionObservation["operation"],
    startedAt: number,
  ) {
    if (result.outcome === "refused") refusedCount += 1;
    if (result.outcome !== "admitted" && result.outcome !== "candidates")
      reasonCodes.add(result.reasonCode);
    const observedResult = observed(
      result,
      operation,
      startedAt,
      options.observe,
    );
    notifyUpdate(options.update, snapshot());
    return observedResult;
  }

  const snapshot = (): ResearchEvidenceSessionSnapshot => ({
    sessionId,
    sourceStateId: options.sourceStateId,
    resolverVersion: researchEvidenceResolverVersion,
    indexVersion: researchEvidenceIndexVersion,
    budget,
    consumption: {
      discoveries,
      candidates,
      admissions,
      modelSteps,
      evidenceCharacters,
    },
    componentScope: [...componentScope],
    candidateCount: candidates,
    reasonCodes: [...reasonCodes].filter((reason) => reason !== undefined),
    admittedCount,
    refusedCount,
    budgetExhausted,
  });

  const tools = {
    readSourceComponent: sourceComponentReader(options.components),
    findEvidence: tool({
      description:
        "Find canonical passages matching a natural-language evidence intent within a bounded Source-component scope. Select a returned candidate by its opaque handle; never send quotation text or offsets.",
      inputSchema: z.object({
        intent: z.string().trim().min(1).max(2_000),
        componentScope: z.array(z.string().min(1)).min(1).max(20),
        desiredRelation: z
          .enum(["supports", "qualifies", "conflicts", "background"])
          .default("supports"),
        limit: z.number().int().min(1).max(5).default(5),
      }),
      execute: discover,
    }),
    admitEvidence: tool({
      description:
        "Admit one candidate returned by findEvidence. A successful admission returns an answer-scoped evidence alias for Markdown markers.",
      inputSchema: z.object({
        candidateHandle: z.string().startsWith("candidate_").max(100),
        purpose: z.string().trim().min(1).max(1_000),
      }),
      execute: admit,
    }),
    prepareAnswer: tool({
      description:
        "Prepare the transient claim ledger before final synthesis. Declare each answer claim as source-dependent, interpretation, or original-reasoning and relate only admitted evidence aliases. A valid ledger permits final Markdown synthesis; an invalid result must be repaired.",
      inputSchema: z.object({
        claims: z.array(z.unknown()).max(100),
      }),
      execute: prepareAnswer,
    }),
  };
  const validateReferences = async (
    references: AliasedResearchPassageReference[],
  ) => {
    if (expired) return false;
    if (
      options.currentDerivativeId &&
      (await options.currentDerivativeId()) !== options.derivativeId
    )
      return false;
    return references.every((reference) => {
      const admitted = admittedReferences.get(reference.evidenceAlias);
      const component = options.components.find(
        ({ identity }) => identity === reference.componentIdentity,
      );
      return (
        admitted?.id === reference.id &&
        admitted.componentIdentity === reference.componentIdentity &&
        admitted.selection.offsetBasis === reference.selection.offsetBasis &&
        admitted.selection.exactText === reference.selection.exactText &&
        admitted.selection.normalizedStartOffset ===
          reference.selection.normalizedStartOffset &&
        admitted.selection.normalizedEndOffset ===
          reference.selection.normalizedEndOffset &&
        admitted.selection.prefix === reference.selection.prefix &&
        admitted.selection.suffix === reference.selection.suffix &&
        component?.plainText.slice(
          reference.selection.normalizedStartOffset,
          reference.selection.normalizedEndOffset,
        ) === reference.selection.exactText
      );
    });
  };
  return {
    id: sessionId,
    discover,
    admit,
    snapshot,
    hasValidAnswerLedger: () => answerLedger !== undefined,
    answerLedgerAttempts: () => answerLedgerAttempts,
    validateReferences,
    beginModelStep(stepNumber: number) {
      modelSteps = Math.max(modelSteps, stepNumber + 1);
      if (modelSteps === budget.maximumModelSteps) {
        budgetExhausted = true;
        reasonCodes.add("model-step-budget-exhausted");
      }
      notifyUpdate(options.update, snapshot());
    },
    tools,
    expire() {
      expired = true;
      answerLedger = undefined;
      admittedAliases.clear();
      admittedReferences.clear();
      resolver.expire();
    },
  };
}

function notifyUpdate(
  update: ResearchEvidenceToolOptions["update"],
  snapshot: ResearchEvidenceSessionSnapshot,
) {
  try {
    update?.(snapshot);
  } catch {
    // Diagnostics must not alter the evidence session.
  }
}
