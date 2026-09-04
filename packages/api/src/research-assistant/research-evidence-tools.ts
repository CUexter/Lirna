import { tool } from "ai";
import { z } from "zod";

import type { EvidenceResolutionObservation } from "./evidence-resolution";
import type { ResearchAnswerAttemptEvidence } from "./research-answer-attempt";
import { createResearchAnswerAttemptSession } from "./research-answer-attempt-evidence";
import { answerLedgerSchema } from "./research-answer-ledger";
import type {
  ResearchEvidenceBudget,
  ResearchEvidenceSessionSnapshot,
} from "./research-evidence-session-contract";
import type { EvidenceComponent } from "./research-evidence-tool-support";

export interface ResearchEvidenceToolOptions {
  components: EvidenceComponent[];
  sourceStateId: string;
  derivativeId: string;
  currentDerivativeId?: () => Promise<string | undefined>;
  observe?: (observation: EvidenceResolutionObservation) => void;
  update?: (snapshot: ResearchEvidenceSessionSnapshot) => void;
  budget?: ResearchEvidenceBudget;
  processingAllowed?: boolean;
}

export function createResearchEvidenceSession(
  options: ResearchEvidenceToolOptions,
) {
  const { evidence, session } = createResearchAnswerAttemptSession(options);
  return {
    ...session,
    tools: createResearchEvidenceTools(evidence),
  };
}

export function createResearchEvidenceTools(
  evidence: ResearchAnswerAttemptEvidence,
) {
  return {
    readSourceComponent: tool({
      description:
        "Read up to 100,000 characters of a Source component when broader context is needed before evidence discovery.",
      inputSchema: z.object({
        componentIdentity: z.string().min(1),
        offset: z.number().int().nonnegative().default(0),
      }),
      execute: evidence.readSourceComponent,
    }),
    groundEvidence: tool({
      description:
        "Find and admit the uniquely best canonical passage for a natural-language evidence intent. componentScope must contain only exact identity values from the Source component records in the user prompt, never component labels. Never send quotation text or offsets. If several passages are plausible, select one returned candidate with admitEvidence.",
      inputSchema: z.object({
        intent: z.string().trim().min(1).max(2_000),
        componentScope: z.array(z.string().min(1)).min(1).max(20),
        limit: z.number().int().min(1).max(5).default(5),
      }),
      execute: evidence.groundEvidence,
    }),
    admitEvidence: tool({
      description:
        "Admit one ambiguous candidate returned by groundEvidence. A successful admission returns an answer-scoped evidence alias for Markdown markers.",
      inputSchema: z.object({
        candidateHandle: z.string().startsWith("candidate_").max(100),
      }),
      execute: evidence.admitEvidence,
    }),
    prepareAnswer: tool({
      description:
        "Prepare the transient claim ledger before final synthesis. Declare each answer claim as source-dependent, interpretation, or original-reasoning and relate only admitted evidence aliases. A valid ledger permits final Markdown synthesis; an invalid result must be repaired.",
      inputSchema: answerLedgerSchema,
      execute: evidence.prepareAnswer,
    }),
  };
}
