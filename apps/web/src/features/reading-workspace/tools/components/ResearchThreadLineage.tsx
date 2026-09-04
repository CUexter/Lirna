import { Button } from "@lirna/ui/components/button";
import { GitBranchIcon } from "lucide-react";

import type { ResearchThreadLineage as Lineage } from "../researchAssistantTransport";

export function ResearchThreadLineage({
  disabled,
  lineage,
  onOpenRelated,
  onOpenSource,
}: {
  disabled: boolean;
  lineage: Lineage;
  onOpenRelated: (threadId: string) => void;
  onOpenSource: (threadId: string, answerMessageId: string) => void;
}) {
  if (!lineage.source && lineage.relatedThreads.length === 0) return null;
  const source = lineage.source;
  return (
    <section aria-label="Research thread lineage" className="mt-3 text-xs">
      {source ? (
        <p className="text-muted-foreground">
          Related to{" "}
          <Button
            aria-label={`Open source Research thread: ${source.title}`}
            disabled={disabled}
            onClick={() =>
              onOpenSource(source.threadId, source.answerMessageId)
            }
            size="xs"
            type="button"
            variant="link"
          >
            {source.title}
          </Button>{" "}
          from its answer branch. Inherited messages are copied context, not new
          work in this inquiry.
          <span className="block pt-1">
            Divergence answer: {source.answerPreview}
          </span>
        </p>
      ) : null}
      {lineage.relatedThreads.length ? (
        <div className="mt-2">
          <p className="font-medium">Related inquiries</p>
          <ul className="mt-1 flex flex-col items-start gap-1">
            {lineage.relatedThreads.map((thread) => (
              <li key={thread.threadId}>
                <Button
                  aria-label={`Open related Research thread: ${thread.title}`}
                  disabled={disabled}
                  onClick={() => onOpenRelated(thread.threadId)}
                  size="xs"
                  type="button"
                  variant="link"
                >
                  <GitBranchIcon data-icon="inline-start" />
                  {thread.title}
                </Button>{" "}
                <span className="text-muted-foreground">
                  from: {thread.answerPreview}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
