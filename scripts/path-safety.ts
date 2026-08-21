import path from "node:path";

export function resolveInsideRoot(rootDirectory, candidate) {
  const resolved = path.resolve(rootDirectory, candidate);
  const relative = path.relative(rootDirectory, resolved);
  if (
    relative === ".." ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative)
  ) {
    throw new Error(`Path must remain inside ${rootDirectory}: ${candidate}`);
  }
  return resolved;
}
