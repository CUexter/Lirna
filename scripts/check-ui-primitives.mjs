import { readdir, readFile } from "node:fs/promises";
import { extname, join, relative } from "node:path";

const root = new URL("../client/src/", import.meta.url);
const nativeControl = /<(button|dialog|input|optgroup|option|select|textarea)\b/g;
const primitiveImplementations = new Map([
  ["components/ui/button.tsx", new Set(["button"])],
  ["components/ui/checkbox.tsx", new Set(["input"])],
  ["components/ui/dialog.tsx", new Set(["dialog"])],
  ["components/ui/input.tsx", new Set(["input"])],
  ["components/ui/native-select.tsx", new Set(["optgroup", "option", "select"])],
  ["components/ui/textarea.tsx", new Set(["textarea"])],
]);
const violations = [];

async function visit(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      await visit(path);
      continue;
    }
    if (extname(path) !== ".tsx") continue;
    const source = await readFile(path, "utf8");
    const sourcePath = relative(root.pathname, path);
    const allowedControls = primitiveImplementations.get(sourcePath);
    for (const match of source.matchAll(nativeControl)) {
      if (allowedControls?.has(match[1])) continue;
      const line = source.slice(0, match.index).split("\n").length;
      violations.push(`${sourcePath}:${line} uses native <${match[1]}>`);
    }
  }
}

await visit(root.pathname);

if (violations.length) {
  console.error(
    [
      "Use a locally owned component from client/src/components/ui instead of native controls:",
      ...violations.map((violation) => `  ${violation}`),
    ].join("\n"),
  );
  process.exitCode = 1;
}
