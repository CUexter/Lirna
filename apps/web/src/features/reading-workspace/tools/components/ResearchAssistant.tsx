import { Bubble, BubbleContent } from "@lirna/ui/components/bubble";
import { Button } from "@lirna/ui/components/button";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupTextarea,
} from "@lirna/ui/components/input-group";
import { Marker, MarkerContent } from "@lirna/ui/components/marker";
import { Message, MessageContent } from "@lirna/ui/components/message";
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from "@lirna/ui/components/message-scroller";
import { MessageCircleQuestionIcon, SendIcon, XIcon } from "lucide-react";
import {
  type FormEvent,
  type RefObject,
  useEffect,
  useRef,
  useState,
} from "react";

import type { SelectionDraft } from "../../annotations/domUtils";
import { streamResearchAssistantAnswer } from "../researchAssistantTransport";
import { AssistantMarkdown } from "./AssistantMarkdown";

interface AssistantMessage {
  id: string;
  role: "assistant" | "user";
  text: string;
}

export function ReadingResearchAssistant({
  onClose,
  onOpenSource,
  open,
  reading: {
    componentIdentity,
    componentLabel,
    sourceId,
    sourceTitle,
    stateId,
  },
  selection,
}: {
  onClose: () => void;
  onOpenSource: () => void;
  open: boolean;
  reading: {
    componentIdentity: string;
    componentLabel: string;
    sourceId: string;
    sourceTitle: string;
    stateId: string;
  };
  selection?: SelectionDraft;
}) {
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState<AssistantMessage[]>([]);
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const questionRef = useRef<HTMLTextAreaElement>(null);
  const requestRef = useRef<AbortController>(null);

  useEffect(() => {
    if (open) questionRef.current?.focus({ preventScroll: Boolean(selection) });
  }, [open, selection]);

  useEffect(() => () => requestRef.current?.abort(), []);

  function close() {
    onClose();
    requestAnimationFrame(() => triggerRef.current?.focus());
  }

  async function submitQuestion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextQuestion = question.trim();
    if (!nextQuestion || pending) return;
    const assistantId = crypto.randomUUID();
    const request = new AbortController();
    requestRef.current = request;
    setQuestion("");
    setError(undefined);
    setPending(true);
    setMessages((current) => [
      ...current,
      { id: crypto.randomUUID(), role: "user", text: nextQuestion },
      { id: assistantId, role: "assistant", text: "" },
    ]);
    try {
      for await (const delta of streamResearchAssistantAnswer({
        componentIdentity,
        question: nextQuestion,
        selection,
        signal: request.signal,
        sourceId,
        stateId,
      })) {
        setMessages((current) =>
          current.map((message) =>
            message.id === assistantId
              ? { ...message, text: message.text + delta }
              : message,
          ),
        );
      }
    } catch (reason) {
      if (!request.signal.aborted) {
        setError(
          reason instanceof Error ? reason.message : "The answer failed",
        );
      }
    } finally {
      if (!request.signal.aborted) setPending(false);
    }
  }

  return (
    <>
      <Button
        aria-controls="reading-research-assistant"
        aria-expanded={open}
        aria-label="Ask this Source"
        className={`fixed top-1/2 z-[60] h-auto -translate-y-1/2 gap-2 px-2 py-3 shadow-lg transition-[right] [writing-mode:vertical-rl] ${
          open ? "right-[min(24rem,calc(100vw-2rem))]" : "right-0"
        }`}
        onClick={open ? close : onOpenSource}
        ref={triggerRef}
        type="button"
        variant="secondary"
      >
        <MessageCircleQuestionIcon />
        Ask
      </Button>
      {open ? (
        <aside
          aria-label="Research assistant"
          className="fixed top-0 right-0 z-50 flex h-full w-96 max-w-[calc(100vw-2rem)] flex-col border-l bg-popover text-popover-foreground shadow-lg"
          id="reading-research-assistant"
          onKeyDown={(event) => {
            if (event.key === "Escape") close();
          }}
        >
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

          <AssistantTranscript
            error={error}
            messages={messages}
            pending={pending}
            selection={selection}
          />
          <QuestionComposer
            onQuestionChange={setQuestion}
            onSubmit={submitQuestion}
            pending={pending}
            question={question}
            questionRef={questionRef}
            selection={selection}
          />
        </aside>
      ) : null}
    </>
  );
}

function AssistantTranscript({
  error,
  messages,
  pending,
  selection,
}: {
  error?: string;
  messages: AssistantMessage[];
  pending: boolean;
  selection?: SelectionDraft;
}) {
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
            {messages.map((message) => (
              <MessageScrollerItem key={message.id} scrollAnchor>
                <Message align={message.role === "user" ? "end" : "start"}>
                  <MessageContent>
                    <Bubble
                      align={message.role === "user" ? "end" : "start"}
                      variant={message.role === "user" ? "default" : "outline"}
                    >
                      <BubbleContent>
                        {message.role === "assistant" ? (
                          <AssistantMarkdown>{message.text}</AssistantMarkdown>
                        ) : (
                          <span>{message.text}</span>
                        )}
                      </BubbleContent>
                    </Bubble>
                  </MessageContent>
                </Message>
              </MessageScrollerItem>
            ))}
            {pending ? (
              <MessageScrollerItem scrollAnchor>
                <Marker>
                  <MarkerContent>Reading this Source state…</MarkerContent>
                </Marker>
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

function QuestionComposer({
  onQuestionChange,
  onSubmit,
  pending,
  question,
  questionRef,
  selection,
}: {
  onQuestionChange: (question: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  pending: boolean;
  question: string;
  questionRef: RefObject<HTMLTextAreaElement | null>;
  selection?: SelectionDraft;
}) {
  return (
    <form className="border-t p-4" onSubmit={onSubmit}>
      <label className="sr-only" htmlFor="reading-research-question">
        Question
      </label>
      <InputGroup>
        <InputGroupTextarea
          id="reading-research-question"
          onChange={(event) => onQuestionChange(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (
              event.key !== "Enter" ||
              event.shiftKey ||
              event.nativeEvent.isComposing
            ) {
              return;
            }
            event.preventDefault();
            event.currentTarget.form?.requestSubmit();
          }}
          placeholder={
            selection
              ? "Ask about the selected passage…"
              : "Ask a question about this Source…"
          }
          rows={3}
          ref={questionRef}
          value={question}
        />
        <InputGroupAddon align="block-end" className="justify-between">
          <span>Answers remain temporary and provisional.</span>
          <InputGroupButton
            aria-label="Send question"
            disabled={!question.trim() || pending}
            size="icon-sm"
            type="submit"
            variant="default"
          >
            <SendIcon />
          </InputGroupButton>
        </InputGroupAddon>
      </InputGroup>
    </form>
  );
}
