import { Button } from "@lirna/ui/components/button";

import type { ReadingDerivative } from "./content";

export function ReadingComponentNav({
  previous,
  next,
  onSelect,
}: {
  previous: ReadingDerivative["components"][number] | undefined;
  next: ReadingDerivative["components"][number] | undefined;
  onSelect: (identity: string) => void;
}) {
  return (
    <nav
      aria-label="Component navigation"
      className="flex justify-between gap-3 border-t pt-6"
    >
      {previous ? (
        <Button
          onClick={() => {
            onSelect(previous.identity);
          }}
          type="button"
          variant="outline"
        >
          Previous: {previous.label}
        </Button>
      ) : (
        <span />
      )}
      {next ? (
        <Button
          onClick={() => {
            onSelect(next.identity);
          }}
          type="button"
          variant="outline"
        >
          Next: {next.label}
        </Button>
      ) : null}
    </nav>
  );
}
