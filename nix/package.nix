{ lib, buildNpmPackage, makeWrapper, nodejs_22 }:

(buildNpmPackage.override { nodejs = nodejs_22; }) {
  pname = "lirna";
  version = "0.1.0";
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
  npmBuildScript = "build";
  nativeBuildInputs = [ makeWrapper ];

  installPhase = ''
    runHook preInstall

    npm prune --omit=dev
    mkdir -p $out/share/lirna $out/bin
    cp -r dist drizzle node_modules package.json $out/share/lirna/

    makeWrapper ${nodejs_22}/bin/node $out/bin/lirna-api \
      --chdir $out/share/lirna \
      --add-flags $out/share/lirna/dist/entrypoints/api.js
    makeWrapper ${nodejs_22}/bin/node $out/bin/lirna-worker \
      --chdir $out/share/lirna \
      --add-flags $out/share/lirna/dist/entrypoints/worker.js
    makeWrapper ${nodejs_22}/bin/node $out/bin/lirna-migrate \
      --chdir $out/share/lirna \
      --add-flags $out/share/lirna/dist/database/migrate.js

    runHook postInstall
  '';

  meta = {
    description = "Personal research and learning application";
    mainProgram = "lirna-api";
    platforms = [ "x86_64-linux" ];
  };
}
