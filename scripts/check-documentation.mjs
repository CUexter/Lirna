import { existsSync, readFileSync } from "node:fs";
import { readdir, readFile, stat } from "node:fs/promises";
import { dirname, extname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const defaultDocumentationRoots = [
  "README.md",
  "docs",
  "apps/docs/README.md",
  "apps/docs/src/content/docs",
];
const ignoredFiles = new Set(["AGENTS.md", "CLAUDE.md"]);
const repositoryPath =
  /`((?:apps|packages|docs|scripts|tests|nix|client|server|shared|config)\/[^`\s]+|package-lock\.json|\.githooks(?:\/[^`\s]+)?)`/g;
const markdownLink = /!?\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
const commandReference =
  /(?:(?:cd\s+([^`\n]+?)\s+&&)\s+)?\b(bun|npm) run ([A-Za-z0-9:_-]+)/g;
const nonBunCommandLine = /^\s*(?:npx|npm(?!\s+run\b)(?:\s+exec)?)\s+[^\n]+$/gm;

async function collectMarkdown(root, roots) {
  const files = [];
  async function visit(current) {
    const info = await stat(current);
    if (info.isFile()) {
      if (
        extname(current) === ".md" &&
        !ignoredFiles.has(current.split("/").pop())
      )
        files.push(relative(root, current));
      return;
    }
    for (const entry of await readdir(current, { withFileTypes: true })) {
      if (!entry.name.startsWith(".") && entry.name !== "node_modules")
        await visit(resolve(current, entry.name));
    }
  }
  for (const entryPath of roots)
    if (existsSync(resolve(root, entryPath)))
      await visit(resolve(root, entryPath));
  return files.sort();
}

function headingSlug(value) {
  return value
    .toLowerCase()
    .replace(/<[^>]+>/g, "")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");
}

function headings(source) {
  return new Set(
    [...source.matchAll(/^#{1,6}\s+(.+)$/gm)].map((match) =>
      headingSlug(match[1].replace(/\s+#*$/, "")),
    ),
  );
}

function targetExists(root, sourcePath, target) {
  const withoutFragment = target.split("#", 1)[0].split("?", 1)[0];
  if (!withoutFragment) return true;
  const path = resolve(
    dirname(resolve(root, sourcePath)),
    decodeURIComponent(withoutFragment),
  );
  return existsSync(path);
}

function fragmentExists(source, target) {
  const fragment = target.split("#")[1];
  return (
    !fragment ||
    headings(source).has(decodeURIComponent(fragment).toLowerCase())
  );
}

function pathCandidateExists(root, candidate) {
  if (
    candidate.endsWith(".env") ||
    candidate.includes("*") ||
    candidate.includes("/dist/")
  )
    return true;
  const path = resolve(root, candidate.replace(/[.,:;]+$/, ""));
  return existsSync(path);
}

function packageScripts(root, packageJsonPath) {
  const packageJson = JSON.parse(
    readFileSync(resolve(root, packageJsonPath), "utf8"),
  );
  return new Set(Object.keys(packageJson.scripts ?? {}));
}

function scriptsForDirectory(root, directory) {
  const packagePath = resolve(root, directory, "package.json");
  return existsSync(packagePath)
    ? new Set(
        Object.keys(
          JSON.parse(readFileSync(packagePath, "utf8")).scripts ?? {},
        ),
      )
    : new Set();
}

async function checkLinks(root, file, source) {
  const violations = [];
  for (const match of source.matchAll(markdownLink)) {
    const target = match[1];
    if (/^(?:[a-z]+:|\/\/)/i.test(target)) continue;
    const targetName = target.split("#", 1)[0].split("?", 1)[0];
    const targetPath = resolve(
      dirname(resolve(root, file)),
      decodeURIComponent(targetName),
    );
    const targetSource =
      !targetName || targetPath === resolve(root, file)
        ? source
        : extname(targetPath) === ".md" && existsSync(targetPath)
          ? await readFile(targetPath, "utf8")
          : "";
    if (
      !targetExists(root, file, target) ||
      !fragmentExists(targetSource, target)
    )
      violations.push(`${file}: broken internal link ${target}`);
  }
  return violations;
}

function checkCommands(root, file, source, scripts) {
  const violations = [];
  for (const match of source.matchAll(commandReference)) {
    const commandScripts = match[1]
      ? scriptsForDirectory(root, match[1].trim())
      : scripts;
    if (match[2] === "npm")
      violations.push(`${file}: non-Bun command ${match[0]}`);
    else if (!commandScripts.has(match[3]))
      violations.push(`${file}: missing root command ${match[0]}`);
  }
  for (const match of source.matchAll(nonBunCommandLine))
    violations.push(`${file}: non-Bun command ${match[0].trim()}`);
  return violations;
}

function checkPaths(root, file, source) {
  return [...source.matchAll(repositoryPath)]
    .filter((match) => !pathCandidateExists(root, match[1]))
    .map((match) => `${file}: obsolete repository path ${match[1]}`);
}

export async function checkDocumentation(root = projectRoot, options = {}) {
  const roots = options.documentationRoots ?? defaultDocumentationRoots;
  const files = options.files ?? (await collectMarkdown(root, roots));
  const scripts = packageScripts(
    root,
    options.packageJsonPath ?? "package.json",
  );
  const violations = [];

  for (const file of files) {
    const source = await readFile(resolve(root, file), "utf8");
    violations.push(...(await checkLinks(root, file, source)));
    violations.push(...checkCommands(root, file, source, scripts));
    violations.push(...checkPaths(root, file, source));
  }
  return violations;
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const violations = await checkDocumentation();
  if (violations.length) {
    console.error(
      `Documentation quality failed:\n${violations.map((violation) => `  ${violation}`).join("\n")}`,
    );
    process.exitCode = 1;
  } else {
    console.log("Documentation quality passed.");
  }
}
