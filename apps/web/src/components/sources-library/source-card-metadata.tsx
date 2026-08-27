import { Badge } from "@lirna/ui/components/badge";
import { Link } from "@tanstack/react-router";
import { ChevronDownIcon } from "lucide-react";

import { formatDate, formatState } from "./format";
import type { LibrarySource } from "./types";

export function SourceMetadata({ source }: { source: LibrarySource }) {
  return (
    <>
      <span>Added {formatDate(source.admittedAt)}</span>
      <span aria-hidden="true">·</span>
      <span>
        {source.states.length} {source.states.length === 1 ? "state" : "states"}
      </span>
      {source.states.length > 1 ? <StateHistory source={source} /> : null}
      <Badge className="ml-auto" variant="secondary">
        SEP
      </Badge>
    </>
  );
}

function StateHistory({ source }: { source: LibrarySource }) {
  return (
    <details className="group relative ml-auto">
      <summary className="flex h-7 cursor-pointer list-none items-center gap-1 px-1 text-muted-foreground text-xs hover:text-foreground [&::-webkit-details-marker]:hidden">
        Browse states
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
            <span>State {state.sequence + 1}</span>
            <span className="text-muted-foreground">
              {formatState(state.observationKey)}
            </span>
          </Link>
        ))}
      </div>
    </details>
  );
}
