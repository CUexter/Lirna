{
  description = "Lirna rewrite development environment";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    bun2nix = {
      url = "github:nix-community/bun2nix?ref=2.1.2";
      inputs.nixpkgs.follows = "nixpkgs";
    };
  };

  outputs = { nixpkgs, bun2nix, ... }:
    let
      system = "x86_64-linux";
      pkgs = import nixpkgs { inherit system; };
      lirna = pkgs.callPackage ./nix/package.nix {
        bun2nix = bun2nix.packages.${system}.default;
      };
      lirnaDesktop = pkgs.callPackage ./nix/tauri-package.nix {
        bun2nix = bun2nix.packages.${system}.default;
      };
      lirnaModule = import ./nix/module.nix { defaultPackage = lirna; };
    in
    {
      packages.${system} = {
        default = lirna;
        server = lirna;
        desktop = lirnaDesktop;
        nixos-test = import ./nix/test.nix {
          inherit pkgs;
          module = lirnaModule;
          package = lirna;
        };
      };

      apps.${system} = {
        default = {
          type = "app";
          program = "${lirna}/bin/lirna";
        };
        desktop = {
          type = "app";
          program = "${lirnaDesktop}/bin/app";
        };
      };

      nixosModules.default = lirnaModule;

      checks.${system} = {
        package = lirna;
        desktop = lirnaDesktop;
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

      devShells.${system}.default = pkgs.mkShell {
        packages = with pkgs; [
          bun
          cargo
          rustc
          rustfmt
          clippy
          pkg-config
          wrapGAppsHook4
          gtk3
          webkitgtk_4_1
          libsoup_3
          openssl
          librsvg
          postgresql_16
          docker
          docker-compose
          gitleaks
          semgrep
          trivy
        ];
      };
    };
}
