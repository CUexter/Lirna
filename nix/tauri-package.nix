{
  lib,
  rustPlatform,
  cargo-tauri,
  pkg-config,
  wrapGAppsHook4,
  glib-networking,
  gtk3,
  webkitgtk_4_1,
  libsoup_3,
  openssl,
  librsvg,
  bun2nix,
  cacert,
  serverUrl ? "http://localhost:3000",
}:

let
  src = (import ./source.nix { inherit lib; }).desktop;
in
rustPlatform.buildRustPackage {
  pname = "lirna-desktop";
  version = "0.1.0";

  inherit src;

  cargoRoot = "apps/web/src-tauri";
  buildAndTestSubdir = "apps/web/src-tauri";
  cargoLock.lockFile = ../apps/web/src-tauri/Cargo.lock;

  bunDeps = bun2nix.fetchBunDeps {
    bunNix = ./bun.nix;
  };
  dontUseBunBuild = true;
  dontUseBunCheck = true;
  dontUseBunInstall = true;

  VITE_SERVER_URL = serverUrl;
  SSL_CERT_FILE = "${cacert}/etc/ssl/certs/ca-bundle.crt";

  nativeBuildInputs = [
    bun2nix.hook
    cargo-tauri.hook
    pkg-config
    wrapGAppsHook4
  ];

  buildInputs = [
    glib-networking
    gtk3
    webkitgtk_4_1
    libsoup_3
    openssl
    librsvg
  ];

  doCheck = false;

  meta = {
    description = "Lirna desktop application";
    mainProgram = "app";
    platforms = [ "x86_64-linux" ];
  };
}
