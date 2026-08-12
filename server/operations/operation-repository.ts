import { randomUUID } from "node:crypto";
import { and, eq, lt, or, sql } from "drizzle-orm";
import type { LirnaDatabase } from "../database/database.js";
import { applicationOperations } from "./schema.js";

export type OperationStatus = "queued" | "processing" | "completed" | "failed";
export const syntheticOperationKind = "synthetic-adapter-roundtrip" as const;
export type OperationKind = typeof syntheticOperationKind;

export interface ApplicationOperation {
  id: string;
  kind: OperationKind;
  input: string;
  status: OperationStatus;
  result?: {
    artifactUrl: string;
    vaultPath: string;
  };
  artifactHash?: string;
  error?: string;
}

type OperationRow = typeof applicationOperations.$inferSelect;

export class OperationRepository {
  constructor(private readonly db: LirnaDatabase) {}

  async submit(kind: OperationKind, input: string): Promise<ApplicationOperation> {
    const id = randomUUID();
    const [row] = await this.db
      .insert(applicationOperations)
      .values({ id, kind, input, status: "queued" })
      .returning();
    return mapRow(row!);
  }

  async get(id: string): Promise<ApplicationOperation | undefined> {
    const [row] = await this.db
      .select()
      .from(applicationOperations)
      .where(eq(applicationOperations.id, id))
      .limit(1);
    return row ? mapRow(row) : undefined;
  }

  async claim(): Promise<ApplicationOperation | undefined> {
    return this.db.transaction(async (tx) => {
      const [row] = await tx
        .select({ id: applicationOperations.id })
        .from(applicationOperations)
        .where(or(
          eq(applicationOperations.status, "queued"),
          and(
            eq(applicationOperations.status, "processing"),
            lt(applicationOperations.leaseUntil, sql`now()`),
          ),
        ))
        .orderBy(applicationOperations.requestedAt)
        .limit(1)
        .for("update", { skipLocked: true });
      if (!row) {
        return undefined;
      }

      const [updated] = await tx
        .update(applicationOperations)
        .set({
          status: "processing",
          attempts: sql`${applicationOperations.attempts} + 1`,
          leaseUntil: sql`now() + interval '30 seconds'`,
          error: null,
        })
        .where(eq(applicationOperations.id, row.id))
        .returning();
      return mapRow(updated!);
    });
  }

  async complete(
    id: string,
    artifactHash: string,
    result: NonNullable<ApplicationOperation["result"]>,
  ): Promise<void> {
    if (
      !result ||
      typeof result.artifactUrl !== "string" ||
      result.artifactUrl.length === 0 ||
      typeof result.vaultPath !== "string" ||
      result.vaultPath.length === 0
    ) {
      throw new Error("Operation result requires artifactUrl and vaultPath");
    }
    await this.db
      .update(applicationOperations)
      .set({
        status: "completed",
        result,
        artifactHash,
        leaseUntil: null,
        completedAt: new Date(),
      })
      .where(eq(applicationOperations.id, id));
  }

  async fail(id: string, error: string): Promise<void> {
    await this.db
      .update(applicationOperations)
      .set({ status: "failed", error, leaseUntil: null })
      .where(eq(applicationOperations.id, id));
  }
}

function mapRow(row: OperationRow): ApplicationOperation {
  if (row.result && !isOperationResult(row.result)) {
    throw new Error(`Operation ${row.id} has an invalid persisted result`);
  }
  return {
    id: row.id,
    kind: row.kind,
    input: row.input,
    status: row.status,
    ...(row.result ? { result: row.result } : {}),
    ...(row.artifactHash ? { artifactHash: row.artifactHash } : {}),
    ...(row.error ? { error: row.error } : {}),
  };
}

function isOperationResult(value: unknown): value is NonNullable<ApplicationOperation["result"]> {
  return (
    value !== null &&
    typeof value === "object" &&
    typeof (value as Record<string, unknown>).artifactUrl === "string" &&
    typeof (value as Record<string, unknown>).vaultPath === "string"
  );
}
