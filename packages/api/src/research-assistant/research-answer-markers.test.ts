import { expect, test } from "bun:test";

import {
  compileResearchAnswer,
  researchAnswerHistoryContent,
} from "./research-answer-markers";

const referenceId = "10000000-0000-4000-8000-000000000000";

test("compiles passing references and exact quotes from verified aliases", () => {
  const ids = [
    "20000000-0000-4000-8000-000000000000",
    "30000000-0000-4000-8000-000000000000",
  ];

  const compiled = compileResearchAnswer(
    [
      "The claim is qualified.[^ev_1|qualifies]",
      "",
      ":::quote[ev_1]",
      ":::",
    ].join("\n"),
    [reference()],
    () => ids.shift() ?? "unexpected-id",
  );

  expect(compiled.content).toBe(
    [
      "The claim is qualified.[^20000000-0000-4000-8000-000000000000]",
      "",
      ":::quote[30000000-0000-4000-8000-000000000000]",
      ":::",
    ].join("\n"),
  );
  expect(compiled.references).toEqual([
    {
      ...referenceWithoutAlias(),
      occurrences: [
        {
          answerTarget: {
            startOffset: expect.any(Number),
            endOffset: expect.any(Number),
          },
          id: "20000000-0000-4000-8000-000000000000",
          presentation: "passing",
          relation: "qualifies",
          referenceId,
        },
        {
          answerTarget: {
            startOffset: expect.any(Number),
            endOffset: expect.any(Number),
          },
          id: "30000000-0000-4000-8000-000000000000",
          presentation: "quote",
          relation: "supports",
          referenceId,
        },
      ],
    },
  ]);
});

test("removes persisted occurrence markers before a later model turn", () => {
  const occurrenceIds = [
    "20000000-0000-4000-8000-000000000000",
    "30000000-0000-4000-8000-000000000000",
  ];
  const persisted = compileResearchAnswer(
    "The first claim.[^ev_1]\n\n:::quote[ev_1]\n:::",
    [reference()],
    () => occurrenceIds.shift() ?? "unexpected-id",
  );

  expect(
    researchAnswerHistoryContent(persisted.content, persisted.references),
  ).toBe("The first claim.\n\n");
});

test("leaves unknown, malformed, escaped, and code markers uncompiled", () => {
  const content = [
    "Unknown[^ev_2] malformed[^ev_1|praises] escaped \\[^ev_1].",
    "Inline `code[^ev_1]` remains code.",
    "```md",
    "fenced[^ev_1]",
    ":::quote[ev_1]",
    ":::",
    "```",
    "    indented[^ev_1]",
  ].join("\n");

  expect(compileResearchAnswer(content, [reference()])).toEqual({
    content,
    references: [referenceWithoutAlias()],
  });
});

test("creates a distinct occurrence each time evidence is cited", () => {
  let next = 0;
  const nextId = () => {
    next += 1;
    return `occurrence-${next}`;
  };
  const compiled = compileResearchAnswer(
    "First.[^ev_1] Second.[^ev_1|background]",
    [reference()],
    nextId,
  );

  expect(compiled.references[0]?.occurrences).toHaveLength(2);
  expect(
    compiled.references[0]?.occurrences?.map(({ relation }) => relation),
  ).toEqual(["supports", "background"]);
  expect(
    compiled.references[0]?.occurrences?.map(({ answerTarget }) =>
      compiled.content.slice(
        answerTarget?.startOffset,
        answerTarget?.endOffset,
      ),
    ),
  ).toEqual(["First.", "Second."]);
});

test("gives adjacent citations the same claim target", () => {
  let next = 0;
  const compiled = compileResearchAnswer(
    "One claim.[^ev_1][^ev_1|qualifies]",
    [reference()],
    () => `occurrence-${++next}`,
  );

  expect(
    compiled.references[0]?.occurrences?.map(({ answerTarget }) =>
      compiled.content.slice(
        answerTarget?.startOffset,
        answerTarget?.endOffset,
      ),
    ),
  ).toEqual(["One claim.", "One claim."]);
});

test("keeps markers inside unequal fenced and multiline inline code uncompiled", () => {
  const content = [
    "````md",
    "inside[^ev_1]",
    "```",
    "still inside[^ev_1]",
    "````",
    "Outside `multiline",
    "code[^ev_1]` then grounded.[^ev_1]",
  ].join("\n");
  const compiled = compileResearchAnswer(
    content,
    [reference()],
    () => "20000000-0000-4000-8000-000000000000",
  );

  expect(compiled.content).toBe(
    content.replace(
      "grounded.[^ev_1]",
      "grounded.[^20000000-0000-4000-8000-000000000000]",
    ),
  );
  expect(compiled.references[0]?.occurrences).toHaveLength(1);
});

test("uses Markdown structure for nested and invalid fences", () => {
  const content = [
    "> ~~~md",
    "> nested code[^ev_1]",
    "> ~~~",
    "",
    "```bad`info",
    "This remains prose.[^ev_1|conflicts]",
  ].join("\n");
  const compiled = compileResearchAnswer(
    content,
    [reference()],
    () => "20000000-0000-4000-8000-000000000000",
  );

  expect(compiled.content).toContain("> nested code[^ev_1]");
  expect(compiled.content).toContain(
    "This remains prose.[^20000000-0000-4000-8000-000000000000]",
  );
  expect(compiled.references[0]?.occurrences?.[0]).toMatchObject({
    relation: "conflicts",
    answerTarget: {
      startOffset: expect.any(Number),
      endOffset: expect.any(Number),
    },
  });
});

test("targets a passing claim across a soft Markdown line break", () => {
  const compiled = compileResearchAnswer(
    "This claim wraps across\ntwo lines.[^ev_1]",
    [reference()],
    () => "20000000-0000-4000-8000-000000000000",
  );
  const target = compiled.references[0]?.occurrences?.[0]?.answerTarget;

  expect(target).toBeDefined();
  expect(compiled.content.slice(target?.startOffset, target?.endOffset)).toBe(
    "This claim wraps across\ntwo lines.",
  );
});

test("keeps passing targets within their Markdown list item", () => {
  const compiled = compileResearchAnswer(
    "- First claim.\n- Second claim.[^ev_1]",
    [reference()],
    () => "20000000-0000-4000-8000-000000000000",
  );
  const target = compiled.references[0]?.occurrences?.[0]?.answerTarget;

  expect(compiled.content.slice(target?.startOffset, target?.endOffset)).toBe(
    "Second claim.",
  );
});

function reference() {
  return { ...referenceWithoutAlias(), evidenceAlias: "ev_1" };
}

function referenceWithoutAlias() {
  return {
    id: referenceId,
    componentIdentity: "article",
    componentLabel: "Article",
    selection: {
      offsetBasis: "normalized-derivative-text-v1" as const,
      normalizedStartOffset: 0,
      normalizedEndOffset: 18,
      exactText: "Verified evidence.",
      prefix: "",
      suffix: "",
    },
  };
}
