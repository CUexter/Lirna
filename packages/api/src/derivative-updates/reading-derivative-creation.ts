import { randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import type { SepReadingContract } from "../sep-admission/sep-reading-contract";
import { sepReadingDerivativeKind } from "../sep-admission/sep-reading-contract";
import type {
  DerivativeValidation,
  ReadingDerivativeCandidate,
} from "./derivative-update-contract";
import { validateReadingCandidate } from "./derivative-validation";

const parser = { id: "parse5", version: "7.3.0" } as const;
const renderer = { id: "lirna-reading-react", version: "1" } as const;
type ResourceHash =
  ReadingDerivativeCandidate["generation"]["inputResourceHashes"][number];

export interface CreatedReadingDerivative {
  id: string;
  sourceStateId: string;
  kind: typeof sepReadingDerivativeKind;
  previousDerivativeId?: string;
  valid: boolean;
  generation: ReadingDerivativeCandidate["generation"];
  payload: unknown;
  validation: DerivativeValidation;
}

export function createReadingDerivative(input: {
  sourceStateId: string;
  generationVersion: number;
  previousDerivativeId?: string;
  inputResourceHashes: ResourceHash[];
  createPayload: () => SepReadingContract;
}): CreatedReadingDerivative {
  const inputResourceHashes = sortedHashes(input.inputResourceHashes);
  let payload: unknown;
  try {
    const createdPayload = input.createPayload();
    if (
      !isDeepStrictEqual(
        sortedHashes(createdPayload.provenance.inputResourceHashes),
        inputResourceHashes,
      )
    )
      throw new Error(
        "Reading Derivative provenance does not match generation evidence",
      );
    payload = createdPayload;
  } catch (error) {
    payload = { generationError: generationError(error) };
  }
  const validation = validateReadingCandidate(payload);
  return {
    id: randomUUID(),
    sourceStateId: input.sourceStateId,
    kind: sepReadingDerivativeKind,
    ...(input.previousDerivativeId
      ? { previousDerivativeId: input.previousDerivativeId }
      : {}),
    valid: validation.status === "valid",
    generation: {
      version: input.generationVersion,
      parser,
      renderer,
      inputResourceHashes,
    },
    payload,
    validation,
  };
}

function sortedHashes(hashes: ResourceHash[]) {
  return hashes.toSorted((left, right) =>
    left.identity.localeCompare(right.identity),
  );
}

function generationError(error: unknown) {
  return error instanceof Error ? error.message : "Unknown generation error";
}
