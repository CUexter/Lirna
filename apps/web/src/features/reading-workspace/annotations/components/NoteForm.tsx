import { Button } from "@lirna/ui/components/button";
import { Textarea } from "@lirna/ui/components/textarea";

interface AnnotationNoteFormProps {
  body: string;
  onBodyChange: (value: string) => void;
  editing: boolean;
  pending: boolean;
  error?: string;
  onSave: () => void;
  onClose: () => void;
}

export function AnnotationNoteForm({
  body,
  onBodyChange,
  editing,
  pending,
  error,
  onSave,
  onClose,
}: AnnotationNoteFormProps) {
  return (
    <>
      <Textarea
        aria-label="Annotation note"
        className="flex-1"
        disabled={pending}
        maxLength={20_000}
        onChange={(event) => onBodyChange(event.target.value)}
        placeholder="Add a note (optional)"
        value={body}
      />
      {error ? (
        <p className="text-destructive text-xs" role="alert">
          {error}
        </p>
      ) : null}
      <div className="flex justify-end gap-2">
        <Button
          disabled={pending}
          onClick={onClose}
          size="sm"
          type="button"
          variant="ghost"
        >
          Cancel
        </Button>
        <Button disabled={pending} onClick={onSave} size="sm" type="button">
          {editing ? "Save" : "Highlight"}
        </Button>
      </div>
    </>
  );
}
