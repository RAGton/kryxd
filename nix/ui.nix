{
  lib,
  buildNpmPackage,
}:

buildNpmPackage {
  pname = "kryxd-ui";
  version = "0.1.0";
  src = lib.cleanSource ../ui;

  npmDepsHash = "sha256-e36ZFfsQoVphL5hzVdzrfxO78bUsV24KC/2VzPuSg9w=";

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
