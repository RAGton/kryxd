{
  lib,
  buildNpmPackage,
}:

buildNpmPackage {
  pname = "kryxd-ui";
  version = "0.1.0";
  src = lib.cleanSource ../ui;

  npmDepsHash = "sha256-ZjH2CUzwHWI9rUMMhY9jTGdWKya/HZxRcDmGpn3K2tU=";

  npmBuildScript = "build";

  installPhase = ''
    runHook preInstall
    mkdir -p $out/dist
    cp -r dist/* $out/dist/
    runHook postInstall
  '';

  meta = with lib; {
    description = "Kryonix Daemon web UI (Vite + React)";
    homepage = "https://github.com/RAGton/kryxd";
    license = licenses.unfree;
  };
}
