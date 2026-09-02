import type { ResearchAssistantModel } from "@lirna/api/client";
import type { ChatTransport, UIMessage, UIMessageChunk } from "ai";
import type { InquiryOutputs } from "@/clients/inquiry";
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
  references?: ResearchPassageReference[];
  selection?: SelectionDraft;
}

export type ResearchAssistantMessage =
  UIMessage<ResearchAssistantMessageMetadata>;
export type ResearchThreadSummary =
  InquiryOutputs["sources"]["assistant"]["list"][number];
export type ResearchThread = InquiryOutputs["sources"]["assistant"]["get"];
export type ResearchPassageReference = NonNullable<
  ResearchThread["messages"][number]["references"]
>[number];

export function createResearchAssistantTransport({
  componentIdentity,
  model,
  selection,
  sourceId,
  stateId,
  threadId: initialThreadId,
  onThreadAllocated,
  onThreadCreated,
}: {
  componentIdentity: string;
  model: ResearchAssistantModel;
  selection?: SelectionDraft;
  sourceId: string;
  stateId: string;
  threadId?: string;
  onThreadAllocated?: (threadId: string) => void;
  onThreadCreated?: (threadId: string) => void;
}): ChatTransport<ResearchAssistantMessage> {
  let threadId = initialThreadId;
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
      let createdThreadId: string | undefined;
      if (!threadId) {
        const thread = await inquiryClient.sources.assistant.create({
          componentIdentity,
          question,
          sourceId,
          stateId,
        });
        threadId = thread.id;
        createdThreadId = thread.id;
        onThreadAllocated?.(thread.id);
      }

      const iterator = await inquiryClient.sources.assistant.ask(
        {
          componentIdentity,
          model,
          ...(message.metadata?.attachments?.length
            ? { attachments: message.metadata.attachments }
            : {}),
          question,
          ...(selection ? { selection } : {}),
          sourceId,
          stateId,
          threadId,
        },
        { signal: abortSignal },
      );
      return streamFromIterator(iterator, () => {
        if (createdThreadId) onThreadCreated?.(createdThreadId);
      });
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
  onFinish?: () => void,
): ReadableStream<UIMessageChunk> {
  let cancelled = false;
  return new ReadableStream({
    async pull(controller) {
      try {
        const next = await iterator.next();
        if (cancelled) return;
        if (next.done) {
          onFinish?.();
          controller.close();
        } else controller.enqueue(next.value);
      } catch (error) {
        if (!cancelled) controller.error(error);
      }
    },
    async cancel() {
      cancelled = true;
      await iterator.return?.();
    },
  });
}

export function listResearchThreads(input: {
  sourceId: string;
  stateId: string;
}) {
  return inquiryClient.sources.assistant.list(input);
}

export function loadResearchThread(input: {
  sourceId: string;
  stateId: string;
  threadId: string;
}) {
  return inquiryClient.sources.assistant.get(input);
}
