import { exec, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

declare const context: {
  req: { query(name: string): string };
};
declare const sql: {
  raw(query: string): unknown;
};
declare const document: {
  body: { innerHTML: string };
};

const command = context.req.query("command");
exec(command);

const search = context.req.query("search");
sql.raw(`select * from notes where title = '${search}'`);

spawn("sh", ["-c", command], { shell: true });

const path = context.req.query("path");
await readFile(path);

createHash("sha1");

const html = context.req.query("html");
document.body.innerHTML = html;
