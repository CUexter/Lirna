{
  description = "Lirna development environments";

  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";

  outputs = { nixpkgs, ... }:
    let
      system = "x86_64-linux";
      pkgs = import nixpkgs { inherit system; };
      lirna = pkgs.callPackage ./nix/package.nix { };
      lirnaModule = import ./nix/module.nix { defaultPackage = lirna; };
      playwrightBrowsers = pkgs.playwright-driver.browsers;
      commonPackages = with pkgs; [
        nodejs_22
        postgresql_16
        docker
        docker-compose
      ];
      commonShell = {
        packages = commonPackages;
        PLAYWRIGHT_BROWSERS_PATH = "${playwrightBrowsers}";
        PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS = "true";
      };
    in
    {
      packages.${system} = {
        default = lirna;
        server = lirna;
        nixos-test = import ./nix/test.nix {
          inherit pkgs;
          module = lirnaModule;
          package = lirna;
        };
      };

      apps.${system} = {
        api = { type = "app"; program = "${lirna}/bin/lirna-api"; };
        worker = { type = "app"; program = "${lirna}/bin/lirna-worker"; };
        migrate = { type = "app"; program = "${lirna}/bin/lirna-migrate"; };
      };

      nixosModules.default = lirnaModule;

      checks.${system} = {
        package = lirna;
        quality = (pkgs.buildNpmPackage.override { nodejs = pkgs.nodejs_22; }) {
          pname = "lirna-quality";
          version = "0.1.0";
          src = pkgs.lib.cleanSourceWith {
            src = ./.;
            filter = path: type:
              let name = baseNameOf path; in
              !(type == "directory" && builtins.elem name [
                ".direnv" ".git" "coverage" "dist" "metrics" "node_modules"
                "playwright-report" "prototype" "test-results"
              ]);
          };
          npmDepsHash = "sha256-7L5QaiDCmMQG65AlvyOT0QQOtlf87FCEIqulhrl/JoQ=";
          npmFlags = [ "--include=optional" ];
          nativeBuildInputs = [ pkgs.autoPatchelfHook ];
          buildInputs = [ pkgs.stdenv.cc.cc.lib ];
          dontConfigure = true;
          buildPhase = ''
            runHook preBuild
            autoPatchelf node_modules/@biomejs/cli-linux-x64/biome
            npm run check
            runHook postBuild
          '';
          installPhase = ''
            touch $out
          '';
          dontNpmInstall = true;
        };
        module = (nixpkgs.lib.nixosSystem {
          inherit system;
          modules = [
            lirnaModule
            {
              boot.isContainer = true;
              services.lirna = {
                enable = true;
                package = lirna;
                environmentFile = "/run/secrets/lirna.env";
              };
              system.stateVersion = "26.05";
            }
          ];
        }).config.system.build.toplevel;
      };

      devShells.${system} = {
        default = pkgs.mkShell commonShell;

        desktop = pkgs.mkShell (commonShell // {
          packages = commonPackages ++ (with pkgs; [
            cargo
            rustc
            pkg-config
            wrapGAppsHook4
            webkitgtk_4_1
          ]);
        });
      };
    };
}
