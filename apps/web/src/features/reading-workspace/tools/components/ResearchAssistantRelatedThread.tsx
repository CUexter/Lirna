import { Button } from "@lirna/ui/components/button";
import { Input } from "@lirna/ui/components/input";
import { Label } from "@lirna/ui/components/label";
import { GitForkIcon } from "lucide-react";
import { type FormEvent, useRef, useState } from "react";

import type { ResearchAssistantMessage } from "../researchAssistantTransport";

interface RelatedThreadAttempt {
  creationId: string;
  rejected: boolean;
  submitted: boolean;
  title: string;
}

export function ResearchAssistantRelatedThread({
  disabled,
  onCreate,
  prefix,
  sourceAnswerMessageId,
}: {
  disabled: boolean;
  onCreate: (input: {
    creationId: string;
    sourceAnswerMessageId: string;
    title: string;
  }) => Promise<"created" | "indeterminate" | "rejected">;
  prefix: ResearchAssistantMessage[];
  sourceAnswerMessageId: string;
}) {
  const [attempt, setAttempt] = useState<RelatedThreadAttempt>();
  const [creating, setCreating] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function openPreview() {
    setAttempt(
      (current) =>
        current ?? {
          creationId: crypto.randomUUID(),
          rejected: false,
          submitted: false,
          title: "",
        },
    );
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!attempt || creating) return;
    const title = attempt.title.trim();
    if (!title) return;
    const submitted = { ...attempt, submitted: true, title };
    setAttempt(submitted);
    setCreating(true);
    const outcome = await onCreate({
      creationId: submitted.creationId,
      sourceAnswerMessageId,
      title,
    });
    setCreating(false);
    if (outcome === "created") setAttempt(undefined);
    else
      setAttempt((current) =>
        current ? { ...current, rejected: outcome === "rejected" } : current,
      );
  }

  function beginNewAttempt() {
    setAttempt((current) =>
      current
        ? {
            creationId: crypto.randomUUID(),
            rejected: false,
            submitted: false,
            title: current.title,
          }
        : current,
    );
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  if (!attempt)
    return (
      <Button
        aria-label="Start related Research thread"
        disabled={disabled}
        onClick={openPreview}
        size="sm"
        type="button"
        variant="ghost"
      >
        <GitForkIcon data-icon="inline-start" />
        Start related thread
      </Button>
    );

  return (
    <section
      aria-label="Related Research thread preview"
      className="mt-2 flex w-full flex-col gap-3 border border-border bg-muted/30 p-3 text-foreground"
    >
      <div>
        <h3 className="font-medium text-sm">Inherited conversation</h3>
        <p className="text-muted-foreground text-xs">
          Only this prefix will be copied. The current Research thread will not
          change.
        </p>
      </div>
      <ol className="flex max-h-48 flex-col gap-2 overflow-y-auto border-l pl-3">
        {prefix.map((message) => (
          <li key={message.id} className="text-xs">
            <span className="font-medium">
              {message.role === "user" ? "Nathan" : "Research assistant"}
            </span>
            <p className="whitespace-pre-wrap text-muted-foreground">
              {messageText(message)}
            </p>
            {message.metadata?.selection ? (
              <p className="mt-1 whitespace-pre-wrap border-l pl-2 text-muted-foreground">
                Selected context: {message.metadata.selection.exactText}
              </p>
            ) : null}
            {message.metadata?.attachmentDescriptors?.map((attachment) => (
              <p
                className="mt-1 text-muted-foreground"
                key={`${attachment.filename}:${attachment.mediaType}`}
              >
                Temporary evidence: {attachment.filename} (
                {attachment.mediaType})
              </p>
            ))}
            {message.metadata?.references?.map((reference, index) => (
              <p
                className="mt-1 whitespace-pre-wrap border-l pl-2 text-muted-foreground"
                key={reference.id ?? `${reference.componentIdentity}:${index}`}
              >
                Reference from {reference.componentLabel}:{" "}
                {reference.selection.exactText}
              </p>
            ))}
          </li>
        ))}
      </ol>
      <form className="flex flex-col gap-2" onSubmit={create}>
        <Label htmlFor={`related-thread-title-${sourceAnswerMessageId}`}>
          New Research thread name
        </Label>
        <Input
          disabled={attempt.submitted}
          id={`related-thread-title-${sourceAnswerMessageId}`}
          maxLength={120}
          onChange={(event) =>
            setAttempt((current) =>
              current ? { ...current, title: event.target.value } : current,
            )
          }
          ref={inputRef}
          required
          value={attempt.title}
        />
        <div className="flex justify-end gap-2">
          {!attempt.submitted ? (
            <Button
              disabled={creating}
              onClick={() => setAttempt(undefined)}
              size="sm"
              type="button"
              variant="outline"
            >
              Cancel
            </Button>
          ) : attempt.rejected ? (
            <Button
              disabled={creating}
              onClick={beginNewAttempt}
              size="sm"
              type="button"
              variant="outline"
            >
              Begin new attempt
            </Button>
          ) : null}
          <Button
            disabled={disabled || creating || !attempt.title.trim()}
            size="sm"
            type="submit"
          >
            {attempt.submitted
              ? "Retry creation"
              : "Create related Research thread"}
          </Button>
        </div>
      </form>
    </section>
  );
}

function messageText(message: ResearchAssistantMessage) {
  return message.parts
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("");
}
