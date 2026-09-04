import { researchAssistantModelLabels } from "@lirna/api/client";
import { Button } from "@lirna/ui/components/button";
import { ChevronLeftIcon, ChevronRightIcon, RefreshCwIcon } from "lucide-react";

import type { ResearchAssistantMessage } from "../researchAssistantTransport";

export function ResearchAssistantAlternatives({
  disabled,
  message,
  onRegenerate,
  onSelect,
}: {
  disabled: boolean;
  message: ResearchAssistantMessage;
  onRegenerate?: () => void;
  onSelect?: (answerId: string) => void;
}) {
  const alternatives = message.metadata?.answerAlternatives;
  const model = message.metadata?.model;
  return (
    <div className="flex flex-wrap items-center gap-1 text-muted-foreground text-xs">
      {model ? <span>{researchAssistantModelLabels[model]}</span> : null}
      {alternatives && alternatives.total > 1 ? (
        <fieldset className="flex items-center">
          <legend className="sr-only">Answer alternatives</legend>
          <Button
            aria-label="Previous answer alternative"
            disabled={disabled || !alternatives.previousAnswerId}
            onClick={() => {
              if (alternatives.previousAnswerId)
                onSelect?.(alternatives.previousAnswerId);
            }}
            size="icon-sm"
            type="button"
            variant="ghost"
          >
            <ChevronLeftIcon />
          </Button>
          <span aria-live="polite" className="min-w-16 text-center">
            Answer {alternatives.position} of {alternatives.total}
          </span>
          <Button
            aria-label="Next answer alternative"
            disabled={disabled || !alternatives.nextAnswerId}
            onClick={() => {
              if (alternatives.nextAnswerId)
                onSelect?.(alternatives.nextAnswerId);
            }}
            size="icon-sm"
            type="button"
            variant="ghost"
          >
            <ChevronRightIcon />
          </Button>
        </fieldset>
      ) : null}
      {onRegenerate ? (
        <Button
          aria-label="Regenerate answer"
          disabled={disabled}
          onClick={onRegenerate}
          size="sm"
          type="button"
          variant="ghost"
        >
          <RefreshCwIcon />
          Regenerate
        </Button>
      ) : null}
    </div>
  );
}
