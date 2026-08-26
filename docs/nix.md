# Nix

Lirna's Nix configuration provides a development shell, reproducible server and
desktop packages, and a NixOS service module. It currently supports
`x86_64-linux`.

## Flake outputs

| Output | Purpose |
| --- | --- |
| `devShells.x86_64-linux.default` | Development tools for Bun, Playwright, Tauri, PostgreSQL, containers, and security checks |
| `packages.x86_64-linux.default` | Standalone Lirna server executable |
| `packages.x86_64-linux.server` | Alias of the default server package |
| `packages.x86_64-linux.desktop` | Tauri desktop application |
| `packages.x86_64-linux.nixos-test` | NixOS VM integration test |
| `apps.x86_64-linux.default` | Runs the packaged server |
| `apps.x86_64-linux.desktop` | Runs the packaged desktop application |
| `nixosModules.default` | NixOS module exposed as `services.lirna` |

Enter the development shell:

```bash
nix develop
```

The shell supplies Nixpkgs' patched Playwright browsers and prevents Playwright
from downloading separate browser binaries. Run the Firefox E2E suite with:

```bash
bun run test:e2e
```

The pinned `@playwright/test` version in `package.json` must match the
`playwright-driver` version from the locked Nixpkgs input.

Build or run the server package:

```bash
nix build
nix run
```

The package contains only the Hono server from `apps/server`. It does not build
the web application, documentation site, or Tauri application. Running it
directly requires `DATABASE_URL` and `CORS_ORIGIN` in the process environment;
`PORT` defaults to `3000`.

Build or run the Tauri desktop package:

```bash
nix build .#desktop
nix run .#desktop
```

The desktop package builds the web frontend, embeds it in the Tauri executable,
and wraps the application with its GTK and WebKitGTK runtime dependencies. Its
frontend connects to `http://localhost:3000` by default. Consumers can override
the `serverUrl` argument when calling `nix/tauri-package.nix` directly.

## Packaging

`nix/package.nix` uses
[`bun2nix`](https://github.com/nix-community/bun2nix) to compile
`apps/server/src/index.ts` into the `lirna` executable. `nix/bun.nix` records the
Bun dependencies derived from `bun.lock`, while `nix/source.nix` removes local
build output and development-only directories from the package source.

`nix/tauri-package.nix` uses the same Bun dependency cache to build
`apps/web/dist`, then uses Nixpkgs' `cargo-tauri` hook and the Rust lockfile at
`apps/web/src-tauri/Cargo.lock` to build and bundle the desktop application.

`config/nix-output-paths.json` is the shared source manifest for package filtering
and CI change classification. Add a path there when an input starts affecting the
server or desktop output; `nix/source.nix` and the workflow classifier both read
that manifest.

Regenerate `nix/bun.nix` with bun2nix whenever `bun.lock` changes.

## NixOS module

Import the flake's default NixOS module and enable the service:

```nix
{
  inputs.lirna.url = "path:/path/to/Lirna";

  outputs = { nixpkgs, lirna, ... }: {
    nixosConfigurations.host = nixpkgs.lib.nixosSystem {
      system = "x86_64-linux";
      modules = [
        lirna.nixosModules.default
        {
          services.lirna = {
            enable = true;
            environmentFile = "/run/secrets/lirna.env";
          };
        }
      ];
    };
  };
}
```

The module creates a `lirna` system user and a hardened `lirna.service`. By
default it also provisions PostgreSQL 16 with a `lirna` database and peer-auth
user, then supplies the local database URL to the service.

### Options

| Option | Default | Description |
| --- | --- | --- |
| `services.lirna.enable` | `false` | Enables the service |
| `services.lirna.package` | This flake's server package | Selects the executable to run |
| `services.lirna.port` | `3000` | Sets the server port |
| `services.lirna.openFirewall` | `false` | Opens the configured TCP port |
| `services.lirna.environmentFile` | none | Supplies deployment settings; required when enabled |
| `services.lirna.database.createLocally` | `true` | Provisions the local PostgreSQL database |

### Environment file

The environment file must be deployed outside the Nix store with permissions
appropriate for secrets. It must contain:

```dotenv
CORS_ORIGIN=https://lirna.example.com
```

When `services.lirna.database.createLocally = false`, it must also contain a
remote database connection string:

```dotenv
DATABASE_URL=postgresql://user:password@database.example.com/lirna
```

Use a NixOS-compatible secret manager or another activation-time mechanism to
create the file. Do not put real secrets directly in a Nix expression because
they would be copied into the world-readable Nix store.

## Checks

Run the package and module evaluation checks:

```bash
nix flake check
```

Run the full NixOS VM integration test:

```bash
nix build .#nixos-test
```

The VM test provisions PostgreSQL, starts `lirna.service`, waits for port 3000,
and verifies that the server root responds with `OK`.

Pull requests with classified Nix output impact evaluate the whole flake without
realizing package or VM closures. Pushes to `main`, the weekly schedule, and
manual runs build the classified server, desktop, module, and VM checks. This
keeps pull-request feedback bounded while ensuring the complete closures are
built after merge and periodically.
