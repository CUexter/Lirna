{ lib }:

{
  src = lib.cleanSourceWith {
    src = ../.;
    filter = path: type:
      let
        name = baseNameOf path;
      in
      !(type == "directory" && builtins.elem name [
        ".codegraph"
        ".direnv"
        ".git"
        "coverage"
        "dist"
        "lirna-legacy"
        "node_modules"
        "playwright-report"
        "prototype"
        "test-results"
      ]);
  };
}
