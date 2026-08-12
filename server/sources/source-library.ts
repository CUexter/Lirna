import { randomUUID } from "node:crypto";
import { asc, eq } from "drizzle-orm";
import type { LirnaDatabase } from "../database/database.js";
import {
  rightsBases,
  sensitivityLevels,
  type RightsBasis,
  type SensitivityLevel,
} from "../artifacts/source-handling-policy.js";
import { sourceStates, sources } from "./schema.js";

export interface AdmitTextSourceCommand {
  title: string;
  text: string;
  rightsBasis: RightsBasis;
  sensitivityLevel: SensitivityLevel;
}

export interface SourceView {
  id: string;
  title: string;
  admittedAt: string;
  state: {
    id: string;
    normalizedText: string;
    rightsBasis: RightsBasis;
    sensitivityLevel: SensitivityLevel;
    admittedAt: string;
  };
}

export class SourceAdmissionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SourceAdmissionError";
  }
}

export class SourceLibrary {
  constructor(private readonly db: LirnaDatabase) {}

  async admitText(command: AdmitTextSourceCommand): Promise<SourceView> {
    const title = command.title.trim();
    if (!title || !command.text.trim()) {
      throw new SourceAdmissionError("A text Source requires a title and text");
    }

    const sourceId = randomUUID();
    const stateId = randomUUID();
    await this.db.transaction(async (tx) => {
      await tx.insert(sources).values({
        id: sourceId,
        title,
      });
      await tx.insert(sourceStates).values({
        id: stateId,
        sourceId,
        authoritativeText: command.text,
        normalizedText: normalizeText(command.text),
        rightsBasis: command.rightsBasis,
        sensitivityLevel: command.sensitivityLevel,
      });
    });

    const source = await this.read(sourceId);
    if (!source) throw new Error(`Source ${sourceId} vanished after admission`);
    return source;
  }

  async read(sourceId: string): Promise<SourceView | undefined> {
    const rows = await this.db
      .select({
        id: sources.id,
        title: sources.title,
        admittedAt: sources.admittedAt,
        stateId: sourceStates.id,
        normalizedText: sourceStates.normalizedText,
        rightsBasis: sourceStates.rightsBasis,
        sensitivityLevel: sourceStates.sensitivityLevel,
        stateAdmittedAt: sourceStates.admittedAt,
      })
      .from(sources)
      .innerJoin(sourceStates, eq(sourceStates.sourceId, sources.id))
      .where(eq(sources.id, sourceId))
      .orderBy(asc(sourceStates.admittedAt))
      .limit(1);
    const row = rows[0];
    if (!row) return undefined;
    if (!isRightsBasis(row.rightsBasis) || !isSensitivityLevel(row.sensitivityLevel)) {
      throw new SourceAdmissionError("Persisted Source handling policy is invalid");
    }
    return {
      id: row.id,
      title: row.title,
      admittedAt: row.admittedAt.toISOString(),
      state: {
        id: row.stateId,
        normalizedText: row.normalizedText,
        rightsBasis: row.rightsBasis,
        sensitivityLevel: row.sensitivityLevel,
        admittedAt: row.stateAdmittedAt.toISOString(),
      },
    };
  }

  async readAuthoritativeText(sourceId: string): Promise<string | undefined> {
    const [state] = await this.db
      .select({ authoritativeText: sourceStates.authoritativeText })
      .from(sourceStates)
      .where(eq(sourceStates.sourceId, sourceId))
      .orderBy(asc(sourceStates.admittedAt))
      .limit(1);
    return state?.authoritativeText;
  }
}

function normalizeText(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.trim().replace(/[ \t]+/g, " "))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function isRightsBasis(value: unknown): value is RightsBasis {
  return typeof value === "string" && rightsBases.includes(value as RightsBasis);
}

export function isSensitivityLevel(value: unknown): value is SensitivityLevel {
  return typeof value === "string" && sensitivityLevels.includes(value as SensitivityLevel);
}
