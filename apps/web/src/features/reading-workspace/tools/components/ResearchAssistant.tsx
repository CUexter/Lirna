import { useChat } from "@ai-sdk/react";
import { MessageResponse } from "@lirna/ui/components/ai-elements/message";
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
import type { ChatTransport } from "ai";
import { MessageCircleDashedIcon, XIcon } from "lucide-react";
import {
  type FormEvent,
  type RefObject,
  useEffect,
  useRef,
  useState,
} from "react";

import type { SelectionDraft } from "../../annotations/domUtils";
import {
  createResearchAssistantTransport,
  type ResearchAssistantMessage,
  type TemporaryEvidenceAttachment,
} from "../researchAssistantTransport";
import {
  MessageAttachments,
  QuestionComposer,
} from "./ResearchAssistantComposer";

export function ReadingResearchAssistant({
  onClose,
  open,
  reading: {
    componentIdentity,
    componentLabel,
    sourceId,
    sourceTitle,
    stateId,
  },
  selection,
  transport,
  triggerRef,
}: {
  onClose: () => void;
  open: boolean;
  reading: {
    componentIdentity: string;
    componentLabel: string;
    sourceId: string;
    sourceTitle: string;
    stateId: string;
  };
  selection?: SelectionDraft;
  transport?: ChatTransport<ResearchAssistantMessage>;
  triggerRef: RefObject<HTMLButtonElement | null>;
}) {
  const [question, setQuestion] = useState("");
  const [attachments, setAttachments] = useState<TemporaryEvidenceAttachment[]>(
    [],
  );
  const [composerError, setComposerError] = useState<string>();
  const questionRef = useRef<HTMLTextAreaElement>(null);
  const { clearError, error, messages, sendMessage, status, stop } =
    useChat<ResearchAssistantMessage>({
      transport:
        transport ??
        createResearchAssistantTransport({
          componentIdentity,
          selection,
          sourceId,
          stateId,
        }),
    });
  const pending = status === "submitted" || status === "streaming";

  useEffect(() => {
    if (open) questionRef.current?.focus({ preventScroll: Boolean(selection) });
  }, [open, selection]);

  useEffect(
    () => () => {
      void stop();
    },
    [stop],
  );

  function close() {
    void stop();
    onClose();
    requestAnimationFrame(() => triggerRef.current?.focus());
  }

  function submitQuestion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextQuestion = question.trim();
    if (!nextQuestion || pending) return;
    const submittedAttachments = attachments;
    setQuestion("");
    setComposerError(undefined);
    clearError();
    setAttachments([]);
    void sendMessage({
      role: "user",
      parts: [
        { type: "text", text: nextQuestion },
        ...submittedAttachments.map(({ dataUrl, filename, mediaType }) => ({
          type: "file" as const,
          filename,
          mediaType,
          url: dataUrl,
        })),
      ],
      ...(submittedAttachments.length
        ? { metadata: { attachments: submittedAttachments } }
        : {}),
    });
  }

  return open ? (
    <aside
      aria-label="Research assistant"
      className="h-[calc(100vh-1rem)] w-full"
      id="reading-research-assistant"
      onKeyDown={(event) => {
        if (event.key === "Escape") close();
      }}
    >
      <div className="flex h-full flex-col overflow-hidden bg-popover text-popover-foreground">
        <header className="flex items-start gap-3 border-b px-4 py-3">
          <div className="min-w-0 flex-1">
            <h2 className="font-semibold font-serif text-lg">
              Research assistant
            </h2>
            <p className="truncate text-muted-foreground text-xs">
              {sourceTitle} · {componentLabel}
            </p>
          </div>
          <Button
            aria-label="Close assistant"
            onClick={close}
            size="icon-sm"
            type="button"
            variant="ghost"
          >
            <XIcon />
          </Button>
        </header>
        <div className="min-h-0 flex-1 overflow-hidden">
          <AssistantTranscript
            error={composerError ?? error?.message}
            messages={messages}
            pending={pending}
            selection={selection}
          />
        </div>
        <div className="border-t p-4">
          <QuestionComposer
            attachment={{
              attachments,
              onAttachmentsChange: setAttachments,
              onError: setComposerError,
            }}
            onQuestionChange={setQuestion}
            onSubmit={submitQuestion}
            pending={pending}
            question={question}
            questionRef={questionRef}
            selection={selection}
          />
        </div>
      </div>
    </aside>
  ) : null;
}

function AssistantTranscript({
  error,
  messages,
  pending,
  selection,
}: {
  error?: string;
  messages: ResearchAssistantMessage[];
  pending: boolean;
  selection?: SelectionDraft;
}) {
  const lastMessage = messages.at(-1);
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
    <MessageScrollerProvider>
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
            {selection ? (
              <MessageScrollerItem>
                <Marker>
                  <MarkerContent>Selected Source-state evidence</MarkerContent>
                </Marker>
                <blockquote className="mt-2 border-primary border-l-2 pl-3 text-sm">
                  {selection.exactText}
                </blockquote>
              </MessageScrollerItem>
            ) : null}
            {messages.map((message) => {
              const text = message.parts
                .filter((part) => part.type === "text")
                .map((part) => part.text)
                .join("");
              const waiting =
                message.id === lastMessage?.id &&
                message.role === "assistant" &&
                pending &&
                !text;
              if (message.role === "assistant" && !text && !waiting)
                return null;
              return (
                <MessageScrollerItem
                  key={message.id}
                  scrollAnchor={message.role === "user"}
                >
                  {waiting ? (
                    <AssistantWaiting />
                  ) : message.role === "assistant" ? (
                    <MessageResponse>{text}</MessageResponse>
                  ) : (
                    <Message align="end">
                      <MessageContent>
                        {message.metadata?.attachments?.length ? (
                          <MessageAttachments
                            attachments={message.metadata.attachments}
                          />
                        ) : null}
                        <Bubble align="end" variant="default">
                          <BubbleContent className="rounded-2xl px-3 py-2 text-sm">
                            {text}
                          </BubbleContent>
                        </Bubble>
                      </MessageContent>
                    </Message>
                  )}
                </MessageScrollerItem>
              );
            })}
            {pending && lastMessage?.role === "user" ? (
              <MessageScrollerItem>
                <AssistantWaiting />
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
