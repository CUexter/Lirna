export type ReadingScrollOwner = "article" | "reading-tools";

export type ReadingNavigationCause =
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
  | "resume-correction";

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

export function observeDirectReaderScroll() {
  let readerInputAt = Number.NEGATIVE_INFINITY;
  const recordInput = () => {
    readerInputAt = performance.now();
  };
  const recordScroll = () => {
    if (performance.now() - readerInputAt > 250) return;
    observeReadingNavigation({
      cause: "direct-reader-scroll",
      owner: "article",
      target: `scroll-top:${Math.round(window.scrollY)}`,
    });
  };
  window.addEventListener("keydown", recordInput);
  window.addEventListener("scroll", recordScroll, { passive: true });
  window.addEventListener("touchstart", recordInput, { passive: true });
  window.addEventListener("wheel", recordInput, { passive: true });
  return () => {
    window.removeEventListener("keydown", recordInput);
    window.removeEventListener("scroll", recordScroll);
    window.removeEventListener("touchstart", recordInput);
    window.removeEventListener("wheel", recordInput);
  };
}
