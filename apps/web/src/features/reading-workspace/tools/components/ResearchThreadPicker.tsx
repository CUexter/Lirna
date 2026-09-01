import { Button } from "@lirna/ui/components/button";
import {
  NativeSelect,
  NativeSelectOption,
} from "@lirna/ui/components/native-select";
import { PlusIcon } from "lucide-react";

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
  return (
    <div className="mt-2 flex gap-2">
      <NativeSelect
        aria-label="Research thread"
        className="min-w-0 flex-1"
        disabled={disabled}
        onChange={(event) => {
          if (event.target.value) onResume(event.target.value);
          else onNew();
        }}
        value={activeThreadId ?? ""}
      >
        <NativeSelectOption value="">New Research thread</NativeSelectOption>
        {threads.map((thread) => (
          <NativeSelectOption key={thread.id} value={thread.id}>
            {thread.title}
          </NativeSelectOption>
        ))}
      </NativeSelect>
      <Button
        aria-label="Start new Research thread"
        disabled={disabled || !activeThreadId}
        onClick={onNew}
        size="icon-sm"
        type="button"
        variant="outline"
      >
        <PlusIcon />
      </Button>
    </div>
  );
}
