import { Badge } from "@lirna/ui/components/badge";
import { Button, buttonVariants } from "@lirna/ui/components/button";
import {
  Card,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@lirna/ui/components/card";
import { Link } from "@tanstack/react-router";
import {
  BookOpenIcon,
  ChevronDownIcon,
  LoaderCircleIcon,
  Trash2Icon,
} from "lucide-react";

import { formatDate, formatState } from "./format";
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
  const currentState = source.states[0];
  return (
    <Card className="flex flex-col transition-shadow hover:shadow-[4px_4px_0_var(--border)]">
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Badge variant="secondary">SEP</Badge>
            <span className="text-muted-foreground text-xs">
              {source.states.length}{" "}
              {source.states.length === 1 ? "state" : "states"}
            </span>
          </div>
          <span className="font-mono text-[0.65rem] text-muted-foreground">
            SRC-{String(source.id).slice(0, 4).toUpperCase()}
          </span>
        </div>
        <CardTitle className="max-w-[24rem] font-serif text-2xl leading-tight">
          {source.title}
        </CardTitle>
        <CardDescription>
          Added {formatDate(source.admittedAt)} · Latest state{" "}
          {currentState ? `#${currentState.sequence}` : "unavailable"}
        </CardDescription>
      </CardHeader>
      <CardFooter className="mt-auto flex-wrap gap-2">
        {currentState ? (
          <Link
            className={buttonVariants({ size: "sm" })}
            params={{ sourceId: source.id, stateId: currentState.id }}
            to="/sources/$sourceId/$stateId"
          >
            <BookOpenIcon data-icon="inline-start" />
            Open reading workspace
          </Link>
        ) : null}
        {source.states.length > 1 ? <StateHistory source={source} /> : null}
        <Button
          aria-label={`Delete ${source.title}`}
          className="ml-auto"
          disabled={deleting}
          onClick={() => {
            if (
              window.confirm(
                `Delete ${source.title}? This removes all of its Source states and reading data.`,
              )
            ) {
              onDelete(source.id);
            }
          }}
          size="sm"
          type="button"
          variant="outline"
        >
          {deleting ? (
            <LoaderCircleIcon
              aria-hidden="true"
              className="animate-spin"
              data-icon="inline-start"
            />
          ) : (
            <Trash2Icon data-icon="inline-start" />
          )}
          {deleting ? "Deleting…" : "Delete Source"}
        </Button>
      </CardFooter>
    </Card>
  );
}

function StateHistory({ source }: { source: LibrarySource }) {
  return (
    <details className="group relative ml-auto">
      <summary className="flex h-7 cursor-pointer list-none items-center gap-1 px-1 text-muted-foreground text-xs hover:text-foreground [&::-webkit-details-marker]:hidden">
        Browse states{" "}
        <ChevronDownIcon
          aria-hidden="true"
          className="size-3 transition-transform group-open:rotate-180"
        />
      </summary>
      <div className="absolute right-0 bottom-8 z-10 min-w-52 border border-border bg-popover p-1 text-popover-foreground shadow-md">
        {source.states.map((state) => (
          <Link
            className="flex items-center justify-between gap-4 px-2 py-1.5 text-xs hover:bg-muted"
            key={state.id}
            params={{ sourceId: source.id, stateId: state.id }}
            to="/sources/$sourceId/$stateId"
          >
            <span>State {state.sequence}</span>
            <span className="text-muted-foreground">
              {formatState(state.observationKey)}
            </span>
          </Link>
        ))}
      </div>
    </details>
  );
}
