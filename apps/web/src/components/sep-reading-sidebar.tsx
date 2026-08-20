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
  const mainComponents = components.filter((item) => item.role === "main");
  const otherComponents = components.filter((item) => item.role !== "main");

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
          <div className="hidden min-w-0 space-y-2 text-sm lg:block">
            <ComponentList
              components={mainComponents}
              currentComponent={currentComponent}
              onComponentChange={onComponentChange}
            />
            {otherComponents.length ? (
              <details open={currentComponent.role !== "main"}>
                <summary className="cursor-pointer text-muted-foreground underline-offset-4 hover:underline">
                  Other components
                </summary>
                <ComponentList
                  className="mt-2"
                  components={otherComponents}
                  currentComponent={currentComponent}
                  onComponentChange={onComponentChange}
                />
              </details>
            ) : null}
          </div>
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

function ComponentList({
  components,
  currentComponent,
  onComponentChange,
  className,
}: {
  components: Component[];
  currentComponent: Component;
  onComponentChange: (identity: string) => void;
  className?: string;
}) {
  return (
    <ol className={`min-w-0 space-y-1 ${className ?? ""}`}>
      {components.map((item) => (
        <li className="min-w-0" key={item.identity}>
          <Button
            className="h-auto w-full min-w-0 justify-start whitespace-normal break-words p-0 text-left text-muted-foreground"
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
