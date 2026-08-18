import { Button } from "@lirna/ui/components/button";
import {
  NativeSelect,
  NativeSelectOption,
} from "@lirna/ui/components/native-select";

import type { SepReadingData } from "./sep-reading-content";

type Component = SepReadingData["components"][number];

export function SepReadingSidebar({
  components,
  currentComponent,
  view,
  onComponentChange,
  onViewBibliography,
}: {
  components: Component[];
  currentComponent: Component;
  view: "article" | "bibliography";
  onComponentChange: (identity: string) => void;
  onViewBibliography: () => void;
}) {
  return (
    <aside className="lg:sticky lg:top-6 lg:self-start">
      <div className="flex flex-col gap-4 rounded-md border p-4">
        <nav aria-label="Source components">
          <h2 className="mb-3 font-medium">This Source</h2>
          <NativeSelect
            aria-label="Source component"
            className="lg:hidden"
            onChange={(event) => {
              onComponentChange(event.target.value);
            }}
            value={currentComponent.identity}
          >
            {components.map((item) => (
              <NativeSelectOption key={item.identity} value={item.identity}>
                {item.label}
              </NativeSelectOption>
            ))}
          </NativeSelect>
          <ol className="hidden space-y-1 text-sm lg:block">
            {components.map((item) => (
              <li key={item.identity}>
                <Button
                  className="h-auto justify-start p-0 text-left text-muted-foreground"
                  onClick={() => {
                    onComponentChange(item.identity);
                  }}
                  type="button"
                  variant="link"
                >
                  {item.identity === currentComponent.identity ? (
                    <strong>{item.label}</strong>
                  ) : (
                    item.label
                  )}
                </Button>
              </li>
            ))}
          </ol>
        </nav>
        <nav aria-label="Component contents">
          <h2 className="mb-3 font-medium">Contents</h2>
          <Toc items={currentComponent.toc} />
        </nav>
        {currentComponent.bibliography.length ? (
          <Button
            onClick={onViewBibliography}
            type="button"
            variant={view === "bibliography" ? "secondary" : "outline"}
          >
            Bibliography
          </Button>
        ) : null}
      </div>
    </aside>
  );
}

function Toc({ items }: { items: SepReadingData["toc"] }) {
  return (
    <ol className="space-y-1 text-sm">
      {items.map((item) => (
        <li key={item.id}>
          <a
            className="text-muted-foreground underline-offset-4 hover:underline focus-visible:underline"
            href={`#${item.id}`}
          >
            {item.title}
          </a>
          {item.children.length ? (
            <div className="mt-1 ml-3 border-l pl-3">
              <Toc items={item.children} />
            </div>
          ) : null}
        </li>
      ))}
    </ol>
  );
}
