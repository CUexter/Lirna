import type { ObservationLevel } from "../../observation";
import type { EvidenceResolutionObservation } from "../../research-assistant/evidence-resolution";
import type { ResearchAssistantAnswerOptions } from "../../research-assistant/research-assistant";

interface ResearchAssistantObservationContext {
  debugErrors?: boolean;
  observation?: {
    requestId: string;
    emit(level: ObservationLevel, record: Record<string, unknown>): void;
  };
}

export function researchAssistantAnswerOptions(
  context: ResearchAssistantObservationContext,
): ResearchAssistantAnswerOptions {
  let observedFailure = false;
  return {
    onError(error) {
      const cause = error instanceof Error ? error : new Error(String(error));
      if (!observedFailure) {
        observedFailure = true;
        emit(context, "error", {
          event: "research_assistant.stream_failed",
          operation: "sources.assistant.ask",
          outcome: "failure",
          err: cause,
        });
      }
      const reference = context.observation?.requestId;
      const detail = context.debugErrors ? `: ${cause.message}` : ".";
      return `Research assistant response failed${detail}${
        reference ? ` Error reference: ${reference}.` : ""
      }`;
    },
    onEvidenceResolution(observation) {
      evidenceResolution(context, observation);
    },
  };
}

function evidenceResolution(
  context: ResearchAssistantObservationContext,
  observation: EvidenceResolutionObservation,
) {
  emit(context, "info", {
    event: "research_assistant.evidence_resolution",
    ...observation,
  });
}

function emit(
  context: ResearchAssistantObservationContext,
  level: ObservationLevel,
  record: Record<string, unknown>,
) {
  try {
    context.observation?.emit(level, record);
  } catch {
    // Diagnostics must not alter stream handling.
  }
}
