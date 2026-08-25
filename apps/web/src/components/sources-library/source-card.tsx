import { Button } from "@lirna/ui/components/button";
import {
  Card,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@lirna/ui/components/card";
import { useNavigate } from "@tanstack/react-router";
import { LoaderCircleIcon, Trash2Icon } from "lucide-react";
import {
  type KeyboardEvent,
  type MouseEvent,
  useEffect,
  useState,
} from "react";

import { formatPublicationDate } from "./format";
import { SourceMetadata } from "./source-card-metadata";
import type { LibrarySource } from "./types";

export function SourceCard({
  deleting,
  onDelete,
  source,
}: {
  deleting: boolean;
  onDelete: (sourceId: string) => void;
  source: LibrarySource;
}) {
  const deleteConfirmation = useDeleteConfirmation();
  const navigation = useSourceCardNavigation(source);

  return (
    <Card
      aria-label={`Open ${source.title} in reading workspace`}
      className={`relative flex cursor-pointer flex-col p-0 transition-shadow hover:shadow-[4px_4px_0_var(--border)] ${
        deleteConfirmation.confirming
          ? "bg-red-50 ring-2 ring-red-500 dark:bg-red-950/30"
          : ""
      }`}
      onClick={navigation.onClick}
      onKeyDown={navigation.onKeyDown}
      role="link"
      tabIndex={0}
    >
      <SourceCardHeader
        confirmingDelete={deleteConfirmation.confirming}
        deleting={deleting}
        onStartDelete={deleteConfirmation.start}
        source={source}
      />
      <SourceCardFooter
        confirmingDelete={deleteConfirmation.confirming}
        deleting={deleting}
        onCancelDelete={deleteConfirmation.cancel}
        onDelete={onDelete}
        secondsRemaining={deleteConfirmation.secondsRemaining}
        source={source}
      />
    </Card>
  );
}

function useDeleteConfirmation() {
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [secondsRemaining, setSecondsRemaining] = useState(5);

  useEffect(() => {
    if (!confirmingDelete) return;

    const expiresAt = Date.now() + 5_000;
    const timer = window.setInterval(() => {
      const remaining = Math.ceil((expiresAt - Date.now()) / 1_000);
      if (remaining <= 0) {
        setConfirmingDelete(false);
        setSecondsRemaining(5);
        return;
      }
      setSecondsRemaining(remaining);
    }, 250);

    return () => window.clearInterval(timer);
  }, [confirmingDelete]);

  return {
    cancel: () => setConfirmingDelete(false),
    confirming: confirmingDelete,
    secondsRemaining,
    start: () => {
      setSecondsRemaining(5);
      setConfirmingDelete(true);
    },
  };
}

function useSourceCardNavigation(source: LibrarySource) {
  const currentState = source.states[0];
  const navigate = useNavigate();
  const openReadingWorkspace = () => {
    if (!currentState) return;
    navigate({
      params: { sourceId: source.id, stateId: currentState.id },
      to: "/sources/$sourceId/$stateId",
    });
  };

  return {
    onClick: (event: MouseEvent<HTMLDivElement>) => {
      if ((event.target as HTMLElement).closest("button, a, summary")) return;
      openReadingWorkspace();
    },
    onKeyDown: (event: KeyboardEvent<HTMLDivElement>) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      openReadingWorkspace();
    },
  };
}

function SourceCardHeader({
  confirmingDelete,
  deleting,
  onStartDelete,
  source,
}: {
  confirmingDelete: boolean;
  deleting: boolean;
  onStartDelete: () => void;
  source: LibrarySource;
}) {
  return (
    <CardHeader className="gap-1.5 p-4">
      <div className="flex items-start justify-between gap-3">
        <CardTitle className="max-w-[24rem] font-serif text-xl leading-tight">
          {source.title}
        </CardTitle>
        {confirmingDelete ? null : (
          <Button
            aria-label={`Delete ${source.title}`}
            className="-mt-1 -mr-1 shrink-0 text-muted-foreground hover:text-destructive"
            disabled={deleting}
            onClick={onStartDelete}
            size="icon"
            type="button"
            variant="ghost"
          >
            {deleting ? (
              <LoaderCircleIcon aria-hidden="true" className="animate-spin" />
            ) : (
              <Trash2Icon />
            )}
          </Button>
        )}
      </div>
      <p className="font-medium text-sm">
        {source.authors?.join(", ") || "Author unknown"}
      </p>
      <CardDescription className="flex flex-wrap gap-x-2 text-xs">
        <span>{source.publisher || "Publisher unknown"}</span>
        <span aria-hidden="true">·</span>
        <span>
          Published {formatPublicationDate(source.publicationHistory ?? [])}
        </span>
      </CardDescription>
    </CardHeader>
  );
}

function SourceCardFooter({
  confirmingDelete,
  deleting,
  onCancelDelete,
  onDelete,
  secondsRemaining,
  source,
}: {
  confirmingDelete: boolean;
  deleting: boolean;
  onCancelDelete: () => void;
  onDelete: (sourceId: string) => void;
  secondsRemaining: number;
  source: LibrarySource;
}) {
  return (
    <CardFooter className="flex-wrap gap-x-2 gap-y-1 px-4 py-2 text-muted-foreground text-xs">
      {confirmingDelete ? (
        <DeleteConfirmation
          deleting={deleting}
          onCancel={onCancelDelete}
          onConfirm={() => onDelete(source.id)}
          secondsRemaining={secondsRemaining}
          sourceTitle={source.title}
        />
      ) : (
        <SourceMetadata source={source} />
      )}
    </CardFooter>
  );
}

function DeleteConfirmation({
  deleting,
  onCancel,
  onConfirm,
  secondsRemaining,
  sourceTitle,
}: {
  deleting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  secondsRemaining: number;
  sourceTitle: string;
}) {
  return (
    <div
      aria-live="polite"
      className="flex w-full flex-wrap items-center justify-between gap-2 text-red-800 dark:text-red-200"
    >
      <div className="flex flex-col">
        <span className="font-semibold">Are you sure?</span>
        <span
          aria-label={`Confirmation expires in ${secondsRemaining} seconds`}
          className="text-red-700 dark:text-red-300"
          role="status"
        >
          Delete expires in <strong>{secondsRemaining}s</strong>
        </span>
      </div>
      <Button
        aria-label={`Confirm delete ${sourceTitle}`}
        disabled={deleting}
        onClick={onConfirm}
        size="sm"
        type="button"
        variant="destructive"
      >
        {deleting ? (
          <LoaderCircleIcon
            aria-hidden="true"
            className="animate-spin"
            data-icon="inline-start"
          />
        ) : null}
        {deleting ? "Deleting…" : "Yes, delete"}
      </Button>
      <Button
        disabled={deleting}
        onClick={onCancel}
        size="sm"
        type="button"
        variant="outline"
      >
        Cancel
      </Button>
    </div>
  );
}
