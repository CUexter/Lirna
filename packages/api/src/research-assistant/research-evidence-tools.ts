import { tool } from "ai";
import { z } from "zod";

import type { EvidenceResolutionObservation } from "./evidence-resolution";
import { answerLedgerSchema } from "./research-answer-ledger";
import { createResearchEvidenceSessionCore } from "./research-evidence-session";
import type {
  ResearchEvidenceBudget,
  ResearchEvidenceSessionSnapshot,
} from "./research-evidence-session-contract";
import {
  type EvidenceComponent,
  sourceComponentReader,
} from "./research-evidence-tool-support";

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
  const session = createResearchEvidenceSessionCore(options);
  return {
    ...session,
    tools: {
      readSourceComponent: sourceComponentReader(options.components),
      findEvidence: tool({
        description:
          "Find canonical passages matching a natural-language evidence intent within a bounded Source-component scope. componentScope must contain only exact identity values from the Source component records in the user prompt, never component labels. Select a returned candidate by its opaque handle; never send quotation text or offsets.",
        inputSchema: z.object({
          intent: z.string().trim().min(1).max(2_000),
          componentScope: z.array(z.string().min(1)).min(1).max(20),
          limit: z.number().int().min(1).max(5).default(5),
        }),
        execute: session.discover,
      }),
      admitEvidence: tool({
        description:
          "Admit one candidate returned by findEvidence. A successful admission returns an answer-scoped evidence alias for Markdown markers.",
        inputSchema: z.object({
          candidateHandle: z.string().startsWith("candidate_").max(100),
        }),
        execute: session.admit,
      }),
      prepareAnswer: tool({
        description:
          "Prepare the transient claim ledger before final synthesis. Declare each answer claim as source-dependent, interpretation, or original-reasoning and relate only admitted evidence aliases. A valid ledger permits final Markdown synthesis; an invalid result must be repaired.",
        inputSchema: answerLedgerSchema,
        execute: session.prepareAnswer,
      }),
    },
  };
}
