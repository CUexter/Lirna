import type { SepReadingContract } from "../sep-admission/reading/contract";
import { projectReadingArticle } from "../sep-admission/reading/text";

const source = {
  id: "10000000-0000-4000-8000-000000000000",
  stateId: "20000000-0000-4000-8000-000000000000",
  title: "Derivative test",
  authors: [],
  publisher: "Test publisher",
  publicationHistory: [],
  canonicalUrl: "https://example.test/source",
  observation: "submitted" as const,
  admittedAt: "2026-08-25T00:00:00.000Z",
};

export function generationMetadata(
  inputResourceHashes: Array<{ identity: string; sha256: string }> = [],
) {
  return {
    version: 1,
    parser: { id: "parse5", version: "7.3.0" },
    renderer: { id: "lirna-reading-react", version: "1" },
    inputResourceHashes,
  };
}

export function derivativeReadingFixture(
  plainText: string,
): SepReadingContract {
  const component = {
    identity: "article",
    role: "main" as const,
    label: "Article",
    order: 0,
    requestedUrl: source.canonicalUrl,
    finalUrl: source.canonicalUrl,
    retrievedAt: source.admittedAt,
    sha256: "a".repeat(64),
    toc: [],
    introductoryBlocks: [
      {
        kind: "paragraph" as const,
        children: [{ kind: "text" as const, text: plainText }],
      },
    ],
    sections: [],
    figures: [],
    bibliography: [
      {
        id: "references",
        title: "References",
        entries: [
          {
            id: "entry-one",
            label: "[1]",
            text: "Reference",
            anchor: "#entry-one",
            links: [],
            provenance: { componentIdentity: "article", locator: "#entry-one" },
          },
        ],
        provenance: { componentIdentity: "article", locator: "#references" },
      },
    ],
    plainText,
  };
  return {
    version: 1,
    source,
    mainComponent: {
      identity: component.identity,
      requestedUrl: component.requestedUrl,
      finalUrl: component.finalUrl,
      retrievedAt: component.retrievedAt,
      sha256: component.sha256,
    },
    components: [component],
    capture: {
      completeness: "complete",
      readingReadiness: "ready",
      readinessReasons: [],
      diagnostics: [],
    },
    toc: [],
    introductoryBlocks: component.introductoryBlocks,
    sections: [],
    plainText,
    provenance: {
      adapter: { id: "sep", version: "1" },
      parser: { id: "parse5", version: "7.3.0" },
      inputResourceHashes: [{ identity: "article", sha256: component.sha256 }],
    },
  };
}

export function refreshDerivativeText(reading: SepReadingContract) {
  for (const component of reading.components) {
    component.plainText = projectReadingArticle(
      component.introductoryBlocks,
      component.sections,
    ).text;
  }
  const main = reading.components.find(
    (component) => component.identity === reading.mainComponent.identity,
  );
  if (main) reading.plainText = main.plainText;
  return reading;
}
