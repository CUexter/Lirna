import { Shimmer } from "@lirna/ui/components/ai-elements/shimmer";
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
import { ResearchAssistantQuestion } from "./ResearchAssistantQuestion";
import { ResearchAssistantRelatedThread } from "./ResearchAssistantRelatedThread";
import { ResearchAssistantResponse } from "./ResearchAssistantResponse";
import {
  ResearchAssistantRetryStatus,
  retryQuestionFor,
  TemporaryEvidenceSummary,
} from "./ResearchAssistantRetryStatus";

interface TranscriptActions {
  canCreateRelated?: (message: ResearchAssistantMessage) => boolean;
  canReviseQuestion?: (message: ResearchAssistantMessage) => boolean;
  regenerate?: (message: ResearchAssistantMessage) => void;
  createRelated?: (
    message: ResearchAssistantMessage,
    input: { creationId: string; title: string },
  ) => Promise<"created" | "indeterminate" | "rejected">;
  retry?: (message: ResearchAssistantMessage) => void;
  reviseQuestion?: (
    message: ResearchAssistantMessage,
    question: string,
  ) => Promise<boolean>;
  selectAlternative?: (answerId: string) => void;
  selectQuestionAlternative?: (questionId: string) => void;
}

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
  actions?: TranscriptActions;
  error?: string;
  messages: ResearchAssistantMessage[];
  passageForReference: (reference: ResearchPassageReference) => ArticlePassage;
  passageForSelection: (selection: SelectionDraft) => ArticlePassage;
  pending: boolean;
  retryableQuestionId?: string;
  selection?: SelectionDraft;
}) {
  const { retry } = actions ?? {};
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
            {messages.map((message, index) => (
              <TranscriptMessage
                key={message.id}
                actions={actions}
                lastMessageId={lastMessage?.id}
                message={message}
                passageForReference={passageForReference}
                passageForSelection={passageForSelection}
                pending={pending}
                prefix={messages.slice(0, index + 1)}
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
  actions,
  lastMessageId,
  message,
  passageForReference,
  passageForSelection,
  pending,
  prefix,
}: {
  actions?: TranscriptActions;
  lastMessageId?: string;
  message: ResearchAssistantMessage;
  passageForReference: (reference: ResearchPassageReference) => ArticlePassage;
  passageForSelection: (selection: SelectionDraft) => ArticlePassage;
  pending: boolean;
  prefix: ResearchAssistantMessage[];
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
  const {
    canCreateRelated,
    canReviseQuestion,
    createRelated,
    regenerate,
    reviseQuestion,
    selectAlternative,
    selectQuestionAlternative,
  } = actions ?? {};
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
        onCreateRelated={
          createRelated && canCreateRelated?.(message)
            ? createRelated
            : undefined
        }
        onRegenerate={regenerate}
        onSelectAlternative={selectAlternative}
        passageForReference={passageForReference}
        pending={pending}
        prefix={prefix}
      />
    );
  return (
    <UserTranscriptMessage
      canRevise={canReviseQuestion?.(message) ?? false}
      message={message}
      onRevise={reviseQuestion}
      onSelectAlternative={selectQuestionAlternative}
      passageForSelection={passageForSelection}
      pending={pending}
      text={text}
    />
  );
}

function UserTranscriptMessage({
  canRevise,
  message,
  onRevise,
  onSelectAlternative,
  passageForSelection,
  pending,
  text,
}: {
  canRevise: boolean;
  message: ResearchAssistantMessage;
  onRevise?: TranscriptActions["reviseQuestion"];
  onSelectAlternative?: (questionId: string) => void;
  passageForSelection: (selection: SelectionDraft) => ArticlePassage;
  pending: boolean;
  text: string;
}) {
  const selection = message.metadata?.selection;
  return (
    <MessageScrollerItem data-message-id={message.id}>
      <Message align="end">
        <MessageContent>
          {message.metadata?.attachments?.length ? (
            <MessageAttachments attachments={message.metadata.attachments} />
          ) : null}
          <TemporaryEvidenceSummary message={message} />
          {selection ? (
            <QuotedPassageAction
              className="mb-2"
              passage={passageForSelection(selection)}
            />
          ) : null}
          <ResearchAssistantQuestion
            message={message}
            onRevise={
              canRevise && onRevise
                ? (question) => onRevise(message, question)
                : undefined
            }
            onSelect={onSelectAlternative}
            pending={pending}
            text={text}
          />
        </MessageContent>
      </Message>
    </MessageScrollerItem>
  );
}

function AssistantTranscriptMessage({
  message,
  onCreateRelated,
  onRegenerate,
  onSelectAlternative,
  passageForReference,
  pending,
  prefix,
}: {
  message: ResearchAssistantMessage;
  onCreateRelated?: (
    message: ResearchAssistantMessage,
    input: { creationId: string; title: string },
  ) => Promise<"created" | "indeterminate" | "rejected">;
  onRegenerate?: (message: ResearchAssistantMessage) => void;
  onSelectAlternative?: (answerId: string) => void;
  passageForReference: (reference: ResearchPassageReference) => ArticlePassage;
  pending: boolean;
  prefix: ResearchAssistantMessage[];
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
        {onCreateRelated ? (
          <ResearchAssistantRelatedThread
            disabled={pending}
            onCreate={(input) => onCreateRelated(message, input)}
            prefix={prefix}
            sourceAnswerMessageId={message.id}
          />
        ) : null}
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
