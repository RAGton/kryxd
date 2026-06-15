{
  rustPlatform,
  lib,
  callPackage,
  makeWrapper,
  pkg-config,
  openssl,
}:

let
  ui = callPackage ./ui.nix { };
in
rustPlatform.buildRustPackage {
  pname = "kryonix-installer";
  version = "0.1.0";

  src = lib.cleanSource ../.;

  cargoLock = {
    lockFile = ../Cargo.lock;
  };

  nativeBuildInputs = [
    makeWrapper
    pkg-config
  ];
  buildInputs = [ openssl ];

  # reqwest with rustls-tls links against openssl for the host build
  OPENSSL_NO_VENDOR = 1;

  postInstall = ''
    mkdir -p $out/share/kryonix-installer/ui
    cp -r ${ui}/dist $out/share/kryonix-installer/ui/dist

    wrapProgram $out/bin/kryonix-installer \
      --set RUST_LOG info \
      --set KRYONIX_INSTALLER_UI_DIR "$out/share/kryonix-installer/ui/dist"
    # GITHUB_CLIENT_ID must be supplied at runtime by the caller (nixos module or CLI).
    # Intentionally NOT hardcoded here — it is a deployment-time secret.
  '';

  meta = with lib; {
    description = "Kryonix installer backend (Axum) + web UI";
    homepage = "https://github.com/RAGton/kryonix-installer";
    license = licenses.unfree;
    maintainers = [ ];
    platforms = platforms.linux;
  };
}
