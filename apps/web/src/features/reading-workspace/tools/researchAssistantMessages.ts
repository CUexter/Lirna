import { selectionDraftForText } from "../annotations/domUtils";
import type {
  ResearchAssistantMessage,
  ResearchThread,
} from "./researchAssistantTransport";

export function messagesForThread(
  thread: ResearchThread | undefined,
  plainText: string,
): ResearchAssistantMessage[] {
  return (
    thread?.messages.map((message) => {
      const metadata = metadataForMessage(message, plainText);
      return {
        id: message.id,
        role: message.role,
        parts: [{ type: "text" as const, text: message.content }],
        ...(metadata ? { metadata } : {}),
      };
    }) ?? []
  );
}

function metadataForMessage(
  message: ResearchThread["messages"][number],
  plainText: string,
): ResearchAssistantMessage["metadata"] | undefined {
  const metadata: NonNullable<ResearchAssistantMessage["metadata"]> = {};
  const selection = message.selectedText
    ? selectionDraftForText(plainText, message.selectedText)
    : undefined;
  if (selection) metadata.selection = selection;
  if (message.references?.length) metadata.references = message.references;
  if (message.temporaryEvidence?.length)
    metadata.attachmentDescriptors = message.temporaryEvidence;
  if (message.model) metadata.model = message.model;
  if (message.parentMessageId)
    metadata.parentMessageId = message.parentMessageId;
  if (message.regeneratedFromAnswerId)
    metadata.regeneratedFromAnswerId = message.regeneratedFromAnswerId;
  if (message.answerAlternatives)
    metadata.answerAlternatives = message.answerAlternatives;
  return Object.keys(metadata).length ? metadata : undefined;
}
