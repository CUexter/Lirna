import type { ChatTransport, UIMessage, UIMessageChunk } from "ai";
import { inquiryClient } from "@/clients/inquiryClient";
import type { SelectionDraft } from "../annotations/domUtils";

export type TemporaryEvidenceMediaType =
  | "application/json"
  | "application/pdf"
  | "image/gif"
  | "image/jpeg"
  | "image/png"
  | "image/webp"
  | "text/csv"
  | "text/markdown"
  | "text/plain";

export interface TemporaryEvidenceAttachment {
  dataUrl: string;
  filename: string;
  mediaType: TemporaryEvidenceMediaType;
  size: number;
}

export interface ResearchAssistantMessageMetadata {
  attachments?: TemporaryEvidenceAttachment[];
}

export type ResearchAssistantMessage =
  UIMessage<ResearchAssistantMessageMetadata>;

export function createResearchAssistantTransport({
  componentIdentity,
  selection,
  sourceId,
  stateId,
}: {
  componentIdentity: string;
  selection?: SelectionDraft;
  sourceId: string;
  stateId: string;
}): ChatTransport<ResearchAssistantMessage> {
  return {
    async sendMessages({ abortSignal, messages }) {
      const message = latestUserMessage(messages);
      if (!message) throw new Error("A user question is required");
      const question = message.parts
        .filter((part) => part.type === "text")
        .map((part) => part.text)
        .join("")
        .trim();
      if (!question) throw new Error("A user question is required");

      const iterator = await inquiryClient.sources.assistant.ask(
        {
          componentIdentity,
          ...(message.metadata?.attachments?.length
            ? { attachments: message.metadata.attachments }
            : {}),
          question,
          ...(selection ? { selection } : {}),
          sourceId,
          stateId,
        },
        { signal: abortSignal },
      );
      return streamFromIterator(iterator);
    },
    async reconnectToStream() {
      return null;
    },
  };
}

function latestUserMessage(messages: ResearchAssistantMessage[]) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.role === "user") return message;
  }
  return undefined;
}

function streamFromIterator(
  iterator: AsyncIterator<UIMessageChunk>,
): ReadableStream<UIMessageChunk> {
  return new ReadableStream({
    async pull(controller) {
      try {
        const next = await iterator.next();
        if (next.done) controller.close();
        else controller.enqueue(next.value);
      } catch (error) {
        controller.error(error);
      }
    },
    async cancel() {
      await iterator.return?.();
    },
  });
}
