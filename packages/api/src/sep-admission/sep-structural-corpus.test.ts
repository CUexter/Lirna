import { describe, expect, test } from "bun:test";

import {
  productionArchiveEntryUrl,
  productionCorpusPages,
  structuralCorpus,
} from "./fixtures/production-corpus";
import { createSepCaptureClient } from "./sep-capture";
import {
  controlledCitationBody,
  controlledTransport,
} from "./sep-capture-test-fixture";
import { createSepReadingDerivative } from "./sep-reading";

const source = {
  id: "10000000-0000-4000-8000-000000000000",
  stateId: "20000000-0000-4000-8000-000000000000",
  title: "Synthetic structural corpus",
  authors: ["Fixture Author"],
  publisher: "Controlled fixture publisher",
  publicationHistory: ["Synthetic revision 2026"],
  canonicalUrl: "https://plato.stanford.edu/entries/synthetic-production/",
  observation: "submitted" as const,
  admittedAt: "2026-08-25T00:00:00.000Z",
};

function derive(html: string, identity = "active:/") {
  const main = {
    identity,
    requestedUrl: source.canonicalUrl,
    finalUrl: source.canonicalUrl,
    retrievedAt: new Date("2026-08-25T00:00:00.000Z"),
    sha256: "a".repeat(64),
    charset: "utf-8",
    body: Buffer.from(html),
  };
  return createSepReadingDerivative({
    source,
    main,
    resources: [{ identity, sha256: main.sha256 }],
    capture: {
      completeness: "complete",
      readingReadiness: "ready",
      readinessReasons: [],
      diagnostics: [],
    },
  });
}

describe("rights-conscious SEP structural corpus", () => {
  test("covers current hierarchy, tagged statements, and exact TeX", () => {
    const reading = derive(structuralCorpus["actualism-current"]);
    expect(reading.toc).toEqual([
      {
        id: "actual",
        title: "Actualism",
        children: [{ id: "modal-scope", title: "Modal scope", children: [] }],
      },
    ]);
    expect(reading.sections[0]?.blocks.map(({ kind }) => kind)).toEqual([
      "statement",
      "paragraph",
    ]);
    expect(JSON.stringify(reading)).toContain('"source":"\\\\Box p"');
  });

  test("covers historical anchors, Notes links, figures, and table classification", () => {
    const notes = derive(structuralCorpus["possible-worlds-notes"]);
    const plato = derive(structuralCorpus["plato-legacy-anchor"]);
    const diagrams = derive(structuralCorpus["diagrams-and-tables"]);
    expect(notes.sections[0]?.id).toBe("worlds");
    expect(JSON.stringify(notes)).toContain("notes.html#footnote-one");
    expect(JSON.stringify(notes)).toContain("Footnote 1");
    expect(plato.sections[0]?.id).toBe("forms");
    expect(diagrams.sections[0]?.blocks.map(({ kind }) => kind)).toEqual([
      "figure",
      "table",
      "paragraph",
    ]);
  });

  test("keeps dense scholarly apparatus and malformed markup inert and diagnosed", () => {
    const apparatus = derive(structuralCorpus["dense-notes-bibliography"]);
    const malformed = derive(structuralCorpus.malformed);
    expect(apparatus.components[0]?.bibliography[0]?.entries).toHaveLength(2);
    expect(JSON.stringify(apparatus)).toContain(
      '"kind":"anchor","id":"footnote-one"',
    );
    expect(apparatus.plainText).toContain(
      "Footnote 1. Synthetic publisher note.",
    );
    expect(malformed.plainText).toContain("Retained prose");
    expect(JSON.stringify(malformed)).not.toContain("fixturePwned");
    expect(malformed.capture.diagnostics).toContainEqual(
      expect.objectContaining({ code: "missing-internal-target" }),
    );
  });

  test("discovers and preserves an archive-aware component path", async () => {
    const requested: string[] = [];
    const transport = controlledTransport(
      "synthetic-production",
      productionCorpusPages(),
      requested,
    );
    const capture = await createSepCaptureClient({
      fetch: (async (input, init) => {
        const url = new URL(String(input));
        if (url.pathname === "/cgi-bin/encyclopedia/archinfo.cgi")
          return new Response(
            `${controlledCitationBody}<a href="${productionArchiveEntryUrl}">Archive</a>`,
            { headers: { "content-type": "text/html; charset=utf-8" } },
          );
        return transport(input, init);
      }) as typeof fetch,
    }).capture(productionArchiveEntryUrl);
    const archived = capture.resources.find(
      ({ identity }) => identity === "sum2026:/",
    );
    expect(requested).toContain(
      "/archives/sum2026/entries/synthetic-production/",
    );
    expect(archived?.finalUrl).toBe(productionArchiveEntryUrl);

    const reading = derive(
      structuralCorpus["archive-aware"],
      archived?.identity,
    );
    expect(reading.mainComponent.identity).toBe("sum2026:/");
    expect(reading.components[0]?.identity).toBe("sum2026:/");
  });
});
