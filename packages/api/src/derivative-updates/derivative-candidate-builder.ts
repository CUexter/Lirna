import type { sepSourceStateMetadata } from "@lirna/db/schema/sep-admission";
import type {
  sourceStateResources,
  sourceStates,
} from "@lirna/db/schema/sources";
import {
  parseStringList,
  sepObservationKeySchema,
  sepResourceRoleSchema,
} from "../sep-admission/admission/builders";
import {
  admittedCaptureReportSchema,
  diagnosticSchema,
} from "../sep-admission/admission/preview";
import { createSepReadingDerivative } from "../sep-admission/reading/derivative";

export function buildCandidateFromEvidence(evidence: {
  state: typeof sourceStates.$inferSelect;
  metadata: typeof sepSourceStateMetadata.$inferSelect;
  resources: Array<typeof sourceStateResources.$inferSelect>;
}) {
  const { state, metadata, resources } = evidence;
  const main = resources.find(({ role }) => role === "main");
  if (!main)
    throw new Error("Immutable Source-state evidence has no main resource");
  const capture = admittedCaptureReportSchema.parse(
    metadata.captureDiagnostics,
  );
  if (!state.canonicalUrl)
    throw new Error("Immutable Source-state evidence has no canonical URL");
  return createSepReadingDerivative({
    source: {
      id: state.sourceId,
      stateId: state.id,
      title: metadata.title,
      authors: parseStringList(metadata.authors),
      publisher: metadata.publisher,
      publicationHistory: parseStringList(metadata.publicationHistory),
      canonicalUrl: state.canonicalUrl,
      observation: sepObservationKeySchema.parse(metadata.observationKey),
      admittedAt: state.admittedAt.toISOString(),
    },
    main,
    resources,
    components: resources
      .filter(({ role }) => role !== "citation-information")
      .map((resource) => ({
        ...resource,
        role: sepResourceRoleSchema.parse(resource.role),
        discoveryEdge: resource.discoveryEdge,
      })),
    capture: {
      completeness: capture.completeness,
      readingReadiness: capture.readingReadiness,
      readinessReasons: capture.readinessReasons,
      diagnostics: diagnosticSchema.array().parse(metadata.diagnostics),
    },
  });
}
