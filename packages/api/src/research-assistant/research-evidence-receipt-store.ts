import type { db } from "@lirna/db";
import { researchEvidenceReceipts } from "@lirna/db/schema/research-threads";

import type { ResearchEvidenceDecisionReceipt } from "./research-evidence-session-contract";

export interface ResearchEvidenceReceiptOperations {
  record(receipt: ResearchEvidenceDecisionReceipt): Promise<void>;
}

export class DrizzleResearchEvidenceReceiptStore
  implements ResearchEvidenceReceiptOperations
{
  constructor(private readonly database: typeof db) {}

  async record(receipt: ResearchEvidenceDecisionReceipt): Promise<void> {
    await this.database.insert(researchEvidenceReceipts).values({
      sessionId: receipt.sessionId,
      researchThreadId: receipt.researchThreadId,
      questionMessageId: receipt.questionMessageId,
      attemptedAnswerMessageId: receipt.attemptedAnswerMessageId,
      sourceStateId: receipt.sourceStateId,
      resolverVersion: receipt.resolverVersion,
      indexVersion: receipt.indexVersion,
      budget: receipt.budget,
      consumption: receipt.consumption,
      candidateCount: receipt.candidateCount,
      reasonCodes: receipt.reasonCodes,
      admittedCount: receipt.admittedCount,
      refusedCount: receipt.refusedCount,
      budgetExhausted: receipt.budgetExhausted,
      outcome: receipt.outcome,
      ...(receipt.terminalReasonCode
        ? { terminalReasonCode: receipt.terminalReasonCode }
        : {}),
      latencyBucket: receipt.latencyBucket,
    });
  }
}
