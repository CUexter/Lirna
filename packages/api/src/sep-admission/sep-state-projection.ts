import type { db } from "@lirna/db";
import { sepSourceStateMetadata } from "@lirna/db/schema/sep-admission";
import {
  sourceStateDerivativeActivations,
  sourceStateDerivatives,
  sourceStateResources,
  sourceStates,
} from "@lirna/db/schema/sources";
import { and, asc, desc, eq } from "drizzle-orm";

import {
  derivativeComparisonSchema,
  derivativeGenerationSchema,
  persistedDerivativeValidationSchema,
} from "../derivative-updates/derivative-update-schemas";
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

type DatabaseExecutor =
  | Parameters<Parameters<(typeof db)["transaction"]>[0]>[0]
  | typeof db;

export async function readSepAdmittedState(
  database: DatabaseExecutor,
  sourceId: string,
  stateId: string,
): Promise<SepAdmittedState | undefined> {
  const [row] = await database
    .select({ state: sourceStates, metadata: sepSourceStateMetadata })
    .from(sourceStates)
    .innerJoin(
      sepSourceStateMetadata,
      eq(sepSourceStateMetadata.sourceStateId, sourceStates.id),
    )
    .where(
      and(eq(sourceStates.id, stateId), eq(sourceStates.sourceId, sourceId)),
    );
  if (!row) return undefined;
  const resources = await database
    .select()
    .from(sourceStateResources)
    .where(eq(sourceStateResources.sourceStateId, stateId))
    .orderBy(
      asc(sourceStateResources.role),
      asc(sourceStateResources.identity),
    );
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
    .orderBy(
      desc(sourceStateDerivativeActivations.activatedAt),
      desc(sourceStateDerivativeActivations.id),
    );
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
        actorId: activation.actorId,
        reason: activation.reason,
        activatedAt: activation.activatedAt.toISOString(),
        consequences: derivativeComparisonSchema.parse(activation.consequences),
      }))
      .toSorted(
        (left, right) =>
          right.activatedAt.localeCompare(left.activatedAt) ||
          right.id.localeCompare(left.id),
      );
    const activation = activations[0];
    const reading =
      derivative.kind === sepReadingDerivativeKind && derivative.valid
        ? readSepReadingDerivative(derivative.payload)
        : undefined;
    const current = activation && !currentKinds.has(derivative.kind);
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
  const activeReadingRow = derivativeRows.find(
    ({ derivative, activation }) =>
      derivative.kind === sepReadingDerivativeKind && Boolean(activation),
  );
  const reading = activeReadingRow
    ? readSepReadingDerivative(activeReadingRow.derivative.payload)
    : undefined;
  return {
    id: row.state.id,
    sourceId: row.state.sourceId,
    sequence: row.state.sequence,
    observationKey: sepObservationKeySchema.parse(row.state.observationKey),
    canonicalUrl: row.state.canonicalUrl ?? "",
    title: row.metadata.title,
    authors: parseStringList(row.metadata.authors),
    publisher: row.metadata.publisher,
    publicationHistory: parseStringList(row.metadata.publicationHistory),
    admittedAt: row.state.admittedAt.toISOString(),
    policy: {
      rightsBasis: row.state.rightsBasis,
      sensitivityLevel: row.state.sensitivityLevel,
    },
    diagnostics: diagnosticSchema.array().parse(row.metadata.diagnostics),
    capture: admittedCaptureReportSchema.parse(row.metadata.captureDiagnostics),
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
    components:
      reading?.components.map((component) => ({
        identity: component.identity,
        role: component.role,
        label: component.label,
        order: component.order,
        ...(component.parentIdentity
          ? { parentIdentity: component.parentIdentity }
          : {}),
        requestedUrl: component.requestedUrl,
        finalUrl: component.finalUrl,
        retrievedAt: component.retrievedAt,
        sha256: component.sha256,
      })) ?? [],
    derivatives,
  };
}
