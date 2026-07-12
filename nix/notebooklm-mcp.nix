{
  lib,
  buildNpmPackage,
  fetchFromGitHub,
}:

buildNpmPackage rec {
  pname = "antigravity-notebooklm-mcp";
  version = "2.0.0";

  src = fetchFromGitHub {
    owner = "jackc1111";
    repo = "antigravity-notebooklm-mcp";
    rev = "main";
    # Substituir por hash real na integração definitiva
    hash = "sha256-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";
  };

  # Substituir por hash real gerado pelo buildNpmPackage
  npmDepsHash = "sha256-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";

  patches = [
    ./patches/notebooklm-mcp-security.patch
  ];

  postPatch = ''
    # Remove chamadas de console.log para prevenir corrupção do JSON-RPC stdio
    sed -i 's/console.log/console.error/g' src/browser-auth.ts src/index.ts src/api-client.ts src/orchestrator.ts || true

    # Atualiza o path de autenticação para o local seguro configurado no ambiente
    sed -i "s|path.join(homedir, '.notebooklm-mcp', 'auth.json')|process.env.NOTEBOOKLM_AUTH_PATH \|\| path.join(homedir, '.local/state/kryonix/notebooklm-mcp/auth.json')|g" src/browser-auth.ts
  '';

  # Como puppeteer no ambiente build vai tentar baixar o Chromium local, 
  # ignoramos scripts durante a instalação do npm
  PUPPETEER_SKIP_DOWNLOAD = "true";

  meta = with lib; {
    description = "Kryonix Hardened NotebookLM MCP Server";
    homepage = "https://github.com/jackc1111/antigravity-notebooklm-mcp";
    license = licenses.isc;
    maintainers = [ ];
  };
}
