{ config, lib, pkgs, ... }:

with lib;

let
  cfg = config.kryonix.notebooklmMcp;
  
  # TODO: Substituir por pkgs.callPackage com o path real 
  # após a inclusão do notebooklm-mcp no overlay do Kryonix.
  notebooklmMcpPkg = pkgs.callPackage ../../../nix/notebooklm-mcp.nix { };
  
in
{
  options.kryonix.notebooklmMcp = {
    enable = mkEnableOption "Habilita o MCP Kryonix NotebookLM";

    readOnly = mkOption {
      type = types.bool;
      default = true;
      description = "Força o MCP a operar em modo read-only (desabilita exclusão de notebooks/fontes).";
    };

    allowedNotebookIds = mkOption {
      type = types.listOf types.str;
      default = [];
      description = "Lista opcional de IDs de notebooks permitidos para acesso. Vazio = todos.";
    };

    authPath = mkOption {
      type = types.str;
      default = "~/.local/state/kryonix/notebooklm-mcp/auth.json";
      description = "Caminho seguro para armazenar as credenciais (cookies).";
    };
    
    allowedTools = mkOption {
      type = types.str;
      default = "manage_notebook:list,manage_notebook:get,query_notebook,manage_source:check_freshness,manage_studio:list";
      description = "Lista de ferramentas permitidas, separadas por vírgula.";
    };
  };

  config = mkIf cfg.enable {
    # Em um setup real, poderíamos declarar uma service systemd ou 
    # apenas adicionar o pacote no enviroment.systemPackages e 
    # injetar as variáveis de ambiente base.
    
    environment.systemPackages = [ notebooklmMcpPkg ];

    environment.sessionVariables = {
      NOTEBOOKLM_AUTH_PATH = cfg.authPath;
      NOTEBOOKLM_READ_ONLY = if cfg.readOnly then "true" else "false";
      NOTEBOOKLM_ALLOWED_TOOLS = cfg.allowedTools;
    };
  };
}
