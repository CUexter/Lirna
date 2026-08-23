import type { FormattedServerError } from "@/utils/server-error";

export function ServerErrorMessage({
  error,
  id,
}: {
  error: FormattedServerError;
  id?: string;
}) {
  return (
    <div className="text-destructive text-sm" id={id} role="alert">
      <p className="whitespace-pre-line">{error.message}</p>
      {error.technicalDetails ? (
        <details className="mt-2">
          <summary className="cursor-pointer font-medium">
            Technical details
          </summary>
          <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap rounded-md bg-muted p-3 font-mono text-foreground text-xs">
            {error.technicalDetails}
          </pre>
        </details>
      ) : null}
    </div>
  );
}
