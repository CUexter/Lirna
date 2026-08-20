import { os } from "@orpc/server";
import type { Context } from "../context";

const base = os.$context<Context>();

export const publicProcedure = base;
