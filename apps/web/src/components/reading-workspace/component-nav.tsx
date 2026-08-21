import { Button } from "@lirna/ui/components/button";

import type { SepReadingData } from "./content";

export function SepReadingComponentNav({
  previous,
  next,
  onSelect,
}: {
  previous: SepReadingData["components"][number] | undefined;
  next: SepReadingData["components"][number] | undefined;
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
