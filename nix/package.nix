{ lib, bun2nix }:

let
  source = import ./source.nix { inherit lib; };
in
bun2nix.mkDerivation {
  pname = "lirna";
  version = "0.1.0";
  inherit (source) src;

  bunDeps = bun2nix.fetchBunDeps {
    bunNix = ./bun.nix;
  };

  module = "apps/server/src/index.ts";

  meta = {
    description = "Personal research and learning application server";
    mainProgram = "lirna";
    platforms = [ "x86_64-linux" ];
  };
}
