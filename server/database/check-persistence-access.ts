import { readFile, readdir } from "node:fs/promises";
import { extname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const serverRoot = fileURLToPath(new URL("..", import.meta.url));

// The only server files permitted to touch the raw node-postgres driver. Every
// other application module must receive a Drizzle capability rather than
// constructing its own pool or issuing driver queries (#79, #80):
//  - the bootstrap boundary owns the single application pool and Drizzle client;
//  - this guard names the forbidden patterns as detection strings, so it must be
//    exempt from matching itself.
// Migrations live in drizzle/*.sql (not scanned) and migrate.ts drives them
// through the Drizzle migrator, so no further boundary is required here.
const bootstrapBoundary = "database/database.ts";
const guardFile = "database/check-persistence-access.ts";
const approvedBoundaries = new Set([bootstrapBoundary, guardFile]);

interface AccessRule {
  readonly pattern: RegExp;
  readonly message: string;
}

// Direct application driver access is anything that reaches past Drizzle: the
// node-postgres import, constructing a pool or client, or calling the driver's
// `.query(`/`.connect(` directly. HTTP query-string reads (`req.query(`,
// `c.req.query(`) are not driver queries and are explicitly excluded. Runtime
// DDL is likewise forbidden outside the migration boundary.
const rules: AccessRule[] = [
  {
    pattern: /(?:from ["']pg["']|import pg from ["']pg["'])/,
    message: "direct node-postgres import",
  },
  {
    pattern: /\bnew\s+(?:Pool|Client)\b/,
    message: "direct driver pool or client construction",
  },
  {
    pattern: /(?<!req)(?<!\.req)\.query\(/,
    message: "direct driver query call",
  },
  {
    pattern: /(?<!req)(?<!\.req)\.connect\(/,
    message: "direct driver connection call",
  },
  {
    pattern: /\b(?:CREATE|ALTER|DROP)\s+(?:TABLE|FUNCTION|TRIGGER|SCHEMA)\b/i,
    message: "runtime DDL",
  },
];

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
    if (approvedBoundaries.has(localPath)) continue;
    const source = await readFile(path, "utf8");
    for (const rule of rules) {
      if (rule.pattern.test(source)) {
        violations.push(`${localPath}: ${rule.message}`);
      }
    }
  }
}

await scan(serverRoot);
if (violations.length > 0) {
  throw new Error(`Exclusive Drizzle access violations:\n${violations.join("\n")}`);
}
