import { readdir, readFile } from "node:fs/promises";
import { dirname, extname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

export const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const workspaceDirectories = ["apps", "packages"];
const sourceExtensions = new Set([".ts", ".tsx", ".js", ".jsx"]);
const allowedEdges = new Map([
  ["web", new Set(["@lirna/api", "@lirna/env", "@lirna/ui"])],
  ["server", new Set(["@lirna/api", "@lirna/auth", "@lirna/db", "@lirna/env"])],
  ["docs", new Set()],
  ["@lirna/ui", new Set()],
  ["@lirna/env", new Set()],
  ["@lirna/db", new Set(["@lirna/env"])],
  ["@lirna/auth", new Set(["@lirna/db", "@lirna/env"])],
  ["@lirna/api", new Set(["@lirna/auth", "@lirna/db", "@lirna/env"])],
  ["@lirna/config", new Set()],
]);
const primitiveControls = new Map([
  ["packages/ui/src/components/button.tsx", new Set(["button"])],
  ["packages/ui/src/components/checkbox.tsx", new Set(["input"])],
  ["packages/ui/src/components/dialog.tsx", new Set(["dialog"])],
  ["packages/ui/src/components/input.tsx", new Set(["input"])],
  ["packages/ui/src/components/native-select.tsx", new Set(["optgroup", "option", "select"])],
  ["packages/ui/src/components/textarea.tsx", new Set(["textarea"])],
]);

function workspacePackageName(packageJson, directory) {
  return packageJson.name ?? directory.split("/").pop();
}

function declaredDependencies(packageJson) {
  return new Set([
    ...Object.keys(packageJson.dependencies ?? {}),
    ...Object.keys(packageJson.devDependencies ?? {}),
    ...Object.keys(packageJson.peerDependencies ?? {}),
  ]);
}

export function parseSource(sourcePath, source) {
  const sourceFile = ts.createSourceFile(
    sourcePath,
    source,
    ts.ScriptTarget.Latest,
    true,
    [".tsx", ".jsx"].includes(extname(sourcePath))
      ? ts.ScriptKind.TSX
      : ts.ScriptKind.TS,
  );
  const imports = [];
  const nativeControls = [];
  let createsRoute = false;
  const routeCreators = new Set(["createFileRoute", "createRootRoute", "createRootRouteWithContext", "createRoute"]);
  const nativeControl = /^(button|dialog|input|optgroup|option|select|textarea)$/;

  function visit(node) {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      imports.push(node.moduleSpecifier.text);
    }
    if (ts.isCallExpression(node)) {
      if (node.expression.kind === ts.SyntaxKind.ImportKeyword && node.arguments[0] && ts.isStringLiteral(node.arguments[0])) {
        imports.push(node.arguments[0].text);
      }
      if (ts.isIdentifier(node.expression) && (routeCreators.has(node.expression.text) || node.expression.text.startsWith("createFileRoute"))) createsRoute = true;
    }
    if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) {
      const tag = ts.isJsxElement(node)
        ? node.openingElement.tagName
        : node.tagName;
      if (ts.isIdentifier(tag) && nativeControl.test(tag.text)) nativeControls.push(tag.text);
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  return { imports, createsRoute, nativeControls };
}

export function findCycles(workspaces) {
  const cycles = [];
  const visiting = new Set();
  const visited = new Set();
  const path = [];
  const graph = new Map(workspaces.map((workspace) => [workspace.name, workspace.dependencies]));

  function visit(name) {
    if (visiting.has(name)) {
      const start = path.indexOf(name);
      cycles.push([...path.slice(start), name]);
      return;
    }
    if (visited.has(name)) return;
    visiting.add(name);
    path.push(name);
    for (const dependency of graph.get(name) ?? []) if (graph.has(dependency)) visit(dependency);
    path.pop();
    visiting.delete(name);
    visited.add(name);
  }
  for (const workspace of workspaces) visit(workspace.name);
  return cycles;
}

function exportKeys(exports) {
  if (!exports || typeof exports !== "object") return [];
  return Object.keys(exports).filter((key) => key.startsWith("."));
}

function exportTarget(exports, subpath) {
  for (const key of exportKeys(exports)) {
    if (key === subpath) return exports[key];
    if (key.endsWith("*")) {
      const prefix = key.slice(0, -1);
      if (subpath.startsWith(prefix)) {
        const target = exports[key];
        if (typeof target === "string") return target.replace("*", subpath.slice(prefix.length));
        return target;
      }
    }
  }
  return undefined;
}

function resolveExportTarget(target) {
  if (typeof target === "string") return target;
  if (!target || typeof target !== "object") return undefined;
  return target.default ?? target.import ?? target.require;
}

function hasExport(workspace, subpath) {
  const target = resolveExportTarget(exportTarget(workspace.exports, subpath));
  return target !== undefined;
}

function workspaceForPath(workspaces, path) {
  const normalizedPath = path.startsWith("/") ? relative(projectRoot, path) : path;
  return workspaces.find((workspace) => normalizedPath === workspace.root || normalizedPath.startsWith(`${workspace.root}/`));
}

function packageImport(specifier, workspaces) {
  return workspaces
    .filter((workspace) => specifier === workspace.name || specifier.startsWith(`${workspace.name}/`))
    .sort((left, right) => right.name.length - left.name.length)[0];
}

export function evaluatePolicy({ workspaces, files }) {
  const violations = [];
  const workspaceMap = new Map(workspaces.map((workspace) => [workspace.name, workspace]));
  const cycles = findCycles(workspaces);
  for (const cycle of cycles) violations.push(`workspace dependency cycle: ${cycle.join(" -> ")}`);
  for (const workspace of workspaces) {
    for (const dependency of workspace.dependencies) {
      if (workspaceMap.has(dependency) && dependency !== "@lirna/config" && !(allowedEdges.get(workspace.name) ?? new Set()).has(dependency)) {
        violations.push(`${workspace.name} has forbidden workspace edge ${workspace.name} -> ${dependency}`);
      }
    }
  }

  for (const file of files) {
    const owner = workspaceForPath(workspaces, file.path);
    if (!owner) continue;
    const routeFile = owner.name === "web" && file.path.startsWith("apps/web/src/routes/");
    if (routeFile && !file.path.endsWith("routeTree.gen.ts") && !file.createsRoute) {
      violations.push(`${file.path} is under apps/web/src/routes but does not create a TanStack Router route`);
    }
    if (file.createsRoute && owner.name === "web" && !routeFile) {
      violations.push(`${file.path} creates a TanStack Router route outside apps/web/src/routes`);
    }
    for (const control of file.nativeControls ?? []) {
      const allowed = primitiveControls.get(file.path)?.has(control);
      if (!allowed) violations.push(`${file.path} uses native <${control}>; import an owned UI primitive instead`);
    }
    for (const specifier of file.imports) {
      const dependency = packageImport(specifier, workspaces);
      if (dependency) {
        const subpath = specifier === dependency.name ? "." : `.${specifier.slice(dependency.name.length)}`;
        if (!hasExport(dependency, subpath)) {
          violations.push(`${file.path} imports undeclared ${specifier}; ${dependency.name} does not export ${subpath}`);
        }
        if (dependency.name !== owner.name) {
          if (!owner.dependencies.has(dependency.name)) violations.push(`${file.path} imports undeclared workspace dependency ${dependency.name}`);
          if (!(allowedEdges.get(owner.name) ?? new Set()).has(dependency.name)) violations.push(`${file.path} has forbidden workspace edge ${owner.name} -> ${dependency.name}`);
        }
        if (owner.name === "web" && specifier === "@lirna/env/server") violations.push(`${file.path} imports the server environment surface`);
        continue;
      }
      if (!specifier.startsWith(".")) continue;
      const target = resolve(dirname(file.path), specifier);
      const targetOwner = workspaceForPath(workspaces, target);
      if (targetOwner && targetOwner.name !== owner.name) violations.push(`${file.path} crosses workspace boundary through relative import ${specifier}; use a package export`);
    }
  }
  return violations;
}

async function collectFiles(root, directory, files) {
  for (const entry of await readdir(resolve(root, directory), { withFileTypes: true })) {
    const path = `${directory}/${entry.name}`;
    if (entry.isDirectory()) {
      if (!entry.name.startsWith(".") && entry.name !== "node_modules" && entry.name !== "dist") await collectFiles(root, path, files);
      continue;
    }
    if (!sourceExtensions.has(extname(entry.name))) continue;
    const source = await readFile(resolve(root, path), "utf8");
    files.push({ path, ...parseSource(path, source) });
  }
}

async function loadWorkspaces(root) {
  const workspaces = [];
  for (const directory of workspaceDirectories) {
    for (const entry of await readdir(resolve(root, directory), { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const path = `${directory}/${entry.name}`;
      const packageJson = JSON.parse(await readFile(resolve(root, path, "package.json"), "utf8"));
      workspaces.push({
        name: workspacePackageName(packageJson, path),
        root: path,
        dependencies: declaredDependencies(packageJson),
        exports: packageJson.exports ?? {},
      });
    }
  }
  return workspaces;
}

export async function checkProject(root = projectRoot) {
  const workspaces = await loadWorkspaces(root);
  const files = [];
  for (const workspace of workspaces) await collectFiles(root, workspace.root, files);
  return evaluatePolicy({ workspaces, files });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const violations = await checkProject();
  if (violations.length) {
    console.error(`Architecture policy failed:\n${violations.map((violation) => `  ${violation}`).join("\n")}`);
    process.exitCode = 1;
  } else {
    console.log("Architecture policy passed.");
  }
}
