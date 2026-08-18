{
  description = "Lirna development environment";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    bun2nix = {
      url = "github:nix-community/bun2nix?ref=2.1.2";
      inputs.nixpkgs.follows = "nixpkgs";
    };
    fallow = {
      url = "github:CUexter/fallow-flake-nix/c264d05962b1b2c1407e6b5147ef19f0f3daea3f";
      inputs.nixpkgs.follows = "nixpkgs";
    };
  };

  outputs = { nixpkgs, bun2nix, fallow, ... }:
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
      nixosTest = import ./nix/test.nix {
        inherit pkgs;
        module = lirnaModule;
        package = lirna;
      };
    in
    {
      packages.${system} = {
        default = lirna;
        server = lirna;
        desktop = lirnaDesktop;
        nixos-test = nixosTest;
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
        server = lirna;
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
        nixos-test = nixosTest;
      };

      devShells.${system}.default = pkgs.mkShell {
        PLAYWRIGHT_BROWSERS_PATH = pkgs.playwright-driver.browsers;
        PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD = "1";
        PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS = "true";
        NODE_USE_SYSTEM_CA = "1";

        packages = with pkgs; [
          bun
          cargo
          rustc
          rustfmt
          clippy
          fallow.packages.${system}.default
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
          playwright-driver.browsers
        ];
      };
    };
}
