import { Button } from "@lirna/ui/components/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@lirna/ui/components/popover";
import { PaletteIcon, StickyNoteIcon } from "lucide-react";
import type { CSSProperties, RefObject } from "react";

import {
  type AnnotationColor,
  annotationMenuHeight,
  type MenuPosition,
} from "./dom-utils";

interface AnnotationSelectionMenuProps {
  menuRef: RefObject<HTMLDivElement | null>;
  position: MenuPosition;
  colorPicker: {
    colors: readonly AnnotationColor[];
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onQuickHighlight: (color: AnnotationColor) => void;
  };
  pending: boolean;
  onClose: () => void;
  onOpenPanel: () => void;
}

export function AnnotationSelectionMenu({
  menuRef,
  position,
  colorPicker,
  pending,
  onClose,
  onOpenPanel,
}: AnnotationSelectionMenuProps) {
  const menuStyle = {
    left: position.left,
    top: position.top,
    height: annotationMenuHeight,
    transform: position.below ? "translateX(-50%)" : "translate(-50%, -100%)",
  } satisfies CSSProperties;

  return (
    <div
      aria-label="Create annotation"
      className="fixed flex items-center gap-1 border bg-popover p-1 text-popover-foreground shadow-lg"
      onKeyDown={(event) => {
        if (event.key === "Escape") onClose();
      }}
      onPointerDown={(event) => {
        if (
          event.target instanceof HTMLElement &&
          event.target.closest("button")
        ) {
          event.preventDefault();
        }
      }}
      ref={menuRef}
      role="dialog"
      style={menuStyle}
    >
      <Popover open={colorPicker.open} onOpenChange={colorPicker.onOpenChange}>
        <PopoverTrigger
          aria-label="Quick highlight"
          render={<Button disabled={pending} size="icon-sm" variant="ghost" />}
        >
          <PaletteIcon />
        </PopoverTrigger>
        <PopoverContent align="start" className="w-auto p-1.5">
          <fieldset className="flex items-center gap-1.5">
            <legend className="sr-only">Color</legend>
            {colorPicker.colors.map((value) => (
              <Button
                aria-label={`${value} highlight`}
                className="rounded-full border-foreground/20"
                disabled={pending}
                key={value}
                onClick={() => colorPicker.onQuickHighlight(value)}
                onMouseDown={(event) => event.preventDefault()}
                size="icon-sm"
                style={{ backgroundColor: `var(--annotation-${value})` }}
                type="button"
                variant="outline"
              />
            ))}
          </fieldset>
        </PopoverContent>
      </Popover>
      <Button
        aria-label="Add note"
        disabled={pending}
        onClick={onOpenPanel}
        size="icon-sm"
        type="button"
        variant="ghost"
      >
        <StickyNoteIcon />
      </Button>
    </div>
  );
}
