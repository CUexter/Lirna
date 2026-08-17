import { auth } from "@lirna/auth";
import type { Context as HonoContext } from "hono";

import type { SepAdmissionOperations } from "./sep-admission/sep-admission";
import { sepAdmissionOperations } from "./sep-admission/sep-admission-store";

export type CreateContextOptions = {
  context: HonoContext;
  sepAdmissions?: SepAdmissionOperations;
};

export async function createContext({
  context,
  sepAdmissions,
}: CreateContextOptions) {
  const session = await auth.api.getSession({
    headers: context.req.raw.headers,
  });
  return {
    auth: null,
    session,
    sepAdmissions: sepAdmissions ?? sepAdmissionOperations,
  };
}

export type Context = Awaited<ReturnType<typeof createContext>>;
