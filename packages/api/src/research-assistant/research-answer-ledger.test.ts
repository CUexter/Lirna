import { expect, test } from "bun:test";

import {
  validateAnswerLedger,
  validateResearchAnswer,
} from "./research-answer-ledger";

const admittedAliases = new Set(["ev_1", "ev_2", "ev_3", "ev_4"]);

test("accepts supported, qualified, interpretive, and original claims", () => {
  const result = validateAnswerLedger(
    {
      claims: [
        claim("supported", "Source-dependent claim.", "source-dependent", [
          evidence("ev_1", "supports"),
        ]),
        claim("qualified", "Qualified claim.", "source-dependent", [
          evidence("ev_2", "qualifies"),
          evidence("ev_3", "conflicts"),
        ]),
        claim("interpretation", "Interpretive claim.", "interpretation", [
          evidence("ev_4", "background"),
        ]),
        claim("reasoning", "Original reasoning.", "original-reasoning", []),
      ],
    },
    admittedAliases,
  );

  expect(result).toEqual({
    outcome: "valid",
    ledger: expect.objectContaining({ claims: expect.any(Array) }),
  });
});

test.each([
  ["conflicting", "conflicts"],
  ["background-only", "background"],
] as const)(
  "rejects an uncited source-dependent claim with %s evidence",
  (_name, relation) => {
    const result = validateAnswerLedger(
      {
        claims: [
          claim("claim", "Unsupported claim.", "source-dependent", [
            evidence("ev_1", relation),
          ]),
        ],
      },
      admittedAliases,
    );

    expect(result).toEqual({
      outcome: "invalid",
      problems: [
        {
          code: "source-dependent-claim-without-direct-evidence",
          claimKey: "claim",
        },
      ],
    });
  },
);

test("rejects invented aliases, unresolved candidate handles, and malformed relations", () => {
  const result = validateAnswerLedger(
    {
      claims: [
        claim("invented", "Invented evidence.", "interpretation", [
          evidence("ev_99", "supports"),
        ]),
        claim("candidate", "Unresolved candidate.", "interpretation", [
          evidence(
            "candidate_10000000-0000-4000-8000-000000000000",
            "supports",
          ),
        ]),
        claim("malformed", "Malformed relation.", "interpretation", [
          evidence("ev_1", "agrees-with"),
        ]),
      ],
    },
    admittedAliases,
  );

  expect(result).toEqual({
    outcome: "invalid",
    problems: [
      { code: "unknown-evidence-alias", claimKey: "invented", alias: "ev_99" },
      {
        code: "unresolved-candidate-handle",
        claimKey: "candidate",
        alias: "candidate_10000000-0000-4000-8000-000000000000",
      },
      { code: "malformed-ledger" },
    ],
  });
});

test("rejects an alias after its evidence session has expired", () => {
  const result = validateAnswerLedger(
    {
      claims: [
        claim("expired", "Expired evidence.", "source-dependent", [
          evidence("ev_1", "supports"),
        ]),
      ],
    },
    new Set(),
  );

  expect(result).toEqual({
    outcome: "invalid",
    problems: [
      {
        code: "unknown-evidence-alias",
        claimKey: "expired",
        alias: "ev_1",
      },
    ],
  });
});

test("rejects final Markdown that invents an alias or changes a declared relation", () => {
  const ledger = {
    claims: [
      claim("claim", "Grounded claim.", "source-dependent", [
        evidence("ev_1", "supports"),
      ]),
    ],
  };

  expect(
    validateResearchAnswer("Grounded claim.[^ev_2]", ledger, new Set(["ev_1"])),
  ).toEqual({
    outcome: "invalid",
    problems: [
      { code: "unknown-evidence-alias", alias: "ev_2" },
      { code: "uncited-source-dependent-claim", claimKey: "claim" },
    ],
  });
  expect(
    validateResearchAnswer(
      "Grounded claim.[^ev_1|background]",
      ledger,
      new Set(["ev_1"]),
    ),
  ).toEqual({
    outcome: "invalid",
    problems: [
      {
        code: "undeclared-evidence-relation",
        alias: "ev_1",
        relation: "background",
      },
      { code: "uncited-source-dependent-claim", claimKey: "claim" },
    ],
  });
});

test("does not let evidence attached to one claim close another claim", () => {
  const ledger = {
    claims: [
      claim("first", "First claim.", "source-dependent", [
        evidence("ev_1", "supports"),
      ]),
      claim("second", "Second claim.", "source-dependent", [
        evidence("ev_2", "supports"),
      ]),
    ],
  };

  expect(
    validateResearchAnswer(
      "First claim.[^ev_2] Second claim.[^ev_1]",
      ledger,
      new Set(["ev_1", "ev_2"]),
    ),
  ).toEqual({
    outcome: "invalid",
    problems: [
      { code: "uncited-source-dependent-claim", claimKey: "first" },
      { code: "uncited-source-dependent-claim", claimKey: "second" },
    ],
  });
});

test("accepts final Markdown whose evidence markers close the ledger", () => {
  const ledger = {
    claims: [
      claim("claim", "Grounded claim.", "source-dependent", [
        evidence("ev_1", "supports"),
        evidence("ev_2", "qualifies"),
      ]),
    ],
  };

  expect(
    validateResearchAnswer(
      "Grounded claim.[^ev_1][^ev_2|qualifies]",
      ledger,
      new Set(["ev_1", "ev_2"]),
    ),
  ).toEqual({ outcome: "valid", ledger });
});

test("accepts adjacent qualifying and exact-quote evidence for their claim", () => {
  const ledger = {
    claims: [
      claim("passing", "Qualified claim.", "source-dependent", [
        evidence("ev_1", "conflicts"),
        evidence("ev_2", "qualifies"),
      ]),
      claim("quote", "Quoted claim.", "source-dependent", [
        evidence("ev_3", "supports"),
      ]),
    ],
  };

  expect(
    validateResearchAnswer(
      "Qualified claim.[^ev_1|conflicts][^ev_2|qualifies]\n\nQuoted claim.\n\n:::quote[ev_3]\n:::",
      ledger,
      new Set(["ev_1", "ev_2", "ev_3"]),
    ),
  ).toEqual({ outcome: "valid", ledger });
});

test("rejects malformed final relations but ignores marker-like code", () => {
  const ledger = {
    claims: [
      claim("claim", "Grounded claim.", "source-dependent", [
        evidence("ev_1", "supports"),
      ]),
    ],
  };

  expect(
    validateResearchAnswer(
      "`[^invented]` Grounded claim.[^ev_1|agrees-with]",
      ledger,
      new Set(["ev_1"]),
    ),
  ).toEqual({
    outcome: "invalid",
    problems: [
      { code: "malformed-evidence-relation", alias: "ev_1" },
      { code: "uncited-source-dependent-claim", claimKey: "claim" },
    ],
  });
});

function claim(
  key: string,
  text: string,
  kind: "source-dependent" | "interpretation" | "original-reasoning",
  evidenceItems: Array<{ alias: string; relation: string }>,
) {
  return { key, text, kind, evidence: evidenceItems };
}

function evidence(alias: string, relation: string) {
  return { alias, relation };
}
