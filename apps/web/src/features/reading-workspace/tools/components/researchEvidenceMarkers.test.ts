import { expect, test } from "bun:test";

import { researchEvidenceMarkers } from "./researchEvidenceMarkers";

test("groups only contiguous passing citation markers", () => {
  const transform = researchEvidenceMarkers();
  const tree: Parameters<typeof transform>[0] = {
    type: "root",
    children: [
      {
        type: "paragraph",
        children: [
          {
            type: "text",
            value:
              "Claim.[^ev_1] [^ev_2|qualifies] Separate.[^ev_3] Then.[^ev_4]",
          },
        ],
      },
    ],
  };

  transform(tree);

  const children = tree.children?.[0]?.children ?? [];
  expect(children).toEqual([
    { type: "text", value: "Claim." },
    {
      type: "research-citation",
      data: {
        hName: "research-citation",
        hProperties: { markers: "[^ev_1] [^ev_2|qualifies]" },
      },
    },
    { type: "text", value: " Separate." },
    {
      type: "research-citation",
      data: {
        hName: "research-citation",
        hProperties: { token: "ev_3" },
      },
    },
    { type: "text", value: " Then." },
    {
      type: "research-citation",
      data: {
        hName: "research-citation",
        hProperties: { token: "ev_4" },
      },
    },
  ]);
});

test("transforms an exact quote marker with CRLF line endings", () => {
  const transform = researchEvidenceMarkers();
  const tree: Parameters<typeof transform>[0] = {
    type: "root",
    children: [
      {
        type: "paragraph",
        children: [
          {
            type: "text",
            value: ":::quote[ev_3|background]\r\n:::",
          },
        ],
      },
    ],
  };

  transform(tree);

  expect(tree.children).toEqual([
    {
      type: "research-quote",
      data: {
        hName: "research-quote",
        hProperties: { relation: "background", token: "ev_3" },
      },
    },
  ]);
});
