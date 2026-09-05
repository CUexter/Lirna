import { Bubble, BubbleContent } from "@lirna/ui/components/bubble";
import { Button } from "@lirna/ui/components/button";
import { Textarea } from "@lirna/ui/components/textarea";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  HistoryIcon,
  PencilIcon,
  RefreshCwIcon,
} from "lucide-react";
import { type FormEvent, useEffect, useRef, useState } from "react";

import type { ResearchAssistantMessage } from "../researchAssistantTransport";

export function ResearchAssistantQuestion({
  message,
  onRevise,
  onSelect,
  onUseEditedHistory,
  pending,
  text,
}: {
  message: ResearchAssistantMessage;
  onRevise?: (question: string) => Promise<boolean>;
  onSelect?: (questionId: string) => void;
  onUseEditedHistory?: (question: string) => Promise<boolean>;
  pending: boolean;
  text: string;
}) {
  const [editing, setEditing] = useState(false);
  const alternatives = message.metadata?.questionAlternatives;

  if (editing && onRevise) {
    return (
      <QuestionEditor
        messageId={message.id}
        onCancel={() => setEditing(false)}
        onRevise={onRevise}
        onUseEditedHistory={onUseEditedHistory}
        pending={pending}
        text={text}
      />
    );
  }

  return (
    <div className="flex max-w-full flex-col items-end gap-1">
      <Bubble align="end" variant="default">
        <BubbleContent
          className="rounded-2xl px-3 py-2 text-sm"
          onDoubleClick={() => {
            if (!pending && onRevise) setEditing(true);
          }}
        >
          {text}
        </BubbleContent>
      </Bubble>
      <div className="flex items-center gap-1 text-muted-foreground text-xs">
        {alternatives && alternatives.total > 1 ? (
          <fieldset className="flex items-center">
            <legend className="sr-only">Question alternatives</legend>
            <Button
              aria-label="Previous question alternative"
              disabled={pending || !alternatives.previousQuestionId}
              onClick={() => {
                if (alternatives.previousQuestionId)
                  onSelect?.(alternatives.previousQuestionId);
              }}
              size="icon-sm"
              type="button"
              variant="ghost"
            >
              <ChevronLeftIcon />
            </Button>
            <span aria-live="polite" className="min-w-20 text-center">
              Question {alternatives.position} of {alternatives.total}
            </span>
            <Button
              aria-label="Next question alternative"
              disabled={pending || !alternatives.nextQuestionId}
              onClick={() => {
                if (alternatives.nextQuestionId)
                  onSelect?.(alternatives.nextQuestionId);
              }}
              size="icon-sm"
              type="button"
              variant="ghost"
            >
              <ChevronRightIcon />
            </Button>
          </fieldset>
        ) : null}
        {onRevise ? (
          <Button
            aria-label="Edit question"
            disabled={pending}
            onClick={() => setEditing(true)}
            size="sm"
            type="button"
            variant="ghost"
          >
            <PencilIcon />
            Edit
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function QuestionEditor({
  messageId,
  onCancel,
  onRevise,
  onUseEditedHistory,
  pending,
  text,
}: {
  messageId: string;
  onCancel: () => void;
  onRevise: (question: string) => Promise<boolean>;
  onUseEditedHistory?: (question: string) => Promise<boolean>;
  pending: boolean;
  text: string;
}) {
  const [draft, setDraft] = useState(text);
  const editorRef = useRef<HTMLTextAreaElement>(null);
  const revised = draft.trim();
  const disabled = !revised || revised === text || pending;
  useEffect(() => editorRef.current?.focus(), []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!disabled && (await onRevise(revised))) onCancel();
  }

  async function useEditedHistory() {
    if (!disabled && (await onUseEditedHistory?.(revised))) onCancel();
  }

  return (
    <form className="w-full max-w-xl space-y-2" onSubmit={submit}>
      <label className="sr-only" htmlFor={`revise-${messageId}`}>
        Revised question
      </label>
      <Textarea
        className="field-sizing-content min-h-24 w-full resize-y"
        disabled={pending}
        id={`revise-${messageId}`}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key !== "Escape") return;
          event.preventDefault();
          event.stopPropagation();
          onCancel();
        }}
        ref={editorRef}
        value={draft}
      />
      <div className="flex flex-wrap justify-end gap-2">
        <Button onClick={onCancel} size="sm" type="button" variant="ghost">
          Cancel
        </Button>
        {onUseEditedHistory ? (
          <Button
            disabled={disabled}
            onClick={() => void useEditedHistory()}
            size="sm"
            type="button"
            variant="outline"
          >
            <HistoryIcon />
            Use edited history
          </Button>
        ) : null}
        <Button disabled={disabled} size="sm" type="submit">
          <RefreshCwIcon />
          Regenerate from here
        </Button>
      </div>
    </form>
  );
}
