import { readFile, readdir } from "node:fs/promises";
import { extname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const serverRoot = fileURLToPath(new URL("..", import.meta.url));
const allowedDriverFile = "database/database.ts";
const violations: string[] = [];

async function scan(directory: string): Promise<void> {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      await scan(path);
      continue;
    }
    if (extname(path) !== ".ts") continue;
    const localPath = relative(serverRoot, path);
    const source = await readFile(path, "utf8");
    if (localPath !== allowedDriverFile && /(?:from ["']pg["']|import pg from ["']pg["'])/.test(source)) {
      violations.push(`${localPath}: direct node-postgres import`);
    }
    if (localPath !== allowedDriverFile && /\b(?:CREATE|ALTER|DROP)\s+(?:TABLE|FUNCTION|TRIGGER|SCHEMA)\b/i.test(source)) {
      violations.push(`${localPath}: runtime DDL`);
    }
  }
}

await scan(serverRoot);
if (violations.length > 0) {
  throw new Error(`Exclusive Drizzle access violations:\n${violations.join("\n")}`);
}
