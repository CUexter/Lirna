import { describe, expect, test } from "bun:test";
import { createHash, randomUUID } from "node:crypto";

import {
  buildReadingCaptureReport,
  buildReadingDerivative,
  buildStateRecords,
  sepObservationKeySchema,
  sepResourceRoleSchema,
} from "./sep-admission-builders";

const admittedAt = new Date("2026-08-17T12:00:00.000Z");
const sourceId = "11111111-1111-4111-8111-111111111111";

describe("SEP admission builders", () => {
  test("buildStateRecords sequences selected observations from the preview fixture", () => {
    const preview = admissionPreview();
    const previewResources = [
      previewResource({
        role: "main",
        identity: "active:/",
        observationKey: "submitted",
      }),
      previewResource({
        role: "citation-information",
        identity: "citation-information:admission",
      }),
      previewResource({
        role: "main",
        identity: "sum2026:/",
        observationKey: "recommended-archive",
      }),
    ];

    const records = buildStateRecords({
      preview,
      previewResources,
      selectedKeys: ["submitted", "recommended-archive"],
      sourceId,
      firstSequence: 0,
      now: admittedAt,
    });

    expect(records.map(({ id: _id, ...record }) => record)).toEqual([
      {
        sourceId,
        sequence: 0,
        adapterId: "sep",
        observationKey: "submitted",
        canonicalUrl: "https://plato.stanford.edu/entries/reading/",
        rightsBasis: "publicly-accessible",
        sensitivityLevel: "ordinary-cloud",
        admittedAt,
      },
      {
        sourceId,
        sequence: 1,
        adapterId: "sep",
        observationKey: "recommended-archive",
        canonicalUrl: "https://plato.stanford.edu/entries/reading/",
        rightsBasis: "publicly-accessible",
        sensitivityLevel: "ordinary-cloud",
        admittedAt,
      },
    ]);
    expect(records.every(({ id }) => uuidPattern.test(id))).toBe(true);
    expect(new Set(records.map(({ id }) => id)).size).toBe(2);
  });

  test("buildStateRecords throws when a selected observation lost its main resource", () => {
    expect(() =>
      buildStateRecords({
        preview: admissionPreview(),
        previewResources: [
          previewResource({
            role: "citation-information",
            identity: "citation-information:admission",
          }),
        ],
        selectedKeys: ["submitted"],
        sourceId,
        firstSequence: 0,
        now: admittedAt,
      }),
    ).toThrow("Selected observation lost its main resource");
  });

  test("buildReadingCaptureReport reads the preview fixture capture diagnostics", () => {
    expect(buildReadingCaptureReport(admissionPreview())).toEqual({
      completeness: "complete",
      readingReadiness: "ready",
      readinessReasons: [],
    });
  });

  test("observation and role parsers accept the captured fixture values", () => {
    expect(sepObservationKeySchema.parse("submitted")).toBe("submitted");
    expect(sepObservationKeySchema.parse("recommended-archive")).toBe(
      "recommended-archive",
    );
    expect(sepResourceRoleSchema.parse("main")).toBe("main");
    expect(sepResourceRoleSchema.parse("citation-information")).toBe(
      "citation-information",
    );
    expect(() => sepObservationKeySchema.parse("active")).toThrow();
    expect(() => sepResourceRoleSchema.parse("unknown")).toThrow();
  });

  test("buildReadingDerivative keeps the fixture title and strips executable HTML", () => {
    const preview = {
      ...admissionPreview(),
      title: "Reading integration",
    };
    const mainBody = Buffer.from(
      "<html><body><main><h2>Knowledge</h2><p>A typed paragraph.</p><script>window.pwned = true</script></main></body></html>",
      "utf8",
    );
    const main = previewResource({
      role: "main",
      identity: "active:/",
      body: mainBody,
    });
    const citation = previewResource({
      role: "citation-information",
      identity: "citation-information:admission",
      body: Buffer.from("citation evidence", "utf8"),
    });
    const state = {
      id: "22222222-2222-4222-8222-222222222222",
      observationKey: "submitted" as const,
      admittedAt,
    };

    const derivative = buildReadingDerivative({
      source: { id: sourceId },
      state,
      main,
      resources: [main, citation],
      preview,
    });

    expect(derivative).toMatchObject({
      sourceStateId: state.id,
      kind: "sep-reading-v1",
      valid: true,
      validation: { schema: "sep-reading-v1", status: "valid" },
    });
    expect(uuidPattern.test(derivative.id)).toBe(true);
    expect(derivative.payload).toMatchObject({
      source: { title: "Reading integration" },
      sections: [
        {
          title: [{ kind: "text", text: "Knowledge" }],
          blocks: [
            {
              kind: "paragraph",
              children: [{ kind: "text", text: "A typed paragraph." }],
            },
          ],
        },
      ],
      provenance: {
        adapter: { id: "sep", version: "1" },
        parser: { id: "parse5", version: "7.3.0" },
      },
      capture: {
        completeness: "complete",
        readingReadiness: "ready",
        readinessReasons: [],
      },
    });
    expect(JSON.stringify(derivative.payload)).not.toContain("window.pwned");
  });
});

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function admissionPreview() {
  return {
    id: randomUUID(),
    stableKey: "sep:admission-fixture",
    submittedUrl: "https://plato.stanford.edu/entries/admission/",
    recommendedArchiveUrl:
      "https://plato.stanford.edu/archives/sum2026/entries/admission/",
    title: "Admission integration",
    authors: ["Integration Author"],
    publisher: "Metaphysics Research Lab, Stanford University",
    publicationHistory: ["First published 2026"],
    diagnostics: [],
    captureDiagnostics: {
      completeness: "complete",
      readingReadiness: "ready",
      readinessReasons: [],
    },
    rightsBasis: "publicly-accessible",
    sensitivityLevel: "ordinary-cloud",
    processingMilliseconds: 1,
    createdAt: admittedAt,
    expiresAt: new Date(admittedAt.getTime() + 60_000),
  };
}

function previewResource({
  role,
  identity,
  observationKey = "submitted",
  charset = "utf-8",
  body = Buffer.from(
    `<html><body><main><p>${observationKey}</p></main></body></html>`,
  ),
}: {
  role: "main" | "citation-information";
  identity: string;
  observationKey?: "submitted" | "recommended-archive";
  charset?: string;
  body?: Buffer;
}) {
  const url =
    role === "main"
      ? "https://plato.stanford.edu/entries/reading/"
      : "https://plato.stanford.edu/cgi-bin/encyclopedia/archinfo.cgi?entry=reading";
  return {
    id: randomUUID(),
    previewId: "preview",
    observationKey,
    identity,
    role,
    requestedUrl: url,
    finalUrl: url,
    status: 200,
    mediaType: "text/html",
    charset,
    retrievedAt: admittedAt,
    selectedHeaders: { "content-type": "text/html; charset=utf-8" },
    requestCount: 1,
    downloadedBytes: body.byteLength,
    byteLength: body.byteLength,
    sha256: createHash("sha256").update(body).digest("hex"),
    discoveryEdge:
      role === "main" ? "submitted-entry" : "required-citation-information",
    depth: 0,
    body,
  };
}
