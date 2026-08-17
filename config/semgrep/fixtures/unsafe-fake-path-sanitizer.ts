import { readFile } from "node:fs/promises";

declare const context: {
  req: { query(name: string): string };
};

function resolveInsideRoot(_root: string, candidate: string) {
  return candidate;
}

const requestedPath = resolveInsideRoot(
  "uploads",
  context.req.query("path"),
);
await readFile(requestedPath);
