import { auth } from "@lirna/auth";
import { db } from "@lirna/db";
import type { Context as HonoContext } from "hono";
import type { AnnotationOperations } from "./annotations/annotation-contract";
import { DrizzleAnnotationStore } from "./annotations/annotation-store";
import type { SepAdmissionOperations } from "./sep-admission/sep-admission";
import { sepAdmissionOperations } from "./sep-admission/sep-admission-store";
import type { SepAdmittedStateOperations } from "./sep-admission/sep-admitted-state";
import { sepAdmittedStateOperations } from "./sep-admission/sep-admitted-state-reader";

export type CreateContextOptions = {
  context: HonoContext;
  sepAdmissions?: SepAdmissionOperations;
  admittedSourceStates?: SepAdmittedStateOperations;
  annotations?: AnnotationOperations;
};

const annotationStore = new DrizzleAnnotationStore(db);

export async function createContext({
  context,
  sepAdmissions,
  admittedSourceStates,
  annotations,
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
  };
}

export type Context = Awaited<ReturnType<typeof createContext>>;
