# Resumo Executivo
Auditoria do repositório `antigravity-notebooklm-mcp` concluída. O servidor provê uma ponte poderosa via reverse-engineering de RPCs do NotebookLM, porém apresenta postura de segurança **altamente permissiva e não segura por padrão**. Ele armazena credenciais em texto claro, expõe ferramentas destrutivas (deleção), sofre com vazamento de dados em stdout (quebrando JSON-RPC), não faz validação estrutural rigorosa e possui vulnerabilidades na supply chain (NPM audit acusou CVEs críticos).

A decisão é **ADOPT_AFTER_HARDENING**. O código não deve ser usado "as-is".

---

# Arquitetura do Upstream
O MCP é escrito em TypeScript executando via Node.js stdio.
- **API Client** (`src/api-client.ts`): Cliente Axios configurado para fazer requisições não oficiais à API interna do NotebookLM (`batchexecute`), emulando um browser.
- **Browser Auth** (`src/browser-auth.ts`): Orquestra um `google-chrome` em modo remote-debugging (`port 9222`, `origins=*`), extrai cookies via Chrome DevTools Protocol (CDP) e os salva em `~/.notebooklm-mcp/auth.json`.
- **Orchestrator** (`src/orchestrator.ts`): Implementa chamadas mais complexas, como Deep Research e geração de artefatos.
- **Server** (`src/index.ts`): Declara as MCP Tools, lidando com o fluxo de entrada e saída.

---

# Riscos Classificados

## 🔴 CRÍTICO
1. **Credenciais Inseguras:** Cookies de sessão do Google são salvos em `~/.notebooklm-mcp/auth.json` sem `chmod 0600` explícito. Qualquer processo do usuário pode roubar a sessão.
2. **Remote Debugging Exposto:** O Chrome é iniciado com `--remote-debugging-port=9222` e `--remote-allow-origins=*`, abrindo brecha para CSRF ou ataque local via loopback.
3. **Corrupção de Stdio / Vazamento de Dados:** Em `browser-auth.ts`, o código utiliza massivamente `console.log`, o que corrompe o protocolo MCP stdio e pode vazar tokens para o log do cliente MCP.
4. **Ausência de Validação de Input:** O `src/index.ts` usa `args as any` em todos os handlers. Ausência de validação Zod no payload da ferramenta permite exploração por injeção de parâmetros maliciosos.

## 🟠 ALTO
1. **Ações Destrutivas Ativas:** Ferramentas como `manage_notebook:delete`, `manage_source:delete`, e `manage_studio:delete` estão ativadas, permitindo que a IA apague dados sem confirmação humana.
2. **Dependências Vulneráveis:** O `npm audit` revelou 16 vulnerabilidades, incluindo falhas críticas (ex: Path Traversal no `basic-ftp`, vulnerabilidades em `axios`, `hono`, `ws`).
3. **Sem Timeouts de Rede:** O Axios (`api-client.ts`) não tem timeout configurado, podendo causar bloqueio eterno (DDoS) no servidor MCP se a Google demorar a responder.

## 🟡 MÉDIO
1. **Engenharia Reversa Frágil:** Depende da API interna não documentada da Google, que altera o `bl` e CSRF bindings sem aviso.
2. **Autenticação Automática Perigosa:** A ferramenta MCP `authenticate` com `method="browser"` bloqueia a execução esperando o Chrome e quebra o contexto do agente.
3. **Falta de Testes:** 0 cobertura de testes unitários ou e2e.

## 🟢 BAIXO
1. **License & Versão:** Divergências entre package.json (`1.0.0`) e servidor (`2.0.0`).

---

# Evidências (Arquivos e Linhas)
- `src/browser-auth.ts:271`: `--remote-allow-origins=*` (Risco Crítico)
- `src/browser-auth.ts:328`: `fs.writeFileSync(authPath, JSON.stringify(authData, null, 2));` (Credenciais salvas sem mask/chmod, Risco Crítico).
- `src/browser-auth.ts:233`: Diversos `console.log` que quebram stdio.
- `src/index.ts:215`: `const { action, notebook_id, title } = args as any;` (Falta de validação Zod, Risco Crítico).
- `src/index.ts:136`: `name: "authenticate"` permite acionar o browser pelo agente (Risco Médio/Alto).
- `package.json:20`: Inclusão de pacotes Puppeteer pesados só para extrair cookies, que podem ser feitos com CLI.

---

# Decisão: ADOPT_AFTER_HARDENING
Devido à grande utilidade para planejamento e auditoria arquitetural pelo Kryonix, iremos adotar o MCP. Contudo, exigirá um Fork (ou overlay via Nix) que aplica estritos patches de segurança.

---

# Plano de Fork/Overlay & Patches Necessários
Não operaremos com Git submodule. Trabalharemos no Kryonix via configuração declarativa Nix e patches em tempo de build, ou criaremos um Fork gerenciado (`kryonix-notebooklm-mcp`).

**Patches a aplicar:**
1. Mudar local de auth para `~/.local/state/kryonix/notebooklm-mcp/auth.json`.
2. Definir permissões restritas ao escrever arquivo de autenticação (modo `0600`).
3. Remover *todas* as chamadas de `console.log` ou redirecioná-las para `console.error` (stderr), garantindo JSON-RPC puro no stdout.
4. Remover as ferramentas destrutivas (`manage_notebook:delete`, `manage_source:delete`, etc.) ou colocá-las sob feature flag.
5. Remover a ferramenta `authenticate` do servidor MCP. Autenticação deve ser um utilitário CLI apartado, invocado pelo humano, não pelo agente.
6. Substituir o type cast `as any` no Request Handler por validações Zod estritas (já disponíveis na biblioteca).
7. Adicionar `timeout: 10000` no cliente Axios.
8. Atualizar versões vulneráveis (`npm audit fix`).

---

# Configuração MCP Proposta

```json
{
  "mcpServers": {
    "notebooklm": {
      "command": "nix-run",
      "args": ["-f", "kryonix-notebooklm-mcp", "-c", "node", "build/index.js"],
      "env": {
        "NOTEBOOKLM_AUTH_PATH": "/home/rocha/.local/state/kryonix/notebooklm-mcp/auth.json",
        "NOTEBOOKLM_READ_ONLY": "true",
        "NOTEBOOKLM_ALLOWED_TOOLS": "manage_notebook:list,manage_notebook:get,query_notebook,manage_source:check_freshness,manage_studio:list"
      }
    }
  }
}
```

---

# Atualização Proposta da Skill (`kryonix-notebooklm`)

Para a **Fase 5 - Integração**, a skill `.agents/skills/kryonix-notebooklm/SKILL.md` será estendida para abranger quatro modos:

1. `query-notebook`: O agente aciona o MCP via tool de forma autônoma para pesquisar, em vez de exigir que o humano faça o copy/paste no browser, eliminando atrito.
2. `validate-response`: Validará a resposta recebida contra o repo atual (mantém a regra base de prevalência do repo).
3. `prepare-source-sync`: Utilizará `manage_source:check_freshness` para garantir que o NotebookLM não está usando documentação antiga antes de formular planos.
4. `apply-approved-plan`: Aplicar mudanças validadas (modo existente).

*A skill manterá a regra estrita de "não aceitar automaticamente sugestões e não rodar auth pelo agente".*

---

# Desenho NixOS Declarativo (Fase 6)

Opções a serem providas no ecossistema Kryonix:
```nix
options.kryonix.notebooklmMcp = {
  enable = lib.mkEnableOption "Habilita o MCP Kryonix NotebookLM";
  readOnly = lib.mkOption { type = lib.types.bool; default = true; };
  allowedNotebookIds = lib.mkOption { type = lib.types.listOf lib.types.str; default = []; };
  authPath = lib.mkOption { type = lib.types.str; default = "~/.local/state/kryonix/notebooklm-mcp/auth.json"; };
};
```
O pacote será buildado usando `buildNpmPackage`, e o overlay removerá Puppeteer/dependências gráficas (visto que usaremos injeção de Cookie manual ou via comando shell isolado, eliminando RCE e peso gráfico).

---

# Plano em Commits Pequenos

1. **Commit 1:** `docs: add MCP audit report and hardening plan` (Este documento).
2. **Commit 2:** `feat(skill): update kryonix-notebooklm SKILL.md to support MCP tools (query-notebook, prepare-source-sync)`
3. **Commit 3:** `nix: create base derivation for antigravity-notebooklm-mcp with initial vulnerability fixes`
4. **Commit 4:** `patch(mcp): apply security constraints (auth path, mode 0600, remove console.log)`
5. **Commit 5:** `patch(mcp): implement tool allowlisting and disable destructive actions`
6. **Commit 6:** `feat(nixos): add declarative options for kryonix.notebooklmMcp`

---

# Testes e Rollback
- **Testes:**
  - Garantir que `npm audit` passa sem falhas High/Critical.
  - Verificar isolamento de socket (`netstat`/`lsof`) certificando que o Chrome com debug não é lançado pelo processo do servidor MCP.
  - Tentar invocar `manage_notebook:delete` e confirmar que o MCP retorna Unauthorized/Disabled.
- **Rollback:**
  - O uso do MCP é "opt-in". Caso haja falha sistêmica, basta desabilitar `kryonix.notebooklmMcp.enable` na config Nix e o Agente voltará ao fluxo puramente "Human-in-the-loop" (copy/paste) delineado originalmente.
