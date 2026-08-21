import { readdir, readFile } from "node:fs/promises";
import { extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const sourceRoots = ["apps", "packages"];
const maximumProps = 8;
const violations = [];

function localTypes(sourceFile) {
  const declarations = new Map();
  for (const statement of sourceFile.statements) {
    if (
      (ts.isInterfaceDeclaration(statement) ||
        ts.isTypeAliasDeclaration(statement)) &&
      statement.name
    ) {
      declarations.set(statement.name.text, statement);
    }
  }
  return declarations;
}

function countTypeMembers(typeNode, declarations) {
  if (!typeNode) return undefined;
  if (ts.isParenthesizedTypeNode(typeNode)) {
    return countTypeMembers(typeNode.type, declarations);
  }
  if (ts.isTypeLiteralNode(typeNode)) return typeNode.members.length;
  if (ts.isTypeReferenceNode(typeNode) && ts.isIdentifier(typeNode.typeName)) {
    const declaration = declarations.get(typeNode.typeName.text);
    if (declaration && ts.isInterfaceDeclaration(declaration))
      return declaration.members.length;
    if (declaration && ts.isTypeAliasDeclaration(declaration)) {
      return countTypeMembers(declaration.type, declarations);
    }
  }
  if (ts.isIntersectionTypeNode(typeNode)) {
    const explicitCounts = typeNode.types
      .map((type) => countTypeMembers(type, declarations))
      .filter((count) => count !== undefined);
    return explicitCounts.length
      ? explicitCounts.reduce((sum, count) => sum + count, 0)
      : undefined;
  }
  return undefined;
}

function countProps(parameter, declarations) {
  if (!parameter) return undefined;
  if (ts.isObjectBindingPattern(parameter.name)) {
    return parameter.name.elements.filter((element) => !element.dotDotDotToken)
      .length;
  }
  return countTypeMembers(parameter.type, declarations);
}

function containsJsx(node) {
  let found = false;
  const visit = (child) => {
    if (found) return;
    if (
      ts.isJsxElement(child) ||
      ts.isJsxSelfClosingElement(child) ||
      ts.isJsxFragment(child)
    ) {
      found = true;
      return;
    }
    ts.forEachChild(child, visit);
  };
  visit(node);
  return found;
}

function componentFunction(initializer) {
  let candidate = initializer;
  while (ts.isParenthesizedExpression(candidate))
    candidate = candidate.expression;
  if (ts.isArrowFunction(candidate) || ts.isFunctionExpression(candidate))
    return candidate;
  if (ts.isCallExpression(candidate)) {
    return candidate.arguments.find(
      (argument) =>
        ts.isArrowFunction(argument) || ts.isFunctionExpression(argument),
    );
  }
  return undefined;
}

function inspect(sourcePath, source) {
  const sourceFile = ts.createSourceFile(
    sourcePath,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const declarations = localTypes(sourceFile);

  const check = (name, fn) => {
    if (!/^[A-Z]/.test(name) || !fn.body || !containsJsx(fn.body)) return;
    const count = countProps(fn.parameters[0], declarations);
    if (count === undefined || count <= maximumProps) return;
    const { line } = sourceFile.getLineAndCharacterOfPosition(
      fn.getStart(sourceFile),
    );
    violations.push(
      `${sourcePath}:${line + 1} ${name} has ${count} explicit props`,
    );
  };

  for (const statement of sourceFile.statements) {
    if (ts.isFunctionDeclaration(statement) && statement.name) {
      check(statement.name.text, statement);
      continue;
    }
    if (!ts.isVariableStatement(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (!ts.isIdentifier(declaration.name) || !declaration.initializer)
        continue;
      const fn = componentFunction(declaration.initializer);
      if (fn) check(declaration.name.text, fn);
    }
  }
}

async function visit(directory) {
  for (const entry of await readdir(resolve(projectRoot, directory), {
    withFileTypes: true,
  })) {
    if (
      entry.name === "node_modules" ||
      entry.name === "dist" ||
      entry.name.startsWith(".")
    ) {
      continue;
    }
    const sourcePath = `${directory}/${entry.name}`;
    if (entry.isDirectory()) {
      await visit(sourcePath);
      continue;
    }
    if (extname(entry.name) !== ".tsx") continue;
    inspect(
      sourcePath,
      await readFile(resolve(projectRoot, sourcePath), "utf8"),
    );
  }
}

for (const root of sourceRoots) await visit(root);

if (violations.length) {
  console.error(
    `React components may declare at most ${maximumProps} explicit props:\n${violations
      .map((violation) => `  ${violation}`)
      .join("\n")}`,
  );
  process.exitCode = 1;
} else {
  console.log(
    `React prop check passed (maximum ${maximumProps} explicit props).`,
  );
}
