import { Shimmer } from "@lirna/ui/components/ai-elements/shimmer";
import { Bubble, BubbleContent } from "@lirna/ui/components/bubble";
import { Button } from "@lirna/ui/components/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@lirna/ui/components/empty";
import { Marker, MarkerContent, MarkerIcon } from "@lirna/ui/components/marker";
import { Message, MessageContent } from "@lirna/ui/components/message";
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from "@lirna/ui/components/message-scroller";
import { Spinner } from "@lirna/ui/components/spinner";
import {
  LocateFixedIcon,
  MessageCircleDashedIcon,
  QuoteIcon,
} from "lucide-react";

import type { SelectionDraft } from "../../annotations/domUtils";
import type { ArticlePassage } from "../../navigation/hooks/useShowInArticle";
import type {
  ResearchAssistantMessage,
  ResearchPassageReference,
} from "../researchAssistantTransport";
import { ResearchAssistantAlternatives } from "./ResearchAssistantAlternatives";
import { MessageAttachments } from "./ResearchAssistantComposer";
import { ResearchAssistantResponse } from "./ResearchAssistantResponse";
import {
  ResearchAssistantRetryStatus,
  retryQuestionFor,
  TemporaryEvidenceSummary,
} from "./ResearchAssistantRetryStatus";

export function ResearchAssistantTranscript({
  actions,
  error,
  messages,
  passageForReference,
  passageForSelection,
  pending,
  retryableQuestionId,
  selection,
}: {
  actions?: {
    regenerate?: (message: ResearchAssistantMessage) => void;
    retry?: (message: ResearchAssistantMessage) => void;
    selectAlternative?: (answerId: string) => void;
  };
  error?: string;
  messages: ResearchAssistantMessage[];
  passageForReference: (reference: ResearchPassageReference) => ArticlePassage;
  passageForSelection: (selection: SelectionDraft) => ArticlePassage;
  pending: boolean;
  retryableQuestionId?: string;
  selection?: SelectionDraft;
}) {
  const { regenerate, retry, selectAlternative } = actions ?? {};
  const lastMessage = messages.at(-1);
  const retryQuestion = retryQuestionFor(
    messages,
    pending,
    retryableQuestionId,
  );
  const selectionIsInTranscript = messages.some(
    (message) =>
      message.metadata?.selection?.exactText === selection?.exactText,
  );
  if (messages.length === 0 && !selection && !error) {
    return (
      <Empty className="h-full">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <MessageCircleDashedIcon />
          </EmptyMedia>
          <EmptyTitle>Ask this Source</EmptyTitle>
          <EmptyDescription>
            Explore the captured Source-state evidence. Answers remain
            provisional and never become a Draft or Owned note automatically.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }
  return (
    <MessageScrollerProvider autoScroll>
      <MessageScroller aria-busy={pending}>
        <MessageScrollerViewport>
          <MessageScrollerContent className="justify-end p-4">
            <MessageScrollerItem>
              <Marker variant="border">
                <MarkerContent>
                  Answers remain provisional. No answer becomes a Draft or Owned
                  note automatically.
                </MarkerContent>
              </Marker>
            </MessageScrollerItem>
            {selection && !selectionIsInTranscript ? (
              <MessageScrollerItem>
                <QuotedPassageAction passage={passageForSelection(selection)} />
              </MessageScrollerItem>
            ) : null}
            {messages.map((message) => (
              <TranscriptMessage
                key={message.id}
                lastMessageId={lastMessage?.id}
                message={message}
                onRegenerate={regenerate}
                onSelectAlternative={selectAlternative}
                passageForReference={passageForReference}
                passageForSelection={passageForSelection}
                pending={pending}
              />
            ))}
            {pending && lastMessage?.role === "user" ? (
              <MessageScrollerItem>
                <AssistantWaiting />
              </MessageScrollerItem>
            ) : null}
            {retryQuestion?.role === "user" ? (
              <MessageScrollerItem>
                <ResearchAssistantRetryStatus
                  message={retryQuestion}
                  onRetry={retry}
                  pending={pending}
                />
              </MessageScrollerItem>
            ) : null}
            {error ? (
              <MessageScrollerItem scrollAnchor>
                <p className="text-destructive text-sm" role="alert">
                  {error}
                </p>
              </MessageScrollerItem>
            ) : null}
          </MessageScrollerContent>
        </MessageScrollerViewport>
        <MessageScrollerButton />
      </MessageScroller>
    </MessageScrollerProvider>
  );
}

function TranscriptMessage({
  lastMessageId,
  message,
  onRegenerate,
  onSelectAlternative,
  passageForReference,
  passageForSelection,
  pending,
}: {
  lastMessageId?: string;
  message: ResearchAssistantMessage;
  onRegenerate?: (message: ResearchAssistantMessage) => void;
  onSelectAlternative?: (answerId: string) => void;
  passageForReference: (reference: ResearchPassageReference) => ArticlePassage;
  passageForSelection: (selection: SelectionDraft) => ArticlePassage;
  pending: boolean;
}) {
  const text = message.parts
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("");
  const hasTool = message.parts.some(
    (part) => part.type === "dynamic-tool" || part.type.startsWith("tool-"),
  );
  const hasAssistantContent = Boolean(text) || hasTool;
  const waiting =
    message.id === lastMessageId &&
    message.role === "assistant" &&
    pending &&
    !hasAssistantContent;
  const messageSelection = message.metadata?.selection;
  if (message.role === "assistant" && !hasAssistantContent && !waiting)
    return null;
  if (waiting)
    return (
      <MessageScrollerItem data-message-id={message.id}>
        <AssistantWaiting />
      </MessageScrollerItem>
    );
  if (message.role === "assistant")
    return (
      <AssistantTranscriptMessage
        message={message}
        onRegenerate={onRegenerate}
        onSelectAlternative={onSelectAlternative}
        passageForReference={passageForReference}
        pending={pending}
      />
    );
  return (
    <MessageScrollerItem data-message-id={message.id}>
      <Message align="end">
        <MessageContent>
          {message.metadata?.attachments?.length ? (
            <MessageAttachments attachments={message.metadata.attachments} />
          ) : null}
          <TemporaryEvidenceSummary message={message} />
          {messageSelection ? (
            <QuotedPassageAction
              className="mb-2"
              passage={passageForSelection(messageSelection)}
            />
          ) : null}
          <Bubble align="end" variant="default">
            <BubbleContent className="rounded-2xl px-3 py-2 text-sm">
              {text}
            </BubbleContent>
          </Bubble>
        </MessageContent>
      </Message>
    </MessageScrollerItem>
  );
}

function AssistantTranscriptMessage({
  message,
  onRegenerate,
  onSelectAlternative,
  passageForReference,
  pending,
}: {
  message: ResearchAssistantMessage;
  onRegenerate?: (message: ResearchAssistantMessage) => void;
  onSelectAlternative?: (answerId: string) => void;
  passageForReference: (reference: ResearchPassageReference) => ArticlePassage;
  pending: boolean;
}) {
  return (
    <MessageScrollerItem data-message-id={message.id}>
      <div className="flex flex-col gap-2">
        <ResearchAssistantResponse
          message={message}
          passageForReference={passageForReference}
        />
        <ResearchAssistantAlternatives
          disabled={pending}
          message={message}
          onRegenerate={
            message.metadata?.model && onRegenerate
              ? () => onRegenerate(message)
              : undefined
          }
          onSelect={onSelectAlternative}
        />
      </div>
    </MessageScrollerItem>
  );
}

function QuotedPassageAction({
  className,
  componentLabel,
  passage,
}: {
  className?: string;
  componentLabel?: string;
  passage: ArticlePassage;
}) {
  return (
    <Marker className={className}>
      <MarkerIcon className="self-start pt-0.5">
        <QuoteIcon />
      </MarkerIcon>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <MarkerContent className="mr-auto font-medium text-foreground">
            {componentLabel
              ? `Referenced in ${componentLabel}`
              : "Quoted passage"}
          </MarkerContent>
          <Button onClick={passage.show} size="xs" variant="outline">
            <LocateFixedIcon data-icon="inline-start" />
            Show in article
          </Button>
        </div>
        <blockquote className="mt-1 line-clamp-2 font-serif text-muted-foreground text-xs leading-5">
          {passage.text}
        </blockquote>
      </div>
    </Marker>
  );
}

function AssistantWaiting() {
  return (
    <Marker role="status">
      <MarkerIcon>
        <Spinner />
      </MarkerIcon>
      <MarkerContent>
        <Shimmer as="span" duration={1.5}>
          Reading this Source state…
        </Shimmer>
      </MarkerContent>
    </Marker>
  );
}
