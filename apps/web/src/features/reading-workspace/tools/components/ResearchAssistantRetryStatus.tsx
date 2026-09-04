import { Button } from "@lirna/ui/components/button";

import type { ResearchAssistantMessage } from "../researchAssistantTransport";

export function retryQuestionFor(
  messages: ResearchAssistantMessage[],
  pending: boolean,
  retryableQuestionId?: string,
) {
  const lastMessage = messages.at(-1);
  if (lastMessage?.role === "user") return lastMessage;
  if (lastMessage?.role !== "assistant") return undefined;
  const latestQuestion = messages.findLast(({ role }) => role === "user");
  return pending || latestQuestion?.id === retryableQuestionId
    ? latestQuestion
    : undefined;
}

export function ResearchAssistantRetryStatus({
  message,
  onRetry,
  pending,
}: {
  message: ResearchAssistantMessage;
  onRetry?: (message: ResearchAssistantMessage) => void;
  pending: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <p className="text-muted-foreground text-sm">
        {pending
          ? "Research response in progress."
          : "This response did not complete."}
      </p>
      {onRetry ? (
        <Button
          disabled={pending}
          onClick={() => onRetry(message)}
          variant="outline"
        >
          Retry answer
        </Button>
      ) : null}
    </div>
  );
}

export function TemporaryEvidenceSummary({
  message,
}: {
  message: ResearchAssistantMessage;
}) {
  if (
    message.metadata?.attachments?.length ||
    !message.metadata?.attachmentDescriptors?.length
  )
    return null;
  return (
    <p className="text-muted-foreground text-xs">
      Temporary evidence:{" "}
      {message.metadata.attachmentDescriptors
        .map(({ filename, mediaType }) => `${filename} (${mediaType})`)
        .join(", ")}
    </p>
  );
}
