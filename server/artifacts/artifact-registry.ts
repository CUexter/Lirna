import pg from "pg";
import { isContentHash, type ArtifactStore } from "./file-artifact-store.js";

const { Pool } = pg;

/**
 * Source handling policy governs one artifact's local retention and external
 * processing. Sensitivity and rights basis are independent; the most
 * restrictive applicable rule wins (see CONTEXT.md).
 */
export type SensitivityLevel = "ordinary-cloud" | "restricted-cloud" | "local-only";
export type RightsBasis =
  | "owned"
  | "lawfully-acquired"
  | "publicly-accessible"
  | "explicitly-licensed"
  | "reference-only"
  | "inaccessible";

export interface SourceHandlingPolicy {
  readonly sensitivity: SensitivityLevel;
  readonly rightsBasis: RightsBasis;
}

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

interface ArtifactRow {
  hash: string;
  byte_size: string;
  sensitivity: SensitivityLevel;
  rights_basis: RightsBasis;
  provenance_origin: ProvenanceOrigin;
  provenance_detail: string;
  registered_at: Date;
}

interface ReferenceRow {
  kind: ArtifactReference["kind"];
  target_id: string;
  locator: string | null;
}

/**
 * Owns artifact metadata in PostgreSQL while delegating the bytes to a
 * content-addressed storage adapter. Identity is the artifact's content hash;
 * identical bytes resolve to one identity without creating conflicts. The
 * registry is the authority; the store is a replaceable adapter.
 */
export class ArtifactRegistry {
  private readonly pool: pg.Pool;

  constructor(databaseUrl: string, private readonly store: ArtifactStore) {
    this.pool = new Pool({ connectionString: databaseUrl });
  }

  async register(command: RegisterCommand): Promise<ArtifactMetadata> {
    const stored = await this.store.put(command.content);
    const hash = stored.hash;
    const byteSize = command.content.byteLength;

    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `INSERT INTO artifacts
           (hash, byte_size, sensitivity, rights_basis, provenance_origin, provenance_detail)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (hash) DO NOTHING`,
        [
          hash,
          byteSize,
          command.policy.sensitivity,
          command.policy.rightsBasis,
          command.provenance.origin,
          command.provenance.detail,
        ],
      );
      for (const reference of command.references ?? []) {
        await client.query(
          `INSERT INTO artifact_references (hash, kind, target_id, locator)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (hash, kind, target_id) DO NOTHING`,
          [hash, reference.kind, reference.targetId, reference.locator ?? null],
        );
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }

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
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY");
      const artifact = await client.query<ArtifactRow>(
        `SELECT hash, byte_size, sensitivity, rights_basis,
                provenance_origin, provenance_detail, registered_at
           FROM artifacts
          WHERE hash = $1`,
        [hash],
      );
      const row = artifact.rows[0];
      if (!row) {
        await client.query("COMMIT");
        return undefined;
      }
      const references = await client.query<ReferenceRow>(
        `SELECT kind, target_id, locator
           FROM artifact_references
          WHERE hash = $1
          ORDER BY kind, target_id`,
        [hash],
      );
      await client.query("COMMIT");
      return mapArtifact(row, references.rows);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
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
    const result = await this.pool.query<{ hash: string }>(
      `SELECT hash FROM artifacts ORDER BY hash`,
    );
    const registered = result.rows.map((row) => row.hash);

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

  async close(): Promise<void> {
    await this.pool.end();
  }
}

function mapArtifact(row: ArtifactRow, references: ReferenceRow[]): ArtifactMetadata {
  return {
    hash: row.hash,
    byteSize: Number(row.byte_size),
    policy: {
      sensitivity: row.sensitivity,
      rightsBasis: row.rights_basis,
    },
    provenance: {
      origin: row.provenance_origin,
      detail: row.provenance_detail,
    },
    references: references.map((reference) => ({
      kind: reference.kind,
      targetId: reference.target_id,
      ...(reference.locator !== null ? { locator: reference.locator } : {}),
    })),
    registeredAt: row.registered_at.toISOString(),
  };
}
