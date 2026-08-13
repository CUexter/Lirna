import { randomUUID } from "node:crypto";
import { asc, eq } from "drizzle-orm";
import type { LirnaDatabase } from "../database/database.js";
import { type ArtifactStore, isContentHash } from "./file-artifact-store.js";
import { artifactReferences, artifactRegistrations, artifacts } from "./schema.js";
import {
  isSourceHandlingPolicy,
  mostRestrictivePolicy,
  type RightsBasis,
  type SensitivityLevel,
  type SourceHandlingPolicy,
} from "./source-handling-policy.js";

export type {
  RightsBasis,
  SensitivityLevel,
  SourceHandlingPolicy,
} from "./source-handling-policy.js";

/**
 * Source handling policy governs one artifact's local retention and external
 * processing. Sensitivity and rights basis are independent; the most
 * restrictive applicable rule wins (see CONTEXT.md).
 */
/**
 * The attributable origin and transformation history of one artifact's claim
 * (see CONTEXT.md Provenance). Only source-dependent claims necessarily carry
 * Citations; Provenance is recorded for every artifact regardless.
 */
export type ProvenanceOrigin =
  | "published-source"
  | "personal-observation"
  | "personal-testimony"
  | "original-reasoning"
  | "other-person";

export interface Provenance {
  readonly origin: ProvenanceOrigin;
  readonly detail: string;
}

/**
 * A durable relationship from one artifact to a related object. A reference
 * preserves identity without copying the target's lifecycle state.
 */
export interface ArtifactReference {
  readonly kind: "source" | "owned-note" | "rendition" | "derivative";
  readonly targetId: string;
  readonly locator?: string;
}

/** Authoritative metadata for one content-addressed artifact. */
export interface ArtifactMetadata {
  readonly hash: string;
  readonly byteSize: number;
  readonly policy: SourceHandlingPolicy;
  readonly provenance: Provenance;
  readonly provenanceHistory: Provenance[];
  readonly references: ArtifactReference[];
  readonly registeredAt: string;
}

export interface RegisterCommand {
  readonly content: Buffer;
  readonly policy: SourceHandlingPolicy;
  readonly provenance: Provenance;
  readonly references?: ArtifactReference[];
}

/**
 * The outcome of comparing the authoritative registry against the storage
 * adapter. Reconciliation is read-only: it reports discrepancies and never
 * silently repairs authoritative metadata or stored bytes.
 */
export interface ReconciliationReport {
  readonly missing: string[];
  readonly unexpected: string[];
  readonly hashMismatch: Array<{ hash: string; actualHash: string }>;
}

/**
 * Owns artifact metadata in PostgreSQL while delegating the bytes to a
 * content-addressed storage adapter. Identity is the artifact's content hash;
 * identical bytes resolve to one identity without creating conflicts. The
 * registry is the authority; the store is a replaceable adapter.
 */
export class ArtifactRegistry {
  constructor(
    private readonly db: LirnaDatabase,
    private readonly store: ArtifactStore,
  ) {}

  async register(command: RegisterCommand): Promise<ArtifactMetadata> {
    validateRegistrationMetadata(command.policy, command.provenance, command.references);

    const stored = await this.store.put(command.content);
    const hash = stored.hash;
    const byteSize = command.content.byteLength;

    await this.db.transaction(async (tx) => {
      await tx
        .insert(artifacts)
        .values({
          hash,
          byteSize,
          sensitivity: command.policy.sensitivity,
          rightsBasis: command.policy.rightsBasis,
          provenanceOrigin: command.provenance.origin,
          provenanceDetail: command.provenance.detail,
        })
        .onConflictDoNothing();

      await tx
        .insert(artifactRegistrations)
        .values({
          id: randomUUID(),
          hash,
          sensitivity: command.policy.sensitivity,
          rightsBasis: command.policy.rightsBasis,
          provenanceOrigin: command.provenance.origin,
          provenanceDetail: command.provenance.detail,
        })
        .onConflictDoNothing();

      const references = command.references ?? [];
      if (references.length > 0) {
        await tx
          .insert(artifactReferences)
          .values(
            references.map((reference) => ({
              hash,
              kind: reference.kind,
              targetId: reference.targetId,
              locator: reference.locator ?? "",
            })),
          )
          .onConflictDoNothing();
      }
    });

    const view = await this.view(hash);
    if (!view) {
      throw new Error(`Artifact ${hash} vanished after registration`);
    }
    return view;
  }

  async view(hash: string): Promise<ArtifactMetadata | undefined> {
    if (!isContentHash(hash)) {
      return undefined;
    }
    return this.db.transaction(
      async (tx) => {
        const [row] = await tx.select().from(artifacts).where(eq(artifacts.hash, hash));
        if (!row) {
          return undefined;
        }
        const references = await tx
          .select({
            kind: artifactReferences.kind,
            targetId: artifactReferences.targetId,
            locator: artifactReferences.locator,
          })
          .from(artifactReferences)
          .where(eq(artifactReferences.hash, hash))
          .orderBy(asc(artifactReferences.kind), asc(artifactReferences.targetId));
        const registrations = await tx
          .select()
          .from(artifactRegistrations)
          .where(eq(artifactRegistrations.hash, hash))
          .orderBy(asc(artifactRegistrations.registeredAt), asc(artifactRegistrations.id));
        return mapArtifact(row, references, registrations);
      },
      { isolationLevel: "repeatable read", accessMode: "read only" },
    );
  }

  /**
   * Compares the authoritative registry against the storage adapter and reports
   * missing, unexpected, and hash-mismatched objects. The three categories are
   * non-overlapping: missing = registered but absent from storage; unexpected =
   * stored but not registered; hashMismatch = registered, present, but whose
   * stored bytes no longer hash to the recorded identity. Read-only: it never
   * silently repairs authoritative metadata or stored bytes.
   */
  async reconcile(): Promise<ReconciliationReport> {
    const rows = await this.db
      .select({ hash: artifacts.hash })
      .from(artifacts)
      .orderBy(asc(artifacts.hash));
    const registered = rows.map((row) => row.hash);

    const stored = await this.store.list();
    const registeredSet = new Set(registered);
    const storedSet = new Set(stored);

    const missing = registered.filter((hash) => !storedSet.has(hash));
    const unexpected = stored.filter((hash) => !registeredSet.has(hash));

    const hashMismatch: Array<{ hash: string; actualHash: string }> = [];
    for (const hash of registered) {
      if (!storedSet.has(hash)) {
        continue;
      }
      const actualHash = await this.store.verify(hash);
      if (actualHash !== null && actualHash !== hash) {
        hashMismatch.push({ hash, actualHash });
      }
    }

    return { missing, unexpected, hashMismatch };
  }
}

function mapArtifact(
  row: typeof artifacts.$inferSelect,
  references: Array<Pick<typeof artifactReferences.$inferSelect, "kind" | "targetId" | "locator">>,
  registrations: Array<typeof artifactRegistrations.$inferSelect>,
): ArtifactMetadata {
  const provenanceHistory =
    registrations.length > 0
      ? registrations.map((registration) => ({
          origin: registration.provenanceOrigin,
          detail: registration.provenanceDetail,
        }))
      : [{ origin: row.provenanceOrigin, detail: row.provenanceDetail }];
  const policies =
    registrations.length > 0
      ? registrations.map((registration) => ({
          sensitivity: registration.sensitivity,
          rightsBasis: registration.rightsBasis,
        }))
      : [{ sensitivity: row.sensitivity, rightsBasis: row.rightsBasis }];
  return {
    hash: row.hash,
    byteSize: row.byteSize,
    policy: mostRestrictivePolicy(policies),
    provenance: provenanceHistory[0]!,
    provenanceHistory,
    references: references.map((reference) => ({
      kind: reference.kind,
      targetId: reference.targetId,
      ...(reference.locator !== "" ? { locator: reference.locator } : {}),
    })),
    registeredAt: row.registeredAt.toISOString(),
  };
}

const provenanceOrigins: readonly ProvenanceOrigin[] = [
  "published-source",
  "personal-observation",
  "personal-testimony",
  "original-reasoning",
  "other-person",
];
const referenceKinds: ReadonlyArray<ArtifactReference["kind"]> = [
  "source",
  "owned-note",
  "rendition",
  "derivative",
];

function validateRegistrationMetadata(
  policy: unknown,
  provenance: unknown,
  references: unknown,
): void {
  if (!isSourceHandlingPolicy(policy)) {
    throw new TypeError("Artifact policy has an invalid sensitivity");
  }
  if (!isRecord(provenance) || !provenanceOrigins.includes(provenance.origin as ProvenanceOrigin)) {
    throw new TypeError("Artifact provenance has an invalid origin");
  }
  if (typeof provenance.detail !== "string") {
    throw new TypeError("Artifact provenance detail must be a string");
  }
  if (references === undefined) {
    return;
  }
  if (!Array.isArray(references)) {
    throw new TypeError("Artifact references must be an array");
  }
  for (const reference of references) {
    if (
      !isRecord(reference) ||
      !referenceKinds.includes(reference.kind as ArtifactReference["kind"])
    ) {
      throw new TypeError("Artifact reference has an invalid kind");
    }
    if (typeof reference.targetId !== "string") {
      throw new TypeError("Artifact reference targetId must be a string");
    }
    if (reference.locator !== undefined && typeof reference.locator !== "string") {
      throw new TypeError("Artifact reference locator must be a string when provided");
    }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
