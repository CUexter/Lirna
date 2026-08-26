import type { ReadingComponent } from "./reading-component-fixture";
import { readingComponent } from "./reading-component-fixture";

export function additionalReadingComponents(): ReadingComponent[] {
  return [
    readingComponent({
      identity: "supplement-one",
      role: "supplement",
      label: "Supplement one",
      parentIdentity: "article",
      order: 1,
      requestedUrl:
        "https://plato.stanford.edu/entries/synthetic/supplement-one.html",
      finalUrl:
        "https://plato.stanford.edu/entries/synthetic/supplement-one.html",
      bibliography: [
        {
          id: "supplement-references",
          title: "Publisher bibliography",
          entries: [
            {
              id: "supplement-entry-one",
              label: "[1]",
              text: "Supplement bibliography entry.",
              anchor: "#supplement-entry-one",
              links: [],
              provenance: {
                componentIdentity: "supplement-one",
                locator: "#supplement-entry-one",
              },
            },
          ],
          provenance: {
            componentIdentity: "supplement-one",
            locator: "#supplement-references",
          },
        },
      ],
      figures: [],
      introductoryBlocks: [
        {
          kind: "paragraph",
          children: [{ kind: "text", text: "First supplement content." }],
        },
        {
          kind: "paragraph",
          children: [
            { kind: "text", text: "Supplement citation context " },
            {
              kind: "citation",
              mentionId: "supplement-citation-one",
              label: "[1]",
              state: "resolved",
              candidates: ["supplement-entry-one"],
              rule: "synthetic rule",
              evidence: "synthetic evidence",
              entryId: "supplement-entry-one",
            },
          ],
        },
      ],
      sections: [],
      toc: [],
      plainText: "First supplement content.\n\nSupplement citation context [1]",
    }),
    readingComponent({
      identity: "supplement-two",
      role: "supplement",
      label: "Supplement two",
      parentIdentity: "article",
      order: 2,
      requestedUrl:
        "https://plato.stanford.edu/entries/synthetic/supplement-two.html",
      finalUrl:
        "https://plato.stanford.edu/entries/synthetic/supplement-two.html",
      bibliography: [],
      figures: [],
      introductoryBlocks: [
        {
          kind: "paragraph",
          children: [{ kind: "text", text: "Second supplement content." }],
        },
      ],
      sections: [],
      toc: [],
      plainText: "Second supplement content.",
    }),
    readingComponent({
      identity: "notes",
      role: "notes",
      label: "Notes",
      parentIdentity: "article",
      order: 3,
      requestedUrl: "https://plato.stanford.edu/entries/synthetic/notes.html",
      finalUrl: "https://plato.stanford.edu/entries/synthetic/notes.html",
      bibliography: [],
      figures: [],
      introductoryBlocks: [
        {
          kind: "paragraph",
          children: [
            {
              kind: "anchor",
              id: "1",
              children: [
                {
                  kind: "link",
                  href: "index.html#note-1",
                  internal: false,
                  children: [{ kind: "text", text: "1." }],
                },
              ],
            },
            {
              kind: "link",
              href: "https://plato.stanford.edu/entries/synthetic.html#proposition-1",
              internal: false,
              children: [{ kind: "text", text: "Back to proposition 1" }],
            },
            { kind: "text", text: " Publisher-authored note." },
            {
              kind: "citation",
              label: "[1]",
              state: "resolved",
              mentionId: "notes-citation-one",
              candidates: ["entry-one"],
              rule: "synthetic rule",
              evidence: "synthetic evidence",
              entryId: "entry-one",
            },
            { kind: "text", text: " See §1 and numbered claim (1)." },
          ],
        },
        {
          kind: "paragraph",
          children: [
            { kind: "anchor", id: "4", children: [] },
            { kind: "text", text: "4. Fourth publisher-authored note." },
          ],
        },
        {
          kind: "paragraph",
          children: [
            { kind: "anchor", id: "7", children: [] },
            { kind: "text", text: "7. Seventh publisher-authored note." },
          ],
        },
      ],
      sections: [],
      toc: [],
      plainText:
        "1. Publisher-authored note. [1] See §1 and numbered claim (1).\n\n4. Fourth publisher-authored note.\n\n7. Seventh publisher-authored note.",
    }),
  ];
}
