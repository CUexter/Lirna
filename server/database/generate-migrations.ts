import { spawn } from "node:child_process";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

const root = process.cwd();
const temporaryRoot = await mkdtemp(join(root, ".drizzle-schema-"));

try {
  await cp(join(root, "server"), join(temporaryRoot, "server"), { recursive: true });
  const schemaFiles = [
    "server/operations/schema.ts",
    "server/domain/schema.ts",
    "server/artifacts/schema.ts",
    "server/workflows/schema.ts",
    "server/sources/schema.ts",
  ];
  for (const file of schemaFiles) {
    const path = join(temporaryRoot, file);
    const source = await readFile(path, "utf8");
    await writeFile(path, source.replaceAll(/(from\s+["'][^"']+)\.js(["'])/g, "$1.ts$2"));
  }
  const config = join(temporaryRoot, "drizzle.config.ts");
  await writeFile(
    config,
    `
    import { defineConfig } from ${JSON.stringify(join(root, "node_modules/drizzle-kit/index.mjs"))};
    export default defineConfig({ dialect: "postgresql", schema: ${JSON.stringify(schemaFiles.map((file) => join(temporaryRoot, file)))}, out: "./drizzle" });
  `,
  );
  await new Promise<void>((resolve, reject) => {
    const child = spawn(
      join(root, "node_modules/.bin/drizzle-kit"),
      ["generate", "--config", config],
      { stdio: "inherit" },
    );
    child.once("exit", (code) =>
      code === 0 ? resolve() : reject(new Error(`drizzle-kit exited ${code}`)),
    );
  });
  console.log(
    "Review generated SQL and preserve custom trigger statements from the committed baseline.",
  );
} finally {
  await rm(temporaryRoot, { recursive: true, force: true });
}
