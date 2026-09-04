import { Bubble, BubbleContent } from "@lirna/ui/components/bubble";
import { Button } from "@lirna/ui/components/button";
import { Textarea } from "@lirna/ui/components/textarea";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  PencilIcon,
  RefreshCwIcon,
} from "lucide-react";
import { type FormEvent, useEffect, useRef, useState } from "react";

import type { ResearchAssistantMessage } from "../researchAssistantTransport";

export function ResearchAssistantQuestion({
  message,
  onRevise,
  onSelect,
  pending,
  text,
}: {
  message: ResearchAssistantMessage;
  onRevise?: (question: string) => Promise<boolean>;
  onSelect?: (questionId: string) => void;
  pending: boolean;
  text: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(text);
  const editorRef = useRef<HTMLTextAreaElement>(null);
  const alternatives = message.metadata?.questionAlternatives;
  useEffect(() => {
    if (editing) editorRef.current?.focus();
  }, [editing]);

  function cancel() {
    setDraft(text);
    setEditing(false);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const revised = draft.trim();
    if (!revised || revised === text || pending) return;
    if (await onRevise?.(revised)) setEditing(false);
  }

  if (editing) {
    return (
      <form className="w-full max-w-xl space-y-2" onSubmit={submit}>
        <label className="sr-only" htmlFor={`revise-${message.id}`}>
          Revised question
        </label>
        <Textarea
          className="field-sizing-content min-h-24 w-full resize-y"
          disabled={pending}
          id={`revise-${message.id}`}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== "Escape") return;
            event.preventDefault();
            event.stopPropagation();
            cancel();
          }}
          ref={editorRef}
          value={draft}
        />
        <div className="flex justify-end gap-2">
          <Button onClick={cancel} size="sm" type="button" variant="ghost">
            Cancel
          </Button>
          <Button
            disabled={!draft.trim() || draft.trim() === text || pending}
            size="sm"
            type="submit"
          >
            <RefreshCwIcon />
            Regenerate from here
          </Button>
        </div>
      </form>
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
