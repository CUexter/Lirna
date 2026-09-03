import { randomUUID } from "node:crypto";

import { observeQuietly } from "../observation";
import {
  ambiguousDiscovery,
  closeRelevance,
  type EvidenceResolutionObservation,
  type EvidenceResolutionResult,
} from "./evidence-resolution";
import { createEvidenceResolver } from "./evidence-resolver";
import {
  type AnswerLedger,
  validateAnswerLedger,
} from "./research-answer-ledger";
import { createReferenceValidator } from "./research-evidence-references";
import {
  defaultResearchEvidenceBudget,
  type ResearchEvidenceSession,
  type ResearchEvidenceSessionOptions,
  type ResearchEvidenceSessionSnapshot,
  researchEvidenceIndexVersion,
  researchEvidenceResolverVersion,
  validateResearchEvidenceBudget,
} from "./research-evidence-session-contract";
import {
  completeResearchEvidenceSession,
  refuseResearchEvidenceSession,
} from "./research-evidence-session-stream";
import {
  observeEvidenceResolution,
  unresolved,
} from "./research-evidence-tool-support";

export function createResearchEvidenceSessionCore(
  options: ResearchEvidenceSessionOptions,
): ResearchEvidenceSession {
  const createdAt = performance.now();
  const sessionId = `session_${randomUUID()}`;
  const budget = validateResearchEvidenceBudget(
    options.budget ?? defaultResearchEvidenceBudget,
  );
  const componentIdentities = new Set(
    options.components.map(({ identity }) => identity),
  );
  let activeDerivativeId = options.derivativeId;
  const createResolver = (derivativeId: string) =>
    createEvidenceResolver({
      sessionId,
      sourceStateId: options.sourceStateId,
      derivativeId,
      components: options.components,
      currentDerivativeId: options.currentDerivativeId,
    });
  let resolver = createResolver(activeDerivativeId);
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
      return observeOutcome(
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
      return observeOutcome(
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
      return observeOutcome(
        unresolved("none", "no-relevant-passage", requestedScope, 0),
        "findEvidence",
        startedAt,
      );
    const ambiguity = ambiguousDiscovery(rankedCandidates);
    const selected =
      ambiguity.outcome === "ambiguous"
        ? rankedCandidates
            .filter(({ relevanceScore }) =>
              closeRelevance(relevanceScore, rankedCandidates[0]),
            )
            .slice(0, budget.maximumCandidatesPerDiscovery)
        : rankedCandidates.slice(0, candidateLimit);
    candidates += selected.length;
    return observeOutcome(
      {
        kind: "evidence-discovery" as const,
        outcome: ambiguity.outcome,
        componentScope: requestedScope,
        candidateCount: selected.length,
        candidates: selected,
        ...(ambiguity.reasonCode ? { reasonCode: ambiguity.reasonCode } : {}),
      },
      "findEvidence",
      startedAt,
    );
  };

  const admit = async ({ candidateHandle }: { candidateHandle: string }) => {
    const startedAt = performance.now();
    if (admissions >= budget.maximumAdmissions) {
      budgetExhausted = true;
      return observeOutcome(
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
      return observeOutcome(
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
    if (
      result.outcome === "stale" &&
      result.reasonCode === "derivative-changed"
    )
      await restartDiscovery();
    return observeOutcome(result, "admitEvidence", startedAt);
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

  function observeOutcome<Result extends EvidenceResolutionResult>(
    result: Result,
    operation: EvidenceResolutionObservation["operation"],
    startedAt: number,
  ) {
    if (result.outcome === "refused") refusedCount += 1;
    if (result.outcome !== "admitted" && result.outcome !== "candidates")
      reasonCodes.add(result.reasonCode);
    const observedResult = observeEvidenceResolution(
      result,
      operation,
      startedAt,
      options.observe,
    );
    notifyUpdate(options.update, snapshot());
    return observedResult;
  }

  const restartDiscovery = async () => {
    const nextDerivativeId = await options.currentDerivativeId?.();
    if (expired || !nextDerivativeId || nextDerivativeId === activeDerivativeId)
      return;
    activeDerivativeId = nextDerivativeId;
    resolver = createResolver(nextDerivativeId);
    clearAdmissionState();
  };

  const clearAdmissionState = () => {
    answerLedger = undefined;
    admittedAliases.clear();
    admittedReferences.clear();
  };

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

  const validateReferences = createReferenceValidator({
    components: options.components,
    isExpired: () => expired,
    currentDerivativeId: options.currentDerivativeId,
    activeDerivativeId: () => activeDerivativeId,
    admittedReference: (alias) => admittedReferences.get(alias),
  });

  return {
    id: sessionId,
    discover,
    admit,
    snapshot,
    hasValidAnswerLedger: () => answerLedger !== undefined,
    validAnswerLedger: () => answerLedger,
    answerLedgerAttempts: () => answerLedgerAttempts,
    prepareAnswer,
    validateReferences,
    async run(start, completion) {
      if (options.processingAllowed === false) {
        observeOutcome(
          unresolved(
            "refused",
            "policy-denied",
            options.components.map(({ identity }) => identity),
          ),
          "findEvidence",
          createdAt,
        );
        return refuseResearchEvidenceSession(this, completion, createdAt);
      }
      try {
        return completeResearchEvidenceSession(await start(), this, completion);
      } catch (error) {
        return completeResearchEvidenceSession(
          new ReadableStream({
            start(controller) {
              controller.error(error);
            },
          }),
          this,
          completion,
        );
      }
    },
    beginModelStep(stepNumber: number) {
      modelSteps = Math.max(modelSteps, stepNumber + 1);
      if (modelSteps === budget.maximumModelSteps) {
        budgetExhausted = true;
        reasonCodes.add("model-step-budget-exhausted");
      }
      notifyUpdate(options.update, snapshot());
    },
    expire() {
      expired = true;
      clearAdmissionState();
      resolver.expire();
    },
  };
}

function notifyUpdate(
  update: ResearchEvidenceSessionOptions["update"],
  snapshot: ResearchEvidenceSessionSnapshot,
) {
  observeQuietly(() => update?.(snapshot));
}
