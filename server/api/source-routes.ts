import type { Context, Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import {
  isRightsBasis,
  isSensitivityLevel,
  SourceAdmissionError,
} from "../sources/source-library.js";
import type { ApiDependencies } from "./api-contracts.js";
import { InvalidJsonRequestError, readJson } from "./api-contracts.js";

const sourceIdPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const maximumTextPublicationBytes = 100 * 1024 * 1024;

export function registerSourceRoutes(app: Hono, dependencies: ApiDependencies): void {
  if (!dependencies.sources) return;
  app.use(
    "/api/sources",
    bodyLimit({
      maxSize: maximumTextPublicationBytes,
      onError: (c) => c.json({ error: "Text publication is too large" }, 413),
    }),
  );
  app.post("/api/sources", (c) => admitSource(c, dependencies));
  app.get("/api/sources/:id", async (c) => {
    if (dependencies.identifyActor?.(c) !== "human") {
      return c.json({ error: "Source reading requires Nathan's human credential" }, 403);
    }
    const id = c.req.param("id");
    if (!sourceIdPattern.test(id)) return c.json({ error: "Invalid Source id" }, 400);
    const source = await dependencies.sources!.read(id);
    if (!source) return c.json({ error: "Source not found" }, 404);
    return c.json(source, 200);
  });
  app.get("/api/sources/:id/evidence", async (c) => {
    if (dependencies.identifyActor?.(c) !== "human") {
      return c.json({ error: "Source reading requires Nathan's human credential" }, 403);
    }
    const id = c.req.param("id");
    if (!sourceIdPattern.test(id)) return c.json({ error: "Invalid Source id" }, 400);
    const authoritativeText = await dependencies.sources!.readAuthoritativeText(id);
    if (authoritativeText === undefined) return c.json({ error: "Source not found" }, 404);
    return c.json({ authoritativeText }, 200);
  });
}

async function admitSource(c: Context, dependencies: ApiDependencies): Promise<Response> {
  if (dependencies.identifyActor?.(c) !== "human") {
    return c.json({ error: "Only an explicit human action can admit a Source" }, 403);
  }
  let body: Record<string, unknown>;
  try {
    body = await readJson(c, maximumTextPublicationBytes);
  } catch (error) {
    if (error instanceof InvalidJsonRequestError) {
      return c.json({ error: error.message }, 400);
    }
    throw error;
  }
  if (
    typeof body.title !== "string" ||
    body.title.length > 300 ||
    typeof body.text !== "string" ||
    !isRightsBasis(body.rightsBasis) ||
    !isSensitivityLevel(body.sensitivityLevel)
  ) {
    return c.json({ error: "Invalid Source admission request" }, 400);
  }
  try {
    const source = await dependencies.sources!.admitText({
      title: body.title,
      text: body.text,
      rightsBasis: body.rightsBasis,
      sensitivityLevel: body.sensitivityLevel,
    });
    return c.json(source, 201);
  } catch (error) {
    if (error instanceof SourceAdmissionError) {
      return c.json({ error: error.message }, 422);
    }
    throw error;
  }
}
