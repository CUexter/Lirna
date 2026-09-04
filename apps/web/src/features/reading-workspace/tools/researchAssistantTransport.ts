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

export interface TemporaryEvidenceDescriptor {
  filename: string;
  mediaType: string;
}

export interface ResearchAssistantMessageMetadata {
  answerAlternatives?: {
    position: number;
    total: number;
    previousAnswerId?: string;
    nextAnswerId?: string;
  };
  attachments?: TemporaryEvidenceAttachment[];
  attachmentDescriptors?: TemporaryEvidenceDescriptor[];
  model?: ResearchAssistantModel;
  parentMessageId?: string;
  regeneratedFromAnswerId?: string;
  references?: Array<ResearchPassageReference & { evidenceAlias?: string }>;
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
  onAnswerCommitted,
  onThreadCreated,
}: {
  componentIdentity: string;
  model: ResearchAssistantModel;
  selection?: SelectionDraft;
  sourceId: string;
  stateId: string;
  threadId?: string;
  onThreadAllocated?: (threadId: string) => void;
  onAnswerCommitted?: (threadId: string) => void | Promise<void>;
  onThreadCreated?: (threadId: string) => void | Promise<void>;
}): ChatTransport<ResearchAssistantMessage> {
  let threadId = initialThreadId;
  return {
    async sendMessages({ abortSignal, body, messageId, messages, trigger }) {
      if (trigger === "regenerate-message") {
        if (!threadId || !messageId)
          throw new Error("A Research answer operation is required");
        const activeThreadId = threadId;
        const operation = answerOperation(body);
        const iterator =
          operation.kind === "regenerate"
            ? await inquiryClient.sources.assistant.regenerate(
                {
                  model,
                  answerMessageId: messageId,
                  expectedSelectedLeafMessageId:
                    operation.expectedSelectedLeafMessageId,
                  sourceId,
                  stateId,
                  threadId: activeThreadId,
                  ...attachmentInput(operation.attachments),
                },
                { signal: abortSignal },
              )
            : await inquiryClient.sources.assistant.retry(
                {
                  model,
                  questionMessageId: messageId,
                  sourceId,
                  stateId,
                  threadId: activeThreadId,
                  ...attachmentInput(operation.attachments),
                },
                { signal: abortSignal },
              );
        return streamFromIterator(iterator, () =>
          onAnswerCommitted?.(activeThreadId),
        );
      }
      const message = latestUserMessage(messages);
      if (!message) throw new Error("A user question is required");
      const question = message.parts
        .filter((part) => part.type === "text")
        .map((part) => part.text)
        .join("")
        .trim();
      if (!question) throw new Error("A user question is required");
      const messageIndex = messages.findLastIndex(
        ({ id }) => id === message.id,
      );
      const expectedSelectedLeafMessageId =
        messages[messageIndex - 1]?.id ?? null;
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
          expectedSelectedLeafMessageId,
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
      return streamFromIterator(iterator, async () => {
        await onAnswerCommitted?.(threadId as string);
        if (createdThreadId) await onThreadCreated?.(createdThreadId);
      });
    },
    async reconnectToStream() {
      return null;
    },
  };
}

function attachmentInput(attachments: unknown) {
  return Array.isArray(attachments) && attachments.length
    ? { attachments: attachments as TemporaryEvidenceAttachment[] }
    : {};
}

function answerOperation(body: object | undefined):
  | {
      kind: "regenerate";
      expectedSelectedLeafMessageId: string;
      attachments?: unknown;
    }
  | { kind: "retry"; attachments?: unknown } {
  if (body && "operation" in body && body.operation === "regenerate") {
    if (
      !("expectedSelectedLeafMessageId" in body) ||
      typeof body.expectedSelectedLeafMessageId !== "string"
    )
      throw new Error("The selected Research path is required");
    return {
      kind: "regenerate",
      expectedSelectedLeafMessageId: body.expectedSelectedLeafMessageId,
      ...(body && "attachments" in body
        ? { attachments: body.attachments }
        : {}),
    };
  }
  if (body && "operation" in body && body.operation === "retry")
    return {
      kind: "retry",
      ...(body && "attachments" in body
        ? { attachments: body.attachments }
        : {}),
    };
  throw new Error("A Research answer operation is required");
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
  onFinish?: () => void | Promise<void>,
): ReadableStream<UIMessageChunk> {
  let cancelled = false;
  return new ReadableStream({
    async pull(controller) {
      try {
        const next = await iterator.next();
        if (cancelled) return;
        if (next.done) {
          await onFinish?.();
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

export function selectResearchAnswer(input: {
  sourceId: string;
  stateId: string;
  threadId: string;
  answerMessageId: string;
  expectedSelectedLeafMessageId: string;
}) {
  return inquiryClient.sources.assistant.selectAnswer(input);
}

export function createRelatedResearchThread(input: {
  creationId: string;
  sourceId: string;
  stateId: string;
  sourceThreadId: string;
  sourceAnswerMessageId: string;
  title: string;
}) {
  return inquiryClient.sources.assistant.createRelated(input);
}

export function requiredAttachments(message: ResearchAssistantMessage) {
  return (
    message.metadata?.attachmentDescriptors ??
    message.metadata?.attachments?.map(({ filename, mediaType }) => ({
      filename,
      mediaType,
    })) ??
    []
  );
}

export function attachmentsMatch(
  required: TemporaryEvidenceDescriptor[],
  available: TemporaryEvidenceAttachment[],
) {
  const orderedRequired = [...required].sort(compareTemporaryEvidence);
  const orderedAvailable = [...available].sort(compareTemporaryEvidence);
  return (
    orderedRequired.length === orderedAvailable.length &&
    orderedRequired.every((descriptor, index) => {
      const attachment = orderedAvailable[index];
      return (
        attachment?.filename === descriptor.filename &&
        attachment.mediaType === descriptor.mediaType
      );
    })
  );
}

function compareTemporaryEvidence(
  left: TemporaryEvidenceDescriptor,
  right: TemporaryEvidenceDescriptor,
) {
  return (
    left.filename.localeCompare(right.filename) ||
    left.mediaType.localeCompare(right.mediaType)
  );
}
