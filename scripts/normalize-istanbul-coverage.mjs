import { readFile, writeFile } from "node:fs/promises";

const [inputPath, outputPath] = process.argv.slice(2);
if (!inputPath || !outputPath) {
  throw new Error("Usage: normalize-istanbul-coverage <input> <output>");
}

const coverage = JSON.parse(await readFile(inputPath, "utf8"));

function normalizeLocations(value) {
  if (Array.isArray(value)) {
    for (const item of value) normalizeLocations(item);
    return;
  }
  if (!value || typeof value !== "object") return;

  for (const [childKey, childValue] of Object.entries(value)) {
    if (
      (childKey === "line" || childKey === "column") &&
      typeof childValue === "number" &&
      childValue < 0
    ) {
      value[childKey] = 0;
    } else {
      normalizeLocations(childValue);
    }
  }
}

normalizeLocations(coverage);
await writeFile(outputPath, `${JSON.stringify(coverage)}\n`);
