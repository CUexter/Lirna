import type { InquiryOutputs } from "@/clients/inquiry";

type Reading = InquiryOutputs["sources"]["reading"];

export const readingReferences: Pick<Reading, "sections" | "toc"> = {
  toc: [
    { id: "claim", title: "A synthetic claim", children: [] },
    { id: "referenced-claim", title: "A referenced claim", children: [] },
  ],
  sections: [
    {
      id: "referenced-claim",
      title: [{ kind: "text", text: "A referenced claim" }],
      level: 2,
      blocks: [
        {
          kind: "paragraph",
          children: [
            { kind: "text", text: "(1)" },
            { kind: "text", text: "Numbered target context." },
          ],
        },
      ],
      children: [
        {
          id: "nested-claim",
          title: [{ kind: "text", text: "A nested claim" }],
          level: 3,
          blocks: [],
          children: [
            {
              id: "deeply-nested-claim",
              title: [{ kind: "text", text: "A deeply nested claim" }],
              level: 4,
              blocks: [],
              children: [],
            },
          ],
        },
      ],
    },
  ],
};
