import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { basename, resolve } from "node:path";

export function safeProcess(input: string) {
  execFile("git", ["show", input]);
}

export function safeSql(
  database: { query(statement: string, values: string[]): unknown },
  input: string,
) {
  return database.query("select * from sources where id = $1", [input]);
}

export function safePath(base: string, req: { query: { path: string } }) {
  const filename = basename(req.query.path);
  if (filename === "." || filename === "..") throw new Error("invalid path");
  return resolve(base, filename);
}

export function safeCrypto(input: string) {
  return createHash("sha256").update(input).digest("hex");
}

export function safeHtml(element: HTMLElement, input: string) {
  element.textContent = input;
}
