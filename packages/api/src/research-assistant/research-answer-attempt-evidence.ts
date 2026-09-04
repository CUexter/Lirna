import type { ResearchAnswerAttemptEvidence } from "./research-answer-attempt";
import { createResearchEvidenceSessionCore } from "./research-evidence-session";
import type { ResearchEvidenceSessionOptions } from "./research-evidence-session-contract";
import { createSourceComponentReader } from "./research-evidence-tool-support";

export function createResearchAnswerAttemptSession(
  options: ResearchEvidenceSessionOptions,
) {
  const session = createResearchEvidenceSessionCore(options);
  const evidence: ResearchAnswerAttemptEvidence = {
    readSourceComponent: createSourceComponentReader(options.components),
    async groundEvidence(input) {
      const discovery = await session.discover(input);
      if (discovery.outcome !== "candidates") return discovery;
      const candidate = discovery.candidates[0];
      return candidate
        ? session.admit({ candidateHandle: candidate.handle })
        : discovery;
    },
    admitEvidence: session.admit,
    prepareAnswer: session.prepareAnswer,
    beginModelStep: session.beginModelStep,
    snapshot: session.snapshot,
    hasValidAnswerLedger: session.hasValidAnswerLedger,
    validAnswerLedger: session.validAnswerLedger,
    answerLedgerAttempts: session.answerLedgerAttempts,
  };
  return { evidence, session };
}
