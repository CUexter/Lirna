import { describe, expect, test } from "bun:test";

import { createSepReadingDerivative } from "./sep-reading";

const source = {
  id: "10000000-0000-4000-8000-000000000000",
  stateId: "20000000-0000-4000-8000-000000000000",
  title: "Logic",
  authors: ["Alice Example"],
  publisher: "Metaphysics Research Lab, Stanford University",
  publicationHistory: ["First published 2024"],
  canonicalUrl: "https://plato.stanford.edu/entries/logic/",
  observation: "submitted" as const,
  admittedAt: "2026-08-18T12:00:00.000Z",
};

function derivative(
  html: string,
  asset?: { path: string; mediaType: string; body: Buffer },
) {
  const main = {
    identity: "active:/",
    requestedUrl: source.canonicalUrl,
    finalUrl: source.canonicalUrl,
    retrievedAt: new Date("2026-08-17T12:00:00.000Z"),
    sha256: "a".repeat(64),
    charset: "utf-8",
    body: Buffer.from(html),
  };
  const assetIdentity = asset ? `active:/${asset.path}` : undefined;
  const assetUrl = asset
    ? new URL(asset.path, source.canonicalUrl).href
    : undefined;
  return createSepReadingDerivative({
    source,
    main,
    resources: [
      { identity: "active:/", sha256: "a".repeat(64) },
      ...(assetIdentity
        ? [{ identity: assetIdentity, sha256: "c".repeat(64) }]
        : []),
    ],
    ...(asset && assetIdentity && assetUrl
      ? {
          components: [
            {
              ...main,
              role: "main" as const,
              discoveryEdge: "submitted-entry",
            },
            {
              identity: assetIdentity,
              role: "semantic-asset" as const,
              requestedUrl: assetUrl,
              finalUrl: assetUrl,
              retrievedAt: main.retrievedAt,
              sha256: "c".repeat(64),
              mediaType: asset.mediaType,
              body: asset.body,
              discoveryEdge: "authored:active:/",
            },
          ],
        }
      : {}),
    capture: {
      completeness: "complete",
      readingReadiness: "ready",
      readinessReasons: [],
      diagnostics: [],
    },
  });
}

describe("SEP Reading figures", () => {
  test("keeps semantic images with missing assets as diagnosed figures", () => {
    const result = derivative(
      '<main><p>Reading content.</p><img src="icons/sep-man.png" alt="SEP man icon"></main>',
    );
    expect(result.components[0]?.figures).toEqual([
      expect.objectContaining({
        description: { text: [{ kind: "text", text: "SEP man icon" }] },
        diagnostics: [
          expect.objectContaining({ code: "missing-semantic-asset" }),
        ],
      }),
    ]);
  });

  test("keeps images with authored descriptions when assets are missing", () => {
    const result = derivative(
      '<main><img src="diagram.png" longdesc="diagram-description.html"></main>',
    );
    expect(result.components[0]?.figures).toEqual([
      expect.objectContaining({
        diagnostics: [
          expect.objectContaining({ code: "missing-figure-description" }),
          expect.objectContaining({ code: "missing-semantic-asset" }),
        ],
      }),
    ]);
  });

  test("omits explicitly decorative standalone images", () => {
    const result = derivative(
      '<main><img src="icons/spacer.png" alt=""><img src="icons/rule.png" role="presentation"><img src="icons/hidden.png" aria-hidden="true"></main>',
    );
    expect(result.components[0]?.figures).toEqual([]);
  });

  test("diagnoses retained semantic assets with unsupported media types", () => {
    const result = derivative(
      '<main><img src="diagram.svg" alt="Semantic diagram"></main>',
      {
        path: "diagram.svg",
        mediaType: "image/svg+xml",
        body: Buffer.from("<svg></svg>"),
      },
    );
    expect(result.components[0]?.figures[0]).toEqual(
      expect.objectContaining({
        assetIdentity: "active:/diagram.svg",
        diagnostics: [
          expect.objectContaining({ code: "unsupported-semantic-asset" }),
        ],
      }),
    );
    expect(result.components[0]?.figures[0]?.assetDataUrl).toBeUndefined();
    expect(result.provenance.inputResourceHashes).toContainEqual({
      identity: "active:/diagram.svg",
      sha256: "c".repeat(64),
    });
  });

  test("places figures at their authored position in reading blocks", () => {
    const result = derivative(
      '<main><h2 id="worlds">Worlds</h2><p>Before the diagram.</p><figure id="possible-worlds"><img src="worlds.png" alt="Possible Worlds"><figcaption>Possible Worlds</figcaption></figure><p>After the diagram.</p></main>',
    );
    expect(result.sections[0]?.blocks.map((block) => block.kind)).toEqual([
      "paragraph",
      "figure",
      "paragraph",
    ]);
    expect(result.sections[0]?.blocks[1]).toEqual(
      expect.objectContaining({
        kind: "figure",
        figure: expect.objectContaining({ id: "possible-worlds" }),
      }),
    );
  });
});
