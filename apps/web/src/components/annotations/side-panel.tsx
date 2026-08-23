import { Button } from "@lirna/ui/components/button";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@lirna/ui/components/tabs";
import { PencilIcon, XIcon } from "lucide-react";
import type { ReactNode, RefObject } from "react";
import type { Annotation } from "./dom-utils";

interface AnnotationSidePanelProps {
  panelRef: RefObject<HTMLDivElement | null>;
  editing: boolean;
  showEditor: boolean;
  annotations: Annotation[];
  onSelectAnnotation: (annotation: Annotation) => void;
  onEditAnnotation: (annotation: Annotation) => void;
  onClose: () => void;
  children: ReactNode;
}

export function AnnotationSidePanel({
  panelRef,
  editing,
  showEditor,
  annotations,
  onSelectAnnotation,
  onEditAnnotation,
  onClose,
  children,
}: AnnotationSidePanelProps) {
  return (
    <aside
      aria-label={
        editing ? "Edit annotation" : showEditor ? "Create annotation" : "Notes"
      }
      className="fixed top-0 right-0 z-50 flex h-full w-80 max-w-[calc(100vw-2rem)] flex-col border-l bg-popover text-popover-foreground shadow-lg lg:right-auto lg:left-0 lg:border-r lg:border-l-0"
      onKeyDown={(event) => {
        if (event.key === "Escape") onClose();
      }}
      ref={panelRef}
    >
      <div className="flex items-center justify-between border-b px-3 py-2">
        <span className="font-medium text-sm">Annotations</span>
        <Button
          aria-label="Close panel"
          onClick={onClose}
          size="icon-sm"
          type="button"
          variant="ghost"
        >
          <XIcon />
        </Button>
      </div>
      <Tabs
        className="flex flex-1 flex-col overflow-hidden px-3 pt-3"
        defaultValue={showEditor ? "editor" : "notes"}
      >
        <TabsList className="w-full">
          <TabsTrigger disabled={!showEditor} value="editor">
            Editor
          </TabsTrigger>
          <TabsTrigger value="notes">Notes</TabsTrigger>
          <TabsTrigger value="references">References</TabsTrigger>
        </TabsList>
        <TabsContent
          className="flex flex-1 flex-col gap-3 overflow-y-auto pt-3 pb-3"
          value="editor"
        >
          {children}
        </TabsContent>
        <TabsContent
          className="flex flex-1 flex-col gap-2 overflow-y-auto py-3"
          value="notes"
        >
          {annotations.length === 0 ? (
            <p className="p-3 text-muted-foreground text-sm">
              Notes and highlights you add to this component will appear here.
            </p>
          ) : (
            annotations.map((annotation) => (
              <div
                className="rounded-md border p-3 transition-colors hover:bg-accent"
                key={annotation.id}
              >
                <Button
                  className="h-auto w-full justify-start whitespace-normal p-0 text-left"
                  onClick={() => onSelectAnnotation(annotation)}
                  type="button"
                  variant="ghost"
                >
                  <span className="block font-medium text-xs uppercase tracking-wide">
                    {annotation.body?.trim() ? "Note" : "Highlight"}
                  </span>
                  {annotation.body?.trim() && (
                    <span className="mt-1 line-clamp-3 block whitespace-pre-wrap text-sm">
                      {annotation.body}
                    </span>
                  )}
                  <span className="mt-2 line-clamp-2 block text-muted-foreground text-xs">
                    &quot;{annotation.exactText}&quot;
                  </span>
                </Button>
                <Button
                  aria-label={`Edit ${annotation.body?.trim() ? "note" : "highlight"}`}
                  className="mt-2"
                  onClick={() => onEditAnnotation(annotation)}
                  size="sm"
                  type="button"
                  variant="ghost"
                >
                  <PencilIcon data-icon="inline-start" />
                  Edit
                </Button>
              </div>
            ))
          )}
        </TabsContent>
        <TabsContent
          className="p-3 text-muted-foreground text-sm"
          value="references"
        >
          <p>References will appear here.</p>
        </TabsContent>
      </Tabs>
    </aside>
  );
}
