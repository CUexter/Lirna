import { Button } from "@lirna/ui/components/button";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@lirna/ui/components/tabs";
import { XIcon } from "lucide-react";
import type { ReactNode, RefObject } from "react";

interface AnnotationSidePanelProps {
  panelRef: RefObject<HTMLDivElement | null>;
  editing: boolean;
  onClose: () => void;
  children: ReactNode;
}

export function AnnotationSidePanel({
  panelRef,
  editing,
  onClose,
  children,
}: AnnotationSidePanelProps) {
  return (
    <aside
      aria-label={editing ? "Edit annotation" : "Create annotation"}
      className="fixed top-0 right-0 z-50 flex h-full w-80 max-w-[calc(100vw-2rem)] flex-col border-l bg-popover text-popover-foreground shadow-lg"
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
        defaultValue="note"
      >
        <TabsList className="w-full">
          <TabsTrigger value="note">Note</TabsTrigger>
          <TabsTrigger value="highlights">Highlights</TabsTrigger>
          <TabsTrigger value="references">References</TabsTrigger>
        </TabsList>
        <TabsContent
          className="flex flex-1 flex-col gap-3 overflow-y-auto pt-3 pb-3"
          value="note"
        >
          {children}
        </TabsContent>
        <TabsContent
          className="p-3 text-muted-foreground text-sm"
          value="highlights"
        >
          <p>Saved highlights will appear here.</p>
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
