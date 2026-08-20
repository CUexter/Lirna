export class FakeHighlight {
  readonly ranges: Range[];

  constructor(...ranges: Range[]) {
    this.ranges = ranges;
  }
}

export function restoreProperty(
  target: object,
  key: string,
  value: PropertyDescriptor,
) {
  Object.defineProperty(target, key, value);
}

export function installHighlightApi() {
  const registry = new Map<string, FakeHighlight>();
  const css = Object.getOwnPropertyDescriptor(globalThis, "CSS");
  const highlight = Object.getOwnPropertyDescriptor(window, "Highlight");
  Object.defineProperty(globalThis, "CSS", {
    configurable: true,
    value: { highlights: registry },
  });
  Object.defineProperty(window, "Highlight", {
    configurable: true,
    value: FakeHighlight,
  });
  return {
    registry,
    restore: () => {
      if (css) restoreProperty(globalThis, "CSS", css);
      else Reflect.deleteProperty(globalThis, "CSS");
      if (highlight) restoreProperty(window, "Highlight", highlight);
      else Reflect.deleteProperty(window, "Highlight");
    },
  };
}
