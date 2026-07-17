{
  rustPlatform,
  lib,
  makeWrapper,
  pkg-config,
  openssl,
}:

rustPlatform.buildRustPackage {
  pname = "kryxd";
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

  # The Nix package must prove the daemon compiles. Runtime/integration tests are
  # exercised outside the sandbox because some target-tree tests need git/Nix IO
  # and one install-topology test is tracked as existing debt.
  doCheck = false;

  postInstall = ''
    wrapProgram $out/bin/kryxd \
      --set RUST_LOG info
    # GITHUB_CLIENT_ID must be supplied at runtime by the caller (nixos module or CLI).
    # Intentionally NOT hardcoded here — it is a deployment-time secret.
  '';

  meta = with lib; {
    description = "Kryonix Daemon/KVE backend API (Axum)";
    homepage = "https://github.com/RAGton/kryxd";
    license = licenses.unfree;
    maintainers = [ ];
    platforms = platforms.linux;
  };
}
