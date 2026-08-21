import { describe, expect, test } from "bun:test";

import {
  admissionPreviewFields,
  previewResource,
  previewResourcesForObservations,
  readingIntegrationHtml,
} from "./fixtures/admission-preview";
import {
  buildReadingCaptureReport,
  buildReadingDerivative,
  buildStateRecords,
  sepObservationKeySchema,
  sepResourceRoleSchema,
} from "./sep-admission-builders";

const admittedAt = new Date("2026-08-17T12:00:00.000Z");
const sourceId = "11111111-1111-4111-8111-111111111111";
const previewId = "preview";

describe("SEP admission builders", () => {
  test("buildStateRecords sequences selected observations from the preview fixture", () => {
    const preview = admissionPreviewFields({ now: admittedAt });
    const previewResources = previewResourcesForObservations({
      previewId,
      observations: ["submitted", "recommended-archive"],
    }).map((resource) => ({ ...resource, retrievedAt: admittedAt }));

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
        preview: admissionPreviewFields({ now: admittedAt }),
        previewResources: [
          previewResource({
            previewId,
            role: "citation-information",
            identity: "citation-information:admission",
            body: Buffer.from("citation"),
            retrievedAt: admittedAt,
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
    expect(
      buildReadingCaptureReport(admissionPreviewFields({ now: admittedAt })),
    ).toEqual({
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
    const preview = admissionPreviewFields({
      title: "Reading integration",
      now: admittedAt,
    });
    const mainBody = Buffer.from(readingIntegrationHtml, "utf8");
    const main = previewResource({
      previewId,
      role: "main",
      identity: "active:/",
      body: mainBody,
      retrievedAt: admittedAt,
    });
    const citation = previewResource({
      previewId,
      role: "citation-information",
      identity: "citation-information:admission",
      body: Buffer.from("citation evidence", "utf8"),
      retrievedAt: admittedAt,
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
      metadata: {
        title: preview.title,
        authors: preview.authors,
        publisher: preview.publisher,
        publicationHistory: preview.publicationHistory,
      },
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
