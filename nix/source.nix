{ lib }:

{
  src = lib.cleanSourceWith {
    src = ../.;
    filter = path: type:
      let
        name = baseNameOf path;
      in
      !(type == "directory" && builtins.elem name [
        ".direnv"
        ".git"
        "coverage"
        "dist"
        "metrics"
        "node_modules"
        "playwright-report"
        "prototype"
        "test-results"
      ]);
  };

  npmDepsHash = "sha256-7L5QaiDCmMQG65AlvyOT0QQOtlf87FCEIqulhrl/JoQ=";
}
