import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApi, type ApiServer, type DomainContract } from "../../server/api/create-api.js";
import type { ArtifactStore } from "../../server/artifacts/file-artifact-store.js";
import type { OperationRepository } from "../../server/operations/operation-repository.js";
import type { WorkflowRunRepository } from "../../server/workflows/workflow-run-repository.js";

// The static client surface is served entirely from the built assets on disk and
// never touches the operation, artifact, domain, or workflow stores, so all are inert fakes.
const inertOperations = {} as unknown as OperationRepository;
const inertArtifacts = {} as unknown as ArtifactStore;
const inertDomain = {} as unknown as DomainContract;
const inertWorkflows = {} as unknown as WorkflowRunRepository;

const SHELL_HTML = "<!doctype html><title>Lirna shell</title>";
const ASSET_JS = "console.log('lirna');\n";

describe("static client serving", () => {
  let clientRoot: string;
  let outsideRoot: string;
  let api: ApiServer;
  let address: string;

  beforeAll(async () => {
    const workspace = await mkdtemp(join(tmpdir(), "lirna-client-"));
    clientRoot = join(workspace, "client");
    outsideRoot = workspace;
    await mkdir(join(clientRoot, "assets"), { recursive: true });
    await writeFile(join(clientRoot, "index.html"), SHELL_HTML);
    await writeFile(join(clientRoot, "assets", "app-abc123.js"), ASSET_JS);
    await writeFile(
      join(clientRoot, "manifest.webmanifest"),
      JSON.stringify({ name: "Lirna" }),
    );
    // A file that lives beside the client root, reachable only by escaping it.
    await writeFile(join(outsideRoot, "secret.txt"), "do not leak");

    api = createApi({
      operations: inertOperations,
      artifacts: inertArtifacts,
      domain: inertDomain,
      workflows: inertWorkflows,
      clientRoot,
    });
    address = await api.listen();
  });

  afterAll(async () => {
    await api.close();
    await rm(dirname(clientRoot), { recursive: true, force: true });
  });

  it("serves the SPA shell at the root as HTML", async () => {
    const response = await fetch(`${address}/`);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/html; charset=utf-8");
    expect(await response.text()).toBe(SHELL_HTML);
  });

  it("falls back to the shell for extensionless in-app routes", async () => {
    const response = await fetch(`${address}/paths/some/deep/route`);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/html; charset=utf-8");
    expect(await response.text()).toBe(SHELL_HTML);
  });

  it("serves a concrete asset with its mapped content type", async () => {
    const response = await fetch(`${address}/assets/app-abc123.js`);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe(
      "text/javascript; charset=utf-8",
    );
    expect(await response.text()).toBe(ASSET_JS);
  });

  it("maps the web manifest to its own content type", async () => {
    const response = await fetch(`${address}/manifest.webmanifest`);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe(
      "application/manifest+json; charset=utf-8",
    );
  });

  it("returns 404 for a named asset that does not exist", async () => {
    const response = await fetch(`${address}/assets/missing.js`);
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "Not found" });
  });

  it("never serves files outside the client root", async () => {
    // %2e%2e keeps the dot-segments literal past URL normalization, so this is a
    // genuine escape attempt rather than a path the client would normalize away.
    const response = await fetch(`${address}/%2e%2e/secret.txt`);
    expect(await response.text()).not.toContain("do not leak");
    expect([200, 404]).toContain(response.status);
  });
});
