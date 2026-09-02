import { Button } from "@lirna/ui/components/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@lirna/ui/components/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@lirna/ui/components/popover";
import { ChevronsUpDownIcon, PlusIcon } from "lucide-react";
import { useState } from "react";

import type { ResearchThreadSummary } from "../researchAssistantTransport";

export function ResearchThreadPicker({
  activeThreadId,
  disabled,
  onNew,
  onResume,
  threads,
}: {
  activeThreadId?: string;
  disabled: boolean;
  onNew: () => void;
  onResume: (threadId: string) => void;
  threads: ResearchThreadSummary[];
}) {
  const [open, setOpen] = useState(false);
  const activeThread = threads.find((thread) => thread.id === activeThreadId);

  function startNew() {
    setOpen(false);
    onNew();
  }

  function resume(threadId: string) {
    setOpen(false);
    onResume(threadId);
  }

  return (
    <div className="mt-2 flex gap-2">
      <Popover onOpenChange={setOpen} open={open}>
        <PopoverTrigger
          render={
            <Button
              aria-label="Research thread"
              className="min-w-0 flex-1 justify-between font-normal"
              disabled={disabled}
              type="button"
              variant="outline"
            />
          }
        >
          <span className="min-w-0 truncate">
            {activeThread?.title ?? "New Research thread"}
          </span>
          <ChevronsUpDownIcon
            aria-hidden="true"
            className="shrink-0 opacity-50"
          />
        </PopoverTrigger>
        <PopoverContent align="start" className="w-(--anchor-width) p-0">
          <Command>
            <CommandInput placeholder="Search Research threads…" />
            <CommandList>
              <CommandEmpty>No Research threads found.</CommandEmpty>
              <CommandGroup>
                <CommandItem forceMount onSelect={startNew}>
                  <PlusIcon aria-hidden="true" />
                  New Research thread
                </CommandItem>
              </CommandGroup>
              <CommandGroup heading="Past Research threads">
                {threads.map((thread) => (
                  <CommandItem
                    data-checked={thread.id === activeThreadId || undefined}
                    key={thread.id}
                    onSelect={() => resume(thread.id)}
                    value={`${thread.title} ${thread.id}`}
                  >
                    <span className="min-w-0 flex-1 truncate">
                      {thread.title}
                    </span>
                    <span className="text-muted-foreground tabular-nums">
                      {new Date(thread.updatedAt).toLocaleDateString()}
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      <Button
        aria-label="Start new Research thread"
        disabled={disabled || !activeThreadId}
        onClick={startNew}
        size="icon-sm"
        type="button"
        variant="outline"
      >
        <PlusIcon />
      </Button>
    </div>
  );
}
