import { auth } from "@lirna/auth";
import { db } from "@lirna/db";
import { env } from "@lirna/env/server";
import type { Context as HonoContext } from "hono";
import type { AnnotationOperations } from "./annotations/annotation-contract";
import { DrizzleAnnotationStore } from "./annotations/annotation-store";
import type { RequestObservation } from "./observation";
import type { ReadingPositionOperations } from "./reading-position/reading-position-contract";
import { DrizzleReadingPositionStore } from "./reading-position/reading-position-store";
import {
  createOpenRouterResearchAssistant,
  type ResearchAssistantOperations,
} from "./research-assistant/research-assistant";
import type { SepAdmissionOperations } from "./sep-admission/sep-admission";
import { sepAdmissionOperations } from "./sep-admission/sep-admission-store";
import type { SepAdmittedStateOperations } from "./sep-admission/sep-admitted-state";
import { sepAdmittedStateOperations } from "./sep-admission/sep-admitted-state-reader";

export type CreateContextOptions = {
  context: HonoContext;
  sepAdmissions?: SepAdmissionOperations;
  admittedSourceStates?: SepAdmittedStateOperations;
  annotations?: AnnotationOperations;
  readingPositions?: ReadingPositionOperations;
  researchAssistant?: ResearchAssistantOperations;
  observation?: RequestObservation;
  debugErrors?: boolean;
};

const annotationStore = new DrizzleAnnotationStore(db);
const readingPositionStore = new DrizzleReadingPositionStore(db);
const researchAssistant = env.OPENROUTER_API_KEY
  ? createOpenRouterResearchAssistant({
      apiKey: env.OPENROUTER_API_KEY,
      model: env.OPENROUTER_MODEL,
    })
  : undefined;

export async function createContext({
  context,
  sepAdmissions,
  admittedSourceStates,
  annotations,
  readingPositions,
  researchAssistant: researchAssistantOverride,
  observation,
  debugErrors,
}: CreateContextOptions) {
  const session = await auth.api.getSession({
    headers: context.req.raw.headers,
  });
  return {
    auth: null,
    session,
    sepAdmissions: sepAdmissions ?? sepAdmissionOperations,
    admittedSourceStates: admittedSourceStates ?? sepAdmittedStateOperations,
    annotations: annotations ?? annotationStore,
    readingPositions: readingPositions ?? readingPositionStore,
    ...((researchAssistantOverride ?? researchAssistant)
      ? { researchAssistant: researchAssistantOverride ?? researchAssistant }
      : {}),
    ...(observation ? { observation } : {}),
    ...(debugErrors === undefined ? {} : { debugErrors }),
  };
}

export type Context = Awaited<ReturnType<typeof createContext>>;
