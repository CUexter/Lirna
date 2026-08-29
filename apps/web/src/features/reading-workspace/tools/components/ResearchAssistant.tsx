import { Button } from "@lirna/ui/components/button";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupTextarea,
} from "@lirna/ui/components/input-group";
import { useMutation } from "@tanstack/react-query";
import { MessageCircleQuestionIcon, SendIcon, XIcon } from "lucide-react";
import { type FormEvent, useState } from "react";

import { inquiry } from "@/clients/inquiry";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export function ReadingResearchAssistant({
  componentIdentity,
  componentLabel,
  sourceId,
  stateId,
  sourceTitle,
}: {
  componentIdentity: string;
  componentLabel: string;
  sourceId: string;
  stateId: string;
  sourceTitle: string;
}) {
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [error, setError] = useState<string>();
  const ask = useMutation(inquiry.sources.assistant.ask.mutationOptions());

  async function submitQuestion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextQuestion = question.trim();
    if (!nextQuestion || ask.isPending) return;
    setQuestion("");
    setError(undefined);
    setMessages((current) => [
      ...current,
      { role: "user", content: nextQuestion },
    ]);
    try {
      const result = await ask.mutateAsync({
        componentIdentity,
        question: nextQuestion,
        sourceId,
        stateId,
      });
      setMessages((current) => [
        ...current,
        { role: "assistant", content: result.answer },
      ]);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "The research assistant could not answer.",
      );
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
        onClick={() => setOpen((current) => !current)}
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
            if (event.key === "Escape") setOpen(false);
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
              onClick={() => setOpen(false)}
              size="icon-sm"
              type="button"
              variant="ghost"
            >
              <XIcon />
            </Button>
          </header>

          <div
            aria-live="polite"
            className="flex flex-1 flex-col justify-end gap-4 overflow-y-auto p-4"
          >
            <div className="border-primary border-l-2 pl-3">
              <p className="font-medium text-sm">Ask about this Source state</p>
              <p className="mt-1 text-muted-foreground text-xs/relaxed">
                Answers will remain provisional and connect claims to exact
                evidence. No answer becomes a Draft or Owned note automatically.
              </p>
            </div>
            {messages.map((message, index) => (
              <div
                className={
                  message.role === "user"
                    ? "ml-8 self-end rounded-md bg-primary px-3 py-2 text-primary-foreground text-sm"
                    : "mr-8 self-start rounded-md border bg-background px-3 py-2 text-sm"
                }
                key={`${message.role}-${index}`}
              >
                {message.content}
              </div>
            ))}
            {ask.isPending ? (
              <p className="text-muted-foreground text-sm">
                Reading this Source state…
              </p>
            ) : null}
            {error ? (
              <p className="text-destructive text-sm" role="alert">
                {error}
              </p>
            ) : null}
          </div>

          <form className="border-t p-4" onSubmit={submitQuestion}>
            <label className="sr-only" htmlFor="reading-research-question">
              Question
            </label>
            <InputGroup>
              <InputGroupTextarea
                autoFocus
                id="reading-research-question"
                onChange={(event) => setQuestion(event.currentTarget.value)}
                placeholder="Ask a question about this Source…"
                rows={3}
                value={question}
              />
              <InputGroupAddon align="block-end" className="justify-between">
                <span>Answers remain temporary and provisional.</span>
                <InputGroupButton
                  aria-label="Send question"
                  disabled={!question.trim() || ask.isPending}
                  size="icon-sm"
                  type="submit"
                  variant="default"
                >
                  <SendIcon />
                </InputGroupButton>
              </InputGroupAddon>
            </InputGroup>
          </form>
        </aside>
      ) : null}
    </>
  );
}
