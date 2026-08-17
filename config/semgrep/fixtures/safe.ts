import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve, sep } from "node:path";

import { resolveInsideRoot } from "#path-safety";

declare const context: {
  req: { query(name: string): string };
};
declare const document: {
  body: { textContent: string };
};

execFile("git", ["status", "--short"]);

const root = resolve("uploads");
const requestedPath = resolve(root, context.req.query("path"));
if (!requestedPath.startsWith(`${root}${sep}`)) {
  throw new Error("Path escapes upload root");
}

createHash("sha256");
document.body.textContent = context.req.query("message");

await readFile(resolveInsideRoot(root, context.req.query("safe-path")));
