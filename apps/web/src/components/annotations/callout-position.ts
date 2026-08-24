const calloutWidth = 224;
const calloutGap = 16;
const calloutInset = 12;

export function calloutPosition(
  articleRect: Pick<DOMRect, "left" | "right">,
  viewportWidth: number,
) {
  const right = articleRect.right + calloutGap;
  if (right + calloutWidth <= viewportWidth - calloutInset) {
    return { left: right, side: "right" as const };
  }

  const left = articleRect.left - calloutGap - calloutWidth;
  return left >= calloutInset ? { left, side: "left" as const } : undefined;
}
