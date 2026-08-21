import { Button } from "@lirna/ui/components/button";

import type { SepReadingData } from "./content";

export function SepReadingBreadcrumb({
  sourceTitle,
  mainComponentIdentity,
  component,
  parent,
  onSelect,
}: {
  sourceTitle: string;
  mainComponentIdentity: string;
  component: SepReadingData["components"][number];
  parent: SepReadingData["components"][number] | undefined;
  onSelect: (identity: string) => void;
}) {
  return (
    <nav
      aria-label="Component path"
      className="flex flex-wrap gap-2 text-muted-foreground text-sm"
    >
      <Button
        className="h-auto p-0"
        onClick={() => {
          onSelect(mainComponentIdentity);
        }}
        type="button"
        variant="link"
      >
        {sourceTitle}
      </Button>
      {parent ? (
        <>
          <span>/</span>
          <Button
            className="h-auto p-0"
            onClick={() => {
              onSelect(parent.identity);
            }}
            type="button"
            variant="link"
          >
            {parent.label}
          </Button>
        </>
      ) : null}
      <span>/</span>
      <span>{component.label}</span>
    </nav>
  );
}
