import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { resolve, sep } from "node:path";

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
