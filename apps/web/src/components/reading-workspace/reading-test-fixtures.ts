import type { InquiryOutputs } from "@/clients/inquiry";

import { additionalReadingComponents } from "./reading-additional-components-fixture";
import { capturedAt, readingComponent } from "./reading-component-fixture";

export const sourceId = "10000000-0000-4000-8000-000000000000";
export const stateId = "20000000-0000-4000-8000-000000000000";

type Reading = InquiryOutputs["sources"]["reading"];

export function readingFixture(): Reading {
  const article = readingComponent();
  return {
    version: 1,
    source: {
      id: sourceId,
      stateId,
      title: "Synthetic Reading Source",
      authors: ["Ada Lovelace", "Grace Hopper"],
      publisher: "Synthetic Publisher",
      publicationHistory: ["First published 2026"],
      canonicalUrl: "https://plato.stanford.edu/entries/synthetic/",
      observation: "submitted",
      admittedAt: capturedAt,
    },
    mainComponent: {
      identity: article.identity,
      requestedUrl: article.requestedUrl,
      finalUrl: article.finalUrl,
      retrievedAt: capturedAt,
      sha256: article.sha256,
    },
    components: [article, ...additionalReadingComponents()],
    capture: {
      completeness: "partial",
      readingReadiness: "degraded",
      readinessReasons: ["One optional component was unavailable."],
      diagnostics: [
        {
          level: "warning",
          code: "synthetic-capture-warning",
          message: "Synthetic capture warning.",
          source: { componentIdentity: "article", locator: "capture" },
        },
      ],
    },
    toc: article.toc,
    introductoryBlocks: article.introductoryBlocks,
    sections: article.sections,
    plainText: article.plainText,
    provenance: {
      adapter: { id: "sep", version: "1" },
      parser: { id: "parse5", version: "7.3.0" },
      inputResourceHashes: [{ identity: "article", sha256: article.sha256 }],
    },
  };
}
