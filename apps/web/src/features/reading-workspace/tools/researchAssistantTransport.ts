import { inquiryClient } from "@/clients/inquiryClient";
import type { SelectionDraft } from "../annotations/domUtils";

export async function* streamResearchAssistantAnswer({
  componentIdentity,
  question,
  selection,
  signal,
  sourceId,
  stateId,
}: {
  componentIdentity: string;
  selection?: SelectionDraft;
  signal: AbortSignal;
  sourceId: string;
  stateId: string;
  question: string;
}): AsyncGenerator<string> {
  const iterator = await inquiryClient.sources.assistant.ask(
    {
      componentIdentity,
      question,
      ...(selection ? { selection } : {}),
      sourceId,
      stateId,
    },
    { signal },
  );
  for await (const chunk of iterator) {
    if (chunk.type === "text-delta") yield chunk.delta;
    if (chunk.type === "error") throw new Error(chunk.errorText);
  }
}
