{
  lib,
  buildNpmPackage,
}:

buildNpmPackage {
  pname = "kryonix-installer-ui-web";
  version = "0.1.0";

  src = lib.cleanSource ../ui;

  npmDepsHash = "sha256-sUEtL5G0JMBVcaDwk7YTI5VaaGBsziQ9FuMuXN14BUw=";

  npmBuildScript = "build";

  installPhase = ''
    runHook preInstall
    mkdir -p $out/dist
    cp -r dist/* $out/dist/
    runHook postInstall
  '';

  meta = with lib; {
    description = "Kryonix Installer web UI (Vite + React)";
    homepage = "https://github.com/RAGton/kryonix-installer";
    license = licenses.unfree;
  };
}
