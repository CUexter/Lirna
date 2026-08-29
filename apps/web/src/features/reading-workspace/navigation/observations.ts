export type ReadingScrollOwner =
  | "article"
  | "publisher-note"
  | `reading-tools:${"contents" | "bibliography" | "notes" | "supplementary"}`;

export type ReadingNavigationCause =
  | "annotation-return"
  | "bibliography-opening"
  | "bibliography-selection"
  | "citation-return"
  | "component-transition"
  | "direct-reader-scroll"
  | "explicit-fragment-arrival"
  | "pending-fragment"
  | "preserved-scroll"
  | "publisher-note-navigation"
  | "reference-opening"
  | "reference-target"
  | "resume"
  | "resume-legacy-fallback";

export type ReadingNavigationObservation = {
  cause: ReadingNavigationCause;
  order: number;
  owner: ReadingScrollOwner;
  target: string;
};

const eventName = "lirna:reading-navigation";
let nextOrder = 0;

export function observeReadingNavigation({
  cause,
  owner,
  target,
}: Omit<ReadingNavigationObservation, "order">) {
  const detail: ReadingNavigationObservation = {
    cause,
    order: ++nextOrder,
    owner,
    target,
  };
  window.dispatchEvent(new CustomEvent(eventName, { detail }));
  return detail;
}

export function readingToolsOwnerFor(
  toolsScrollElement?: HTMLElement | null,
): ReadingScrollOwner {
  const owner = toolsScrollElement?.dataset.readingScrollOwner;
  if (
    owner === "publisher-note" ||
    owner === "reading-tools:contents" ||
    owner === "reading-tools:bibliography" ||
    owner === "reading-tools:notes" ||
    owner === "reading-tools:supplementary"
  )
    return owner;
  return "reading-tools:contents";
}

export function observeDirectReaderScroll({
  onReaderControl,
  toolsScrollElement,
}: {
  onReaderControl?: (owner: ReadingScrollOwner) => void;
  toolsScrollElement?: HTMLElement | null;
} = {}) {
  const readerInputAt = new Map<ReadingScrollOwner, number>();
  const ownerForEvent = (event: Event): ReadingScrollOwner =>
    event.target instanceof Node && toolsScrollElement?.contains(event.target)
      ? readingToolsOwnerFor(toolsScrollElement)
      : "article";
  const recordInput = (event: Event) => {
    const owner = ownerForEvent(event);
    readerInputAt.set(owner, performance.now());
    onReaderControl?.(owner);
  };
  const recordKeyInput = (event: KeyboardEvent) => {
    if (event.target instanceof HTMLElement && event.target.isContentEditable)
      return;
    if (
      event.target instanceof HTMLInputElement ||
      event.target instanceof HTMLTextAreaElement ||
      event.target instanceof HTMLSelectElement
    )
      return;
    if (
      ![
        "ArrowDown",
        "ArrowUp",
        "End",
        "Home",
        "PageDown",
        "PageUp",
        " ",
      ].includes(event.key)
    )
      return;
    recordInput(event);
  };
  const recordScroll = (owner: ReadingScrollOwner, scrollTop: number) => {
    const inputAt = readerInputAt.get(owner);
    const recentInput =
      inputAt !== undefined && performance.now() - inputAt <= 250;
    if (!recentInput) return;
    onReaderControl?.(owner);
    observeReadingNavigation({
      cause: "direct-reader-scroll",
      owner,
      target: `scroll-top:${Math.round(scrollTop)}`,
    });
  };
  const recordArticleScroll = () => recordScroll("article", window.scrollY);
  const recordToolsScroll = () =>
    recordScroll(
      readingToolsOwnerFor(toolsScrollElement),
      toolsScrollElement?.scrollTop ?? 0,
    );
  const recordScrollbarInput = (event: PointerEvent) => {
    const owner = ownerForEvent(event);
    const element =
      owner === "article" ? document.documentElement : toolsScrollElement;
    if (
      !element ||
      event.clientX < element.getBoundingClientRect().left + element.clientWidth
    )
      return;
    recordInput(event);
  };
  window.addEventListener("keydown", recordKeyInput);
  window.addEventListener("pointerdown", recordScrollbarInput, {
    passive: true,
  });
  window.addEventListener("scroll", recordArticleScroll, { passive: true });
  window.addEventListener("touchmove", recordInput, { passive: true });
  window.addEventListener("wheel", recordInput, { passive: true });
  toolsScrollElement?.addEventListener("scroll", recordToolsScroll, {
    passive: true,
  });
  return () => {
    window.removeEventListener("keydown", recordKeyInput);
    window.removeEventListener("pointerdown", recordScrollbarInput);
    window.removeEventListener("scroll", recordArticleScroll);
    window.removeEventListener("touchmove", recordInput);
    window.removeEventListener("wheel", recordInput);
    toolsScrollElement?.removeEventListener("scroll", recordToolsScroll);
  };
}
