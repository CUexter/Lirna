import { Button } from "@lirna/ui/components/button";
import { CheckIcon, Trash2Icon } from "lucide-react";

import type { AnnotationColor } from "./annotation-dom-utils";

interface AnnotationColorPickerProps {
  color: AnnotationColor;
  onColorChange: (color: AnnotationColor) => void;
  colors: readonly AnnotationColor[];
  editing: boolean;
  pending: boolean;
  onDelete?: () => void;
}

export function AnnotationColorPicker({
  color,
  onColorChange,
  colors,
  editing,
  pending,
  onDelete,
}: AnnotationColorPickerProps) {
  return (
    <fieldset className="flex items-center gap-2">
      <legend className="sr-only">Color</legend>
      {colors.map((value) => (
        <Button
          aria-label={`${value} highlight`}
          aria-pressed={color === value}
          className="rounded-full border-foreground/20"
          disabled={pending}
          key={value}
          onClick={() => onColorChange(value)}
          size="icon-sm"
          style={{ backgroundColor: `var(--annotation-${value})` }}
          type="button"
          variant="outline"
        >
          {color === value ? <CheckIcon /> : null}
        </Button>
      ))}
      {editing && onDelete ? (
        <Button
          aria-label="Delete annotation"
          className="ml-auto"
          disabled={pending}
          onClick={onDelete}
          size="icon-sm"
          type="button"
          variant="destructive"
        >
          <Trash2Icon />
        </Button>
      ) : null}
    </fieldset>
  );
}
