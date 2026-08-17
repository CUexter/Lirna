{ lib }:

let
  root = ../.;
  rootString = toString root;
  mkSource = includedPaths:
    lib.cleanSourceWith {
      src = root;
      filter = path: _type:
        let
          pathString = toString path;
          relativePath = lib.removePrefix "${rootString}/" pathString;
          isIncluded = candidate:
            relativePath == candidate
            || lib.hasPrefix "${candidate}/" relativePath
            || lib.hasPrefix "${relativePath}/" candidate;
        in
        pathString == rootString
        || (baseNameOf path != ".env" && builtins.any isIncluded includedPaths);
    };
  workspaceFiles = [
    "bun.lock"
    "package.json"
    "tsconfig.json"
  ];
in
{
  server = mkSource (workspaceFiles ++ [
    "apps/server"
    "packages/api"
    "packages/auth"
    "packages/config"
    "packages/db"
    "packages/env"
  ]);

  desktop = mkSource (workspaceFiles ++ [
    "apps/web"
    "config/web-bundle-budget.json"
    "packages/api"
    "packages/auth"
    "packages/config"
    "packages/db"
    "packages/env"
    "packages/ui"
    "scripts/check-web-bundle.mjs"
    "scripts/path-safety.mjs"
  ]);
}
