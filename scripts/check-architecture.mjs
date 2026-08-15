import { readdir, readFile } from "node:fs/promises";
import { dirname, extname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const sourceRoots = ["client/src", "server", "shared"];
const advisoryLines = 400;
const maximumLines = 700;
const existingCaps = new Map([
  ["server/sources/sep-admission-library.ts", 1484],
  ["server/sources/sep-reading.ts", 1868],
  ["server/workflows/workflow-run-repository.ts", 799],
]);
const violations = [];
const hotspots = [];
const seenCaps = new Set();

function sourceArea(path) {
  if (path === "shared" || path.startsWith("shared/")) return "shared";
  if (path === "server" || path.startsWith("server/")) return "server";
  if (path === "client" || path.startsWith("client/")) return "client";
  return undefined;
}

export function importedArea(sourcePath, specifier) {
  let target;
  let aliasRoot;
  if (specifier === "@shared" || specifier.startsWith("@shared/")) {
    aliasRoot = resolve(projectRoot, "shared");
    target = resolve(aliasRoot, specifier.slice("@shared".length).replace(/^\//, ""));
  } else if (specifier === "@" || specifier.startsWith("@/")) {
    aliasRoot = resolve(projectRoot, "client/src");
    target = resolve(aliasRoot, specifier.slice(1).replace(/^\//, ""));
  } else if (specifier.startsWith(".")) {
    target = resolve(projectRoot, dirname(sourcePath), specifier);
  } else {
    return undefined;
  }
  if (aliasRoot && relative(aliasRoot, target).startsWith("..")) return "alias-escape";
  return sourceArea(relative(projectRoot, target));
}

export function moduleFacts(sourcePath, source) {
  const sourceFile = ts.createSourceFile(
    sourcePath,
    source,
    ts.ScriptTarget.Latest,
    true,
    extname(sourcePath) === ".tsx" ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const imports = [];
  let createsRoute = false;
  const routeCreators = new Set(["createFileRoute", "createRootRoute", "createRoute"]);
  const visit = (node) => {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      imports.push(node.moduleSpecifier.text);
    }
    if (ts.isCallExpression(node)) {
      if (
        node.expression.kind === ts.SyntaxKind.ImportKeyword &&
        node.arguments[0] &&
        ts.isStringLiteral(node.arguments[0])
      ) {
        imports.push(node.arguments[0].text);
      }
      if (ts.isIdentifier(node.expression) && routeCreators.has(node.expression.text)) {
        createsRoute = true;
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return { createsRoute, imports };
}

function lineCount(source) {
  if (!source) return 0;
  const lines = source.split(/\r?\n/).length;
  return source.endsWith("\n") ? lines - 1 : lines;
}

async function inspect(sourcePath) {
  const source = await readFile(resolve(projectRoot, sourcePath), "utf8");
  const lines = lineCount(source);
  const cap = existingCaps.get(sourcePath);
  if (cap !== undefined) {
    seenCaps.add(sourcePath);
    if (lines > cap) {
      violations.push(`${sourcePath} grew from its existing cap (${lines} > ${cap})`);
    } else if (lines <= maximumLines) {
      violations.push(`${sourcePath} no longer needs its architecture-check exception`);
    } else if (lines < cap) {
      violations.push(`${sourcePath} shrank; lower its existing cap from ${cap} to ${lines}`);
    }
  } else if (lines > maximumLines) {
    violations.push(`${sourcePath} exceeds the ${maximumLines}-line module ceiling (${lines})`);
  }
  if (lines > advisoryLines) hotspots.push(`${sourcePath} (${lines})`);
  const facts = moduleFacts(sourcePath, source);
  if (sourcePath.startsWith("client/src/routes/") && !facts.createsRoute) {
    violations.push(`${sourcePath} is under routes/ but does not create a TanStack Router route`);
  }

  const area = sourceArea(sourcePath);
  for (const specifier of facts.imports) {
    const target = importedArea(sourcePath, specifier);
    if (target === "alias-escape") {
      violations.push(`${sourcePath} escapes an import alias through ${specifier}`);
      continue;
    }
    if (area === "client" && target === "server") {
      violations.push(`${sourcePath} imports server-owned implementation through ${specifier}`);
    }
    if (area === "server" && target === "client") {
      violations.push(`${sourcePath} imports client-owned implementation through ${specifier}`);
    }
    if (area === "shared" && (target === "client" || target === "server")) {
      violations.push(`${sourcePath} makes shared contracts depend on ${target} implementation`);
    }
    if (area === "client" && target === "shared" && !specifier.startsWith("@shared/")) {
      violations.push(
        `${sourcePath} must import shared contracts through @shared, not ${specifier}`,
      );
    }
  }
}

async function visit(directory) {
  for (const entry of await readdir(resolve(projectRoot, directory), { withFileTypes: true })) {
    const sourcePath = `${directory}/${entry.name}`;
    if (entry.isDirectory()) {
      await visit(sourcePath);
      continue;
    }
    if (![".ts", ".tsx"].includes(extname(entry.name))) continue;
    await inspect(sourcePath);
  }
}

async function main() {
  for (const root of sourceRoots) await visit(root);
  for (const sourcePath of existingCaps.keys()) {
    if (!seenCaps.has(sourcePath))
      violations.push(`remove stale architecture-check cap for ${sourcePath}`);
  }

  if (hotspots.length) {
    console.log(
      `Architecture hotspots above ${advisoryLines} lines; apply the deletion test before splitting:\n${hotspots.map((path) => `  ${path}`).join("\n")}`,
    );
  }
  if (violations.length) {
    console.error(
      `Architecture checks failed:\n${violations.map((item) => `  ${item}`).join("\n")}`,
    );
    process.exitCode = 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
