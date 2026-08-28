import { Button } from "@lirna/ui/components/button";

export interface CitationEvidenceAvailabilityProps {
  availability: "pending" | "unavailable";
  mentionId: string;
  message?: string;
  onCancel: () => void;
  onRetryEvidence?: () => void;
}

export function CitationEvidenceAvailability(
  props: CitationEvidenceAvailabilityProps,
) {
  return (
    <section className="mt-3 space-y-3 rounded-md border p-3" role="status">
      <h3 className="font-serif text-lg">Citation {props.mentionId}</h3>
      <p className="text-muted-foreground text-sm">
        {props.availability === "pending"
          ? "Loading current online Citation evidence…"
          : props.message}
      </p>
      <div className="flex gap-2">
        {props.onRetryEvidence ? (
          <Button onClick={props.onRetryEvidence} size="sm" type="button">
            Retry evidence
          </Button>
        ) : null}
        <Button
          onClick={props.onCancel}
          size="sm"
          type="button"
          variant="outline"
        >
          Cancel
        </Button>
      </div>
    </section>
  );
}
