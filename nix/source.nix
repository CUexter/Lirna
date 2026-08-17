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
  outputPaths = builtins.fromJSON (builtins.readFile ../config/nix-output-paths.json);
in
{
  server = mkSource outputPaths.server;

  desktop = mkSource outputPaths.desktop;
}
