import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { generateOpenApiDocument } from "../packages/api/src/orpc/openapi.ts";

const here = dirname(fileURLToPath(import.meta.url));
const snapshotPath = resolve(here, "..", "config", "openapi.json");

const spec = await generateOpenApiDocument();
const json = `${JSON.stringify(spec, null, 2)}\n`;

if (process.argv.includes("--check")) {
  if (!existsSync(snapshotPath)) {
    console.error(
      "config/openapi.json does not exist. Run `bun run openapi:generate` to create it.",
    );
    process.exit(1);
  }

  const existing = readFileSync(snapshotPath, "utf8");
  if (existing !== json) {
    console.error(
      "OpenAPI snapshot drift detected. The committed config/openapi.json does not match the spec generated from the live oRPC router.\nRun `bun run openapi:generate` and commit the result.",
    );
    process.exit(1);
  }

  console.log("OpenAPI snapshot is up to date.");
} else {
  writeFileSync(snapshotPath, json);
  console.log(`OpenAPI snapshot written to ${snapshotPath}`);
}
