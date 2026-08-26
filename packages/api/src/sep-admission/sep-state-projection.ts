import {
  sourceStateDerivativeActivations,
  sourceStateDerivatives,
} from "@lirna/db/schema/sources";
import { desc, eq } from "drizzle-orm";

import {
  derivativeComparisonSchema,
  derivativeGenerationSchema,
  persistedDerivativeValidationSchema,
} from "../derivative-updates/derivative-update-schemas";
import { readActiveReadingDerivativeInSnapshot } from "./active-reading-derivative-store";
import { readingComponentSummary } from "./reading-content";
import {
  parseStringList,
  sepObservationKeySchema,
  sepResourceRoleSchema,
} from "./sep-admission-builders";
import {
  admittedCaptureReportSchema,
  diagnosticSchema,
} from "./sep-admission-preview";
import type { SepAdmittedState } from "./sep-admitted-state";
import {
  readSepReadingDerivative,
  sepReadingDerivativeKind,
} from "./sep-reading-contract";
import {
  type DatabaseExecutor,
  readSepStateEvidence,
} from "./sep-state-evidence";

export async function readSepAdmittedState(
  database: DatabaseExecutor,
  sourceId: string,
  stateId: string,
): Promise<SepAdmittedState | undefined> {
  const evidence = await readSepStateEvidence(
    database,
    sourceId,
    stateId,
    "role",
  );
  if (!evidence) return undefined;
  const { metadata, resources, state } = evidence;
  const activeReading = await readActiveReadingDerivativeInSnapshot(database, {
    sourceId,
    stateId,
  });
  const activeActivationId =
    activeReading.status === "active"
      ? activeReading.value.activationId
      : undefined;
  const derivativeRows = await database
    .select({
      derivative: sourceStateDerivatives,
      activation: sourceStateDerivativeActivations,
    })
    .from(sourceStateDerivatives)
    .leftJoin(
      sourceStateDerivativeActivations,
      eq(
        sourceStateDerivativeActivations.derivativeId,
        sourceStateDerivatives.id,
      ),
    )
    .where(eq(sourceStateDerivatives.sourceStateId, stateId))
    .orderBy(desc(sourceStateDerivativeActivations.sequence));
  const currentKinds = new Set<string>();
  const seenDerivatives = new Set<string>();
  const activationsByDerivative = new Map<
    string,
    Array<NonNullable<(typeof derivativeRows)[number]["activation"]>>
  >();
  for (const { derivative, activation } of derivativeRows) {
    if (!activation) continue;
    const activations = activationsByDerivative.get(derivative.id) ?? [];
    activations.push(activation);
    activationsByDerivative.set(derivative.id, activations);
  }
  const derivatives = derivativeRows.flatMap(({ derivative }) => {
    if (seenDerivatives.has(derivative.id)) return [];
    seenDerivatives.add(derivative.id);
    const activations = (activationsByDerivative.get(derivative.id) ?? [])
      .map((activation) => ({
        id: activation.id,
        derivativeId: activation.derivativeId,
        sequence: activation.sequence,
        actorId: activation.actorId,
        reason: activation.reason,
        activatedAt: activation.activatedAt.toISOString(),
        consequences: derivativeComparisonSchema.parse(activation.consequences),
      }))
      .toSorted((left, right) => right.sequence - left.sequence);
    const activation = activations[0];
    const reading =
      derivative.kind === sepReadingDerivativeKind && derivative.valid
        ? readSepReadingDerivative(derivative.payload)
        : undefined;
    const current =
      derivative.kind === sepReadingDerivativeKind
        ? activation?.id === activeActivationId
        : activation && !currentKinds.has(derivative.kind);
    if (current) currentKinds.add(derivative.kind);
    const validation = persistedDerivativeValidationSchema.parse(
      derivative.validation,
    );
    return {
      id: derivative.id,
      kind: derivative.kind,
      ...(derivative.previousDerivativeId
        ? { previousDerivativeId: derivative.previousDerivativeId }
        : {}),
      valid: derivative.valid,
      generation: derivativeGenerationSchema.parse(derivative.generation),
      validation: {
        status: validation.status,
        checks: validation.checks,
      },
      ...(validation.comparison ? { comparison: validation.comparison } : {}),
      createdAt: derivative.createdAt.toISOString(),
      ...(current && activation
        ? {
            currentActivation: {
              ...activation,
            },
          }
        : {}),
      activationHistory: activations,
      ...(reading ? { provenance: reading.provenance } : {}),
    };
  });
  const reading =
    activeReading.status === "active" ? activeReading.value.reading : undefined;
  return {
    id: state.id,
    sourceId: state.sourceId,
    sequence: state.sequence,
    observationKey: sepObservationKeySchema.parse(state.observationKey),
    canonicalUrl: state.canonicalUrl ?? "",
    title: metadata.title,
    authors: parseStringList(metadata.authors),
    publisher: metadata.publisher,
    publicationHistory: parseStringList(metadata.publicationHistory),
    admittedAt: state.admittedAt.toISOString(),
    policy: {
      rightsBasis: state.rightsBasis,
      sensitivityLevel: state.sensitivityLevel,
    },
    diagnostics: diagnosticSchema.array().parse(metadata.diagnostics),
    capture: admittedCaptureReportSchema.parse(metadata.captureDiagnostics),
    resources: resources.map((resource) => ({
      identity: resource.identity,
      role: sepResourceRoleSchema.parse(resource.role),
      requestedUrl: resource.requestedUrl,
      finalUrl: resource.finalUrl,
      status: resource.status,
      mediaType: resource.mediaType,
      ...(resource.charset ? { charset: resource.charset } : {}),
      ...(resource.contentEncoding
        ? { contentEncoding: resource.contentEncoding }
        : {}),
      selectedHeaders: resource.selectedHeaders,
      requestCount: resource.requestCount,
      downloadedBytes: resource.downloadedBytes,
      retrievedAt: resource.retrievedAt.toISOString(),
      byteLength: resource.byteLength,
      sha256: resource.sha256,
      discoveryEdge: resource.discoveryEdge,
      depth: resource.depth,
    })),
    components: reading?.components.map(readingComponentSummary) ?? [],
    derivatives,
  };
}
