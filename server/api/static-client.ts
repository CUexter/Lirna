import { readFile } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";

const contentTypes: Record<string, string> = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8", ".webmanifest": "application/manifest+json; charset=utf-8",
  ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon",
  ".woff2": "font/woff2", ".map": "application/json; charset=utf-8",
};

export async function serveClient(pathname: string, clientRoot?: string): Promise<Response> {
  const root = resolve(clientRoot ?? resolve("dist/client"));
  const requested = resolve(root, `.${pathname}`);
  const isAsset = pathname !== "/" &&
    (requested === root || requested.startsWith(root + sep)) && Boolean(extname(requested));
  if (isAsset) {
    const asset = await readFile(requested).catch(() => undefined);
    if (!asset) return jsonResponse({ error: "Not found" }, 404);
    return new Response(new Uint8Array(asset), {
      status: 200,
      headers: { "content-type": contentTypes[extname(requested)] ?? "application/octet-stream" },
    });
  }
  const shell = await readFile(resolve(root, "index.html"));
  return new Response(new Uint8Array(shell), {
    status: 200,
    headers: { "content-type": contentTypes[".html"]! },
  });
}

function jsonResponse(value: object, status: number): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}
