import { readingFixture } from "./-reading-test-fixtures";

export function readingWithTwoPublisherNotes() {
  const reading = readingFixture();
  const notes = reading.components.find(
    (component) => component.role === "notes",
  );
  if (!notes) throw new Error("Publisher-note fixture is unavailable");
  const secondUrl =
    "https://plato.stanford.edu/entries/synthetic/notes-two.html";
  const firstWithLink = {
    ...notes,
    introductoryBlocks: [
      ...notes.introductoryBlocks,
      {
        kind: "paragraph" as const,
        children: [
          {
            kind: "link" as const,
            href: "notes-two.html",
            internal: false,
            children: [
              { kind: "text" as const, text: "Second publisher note" },
            ],
          },
        ],
      },
    ],
  };
  const second = {
    ...notes,
    identity: "notes-two",
    label: "Notes two",
    order: notes.order + 1,
    requestedUrl: secondUrl,
    finalUrl: secondUrl,
    introductoryBlocks: [
      {
        kind: "paragraph" as const,
        children: [
          { kind: "text" as const, text: "Second publisher-note scene. " },
          {
            kind: "link" as const,
            href: "notes.html",
            internal: false,
            children: [{ kind: "text" as const, text: "First publisher note" }],
          },
        ],
      },
    ],
    plainText: "Second publisher-note scene. First publisher note",
  };
  return {
    ...reading,
    components: reading.components
      .map((component) =>
        component.identity === notes.identity ? firstWithLink : component,
      )
      .concat(second),
  };
}
