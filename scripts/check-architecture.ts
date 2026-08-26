import { readdir, readFile } from "node:fs/promises";
import { basename, dirname, extname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

export const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const workspaceDirectories = ["apps", "packages"];
const sourceExtensions = new Set([".ts", ".tsx", ".js", ".jsx"]);
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
  const scrollCommands = [];
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
      if (
        ts.isPropertyAccessExpression(node.expression) &&
        ["scroll", "scrollBy", "scrollIntoView", "scrollTo"].includes(
          node.expression.name.text,
        )
      )
        scrollCommands.push(node.expression.name.text);
    }
    if (
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind >= ts.SyntaxKind.FirstAssignment &&
      node.operatorToken.kind <= ts.SyntaxKind.LastAssignment &&
      ts.isPropertyAccessExpression(node.left) &&
      node.left.name.text === "scrollTop"
    ) {
      scrollCommands.push("scrollTop assignment");
    }
    if (
      (ts.isPrefixUnaryExpression(node) || ts.isPostfixUnaryExpression(node)) &&
      [ts.SyntaxKind.PlusPlusToken, ts.SyntaxKind.MinusMinusToken].includes(
        node.operator,
      ) &&
      ts.isPropertyAccessExpression(node.operand) &&
      node.operand.name.text === "scrollTop"
    ) {
      scrollCommands.push("scrollTop assignment");
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
  return { imports, createsRoute, nativeControls, scrollCommands };
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

function isRouteSupportFile(path) {
  return basename(path).startsWith("-");
}

function isTestSource(path) {
  return (
    /\.(?:test|spec)\.[jt]sx?$/.test(path) ||
    /(?:^|\/)[^/]*-(?:tests|test-(?:fixture|fixtures|harness|scenarios|support))\.[jt]sx?$/.test(
      path,
    )
  );
}

function isRouteTestSource(path) {
  return (
    isTestSource(path) ||
    /^-.*(?:fixture|harness|scenarios?|tests?|support)(?:\.|-)/.test(
      basename(path),
    )
  );
}

export function evaluatePolicy({ workspaces, files }) {
  const violations = [];
  for (const file of files) {
    const owner = workspaceForPath(workspaces, file.path);
    if (!owner) continue;
    const testSource = isTestSource(file.path);
    const routeFile = owner.name === "web" && file.path.startsWith("apps/web/src/routes/");
    if (routeFile && isRouteTestSource(file.path)) {
      violations.push(
        `${file.path} is test source under apps/web/src/routes; place it beside the module that owns the behavior or under apps/web/tests/routes`,
      );
    }
    if (
      routeFile &&
      !file.path.endsWith("routeTree.gen.ts") &&
      !isRouteSupportFile(file.path) &&
      !file.createsRoute
    ) {
      violations.push(`${file.path} is under apps/web/src/routes but does not create a TanStack Router route`);
    }
    if (file.createsRoute && owner.name === "web" && !routeFile && !testSource) {
      violations.push(`${file.path} creates a TanStack Router route outside apps/web/src/routes`);
    }
    for (const control of file.nativeControls ?? []) {
      const allowed = primitiveControls.get(file.path)?.has(control);
      if (!(allowed || testSource))
        violations.push(`${file.path} uses native <${control}>; import an owned UI primitive instead`);
    }
    const readingAuthorityScope =
      file.path.startsWith("apps/web/src/") && !testSource;
    if (
      readingAuthorityScope &&
      file.path !==
        "apps/web/src/components/reading-workspace/reading-navigation.ts"
    ) {
      for (const command of file.scrollCommands ?? [])
        violations.push(
          `${file.path} uses ${command} outside ReadingNavigation`,
        );
    }
    for (const specifier of file.imports) {
      const dependency = packageImport(specifier, workspaces);
      if (!dependency) continue;
      if (owner.name === "web" && specifier === "@lirna/env/server") violations.push(`${file.path} imports the server environment surface`);
      if (
        owner.name === "web" &&
        dependency.name === "@lirna/api" &&
        specifier !== "@lirna/api/client" &&
        !specifier.startsWith("@lirna/api/client/")
      )
        violations.push(
          `${file.path} imports server-owned API implementation ${specifier}; use @lirna/api/client`,
        );
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
