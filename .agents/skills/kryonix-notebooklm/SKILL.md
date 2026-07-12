---
name: kryonix-notebooklm
description: Orquestra consultas fundamentadas ao NotebookLM para arquitetura, auditoria e planejamento do Kryonix. Use quando o usuário pedir consulta ao NotebookLM, revisão arquitetural, comparação entre repositórios, Change Request, auditoria documental ou validação de um plano usando as fontes do notebook Kryonix OS.
---

# Kryonix NotebookLM Bridge

## Objetivo

Conectar o processo documental do NotebookLM ao fluxo de engenharia real do Kryonix sem tratar o NotebookLM como executor ou fonte de verdade superior ao repositório.

Esta skill opera agora em cinco modos (incluindo extensões via MCP isolado):

1. `prepare-query` (Humano-no-loop)
2. `query-notebook` (Autônomo via MCP)
3. `prepare-source-sync` (Sincronização via MCP)
4. `import-response` / `validate-response` (Validação cruzada)
5. `apply-approved-plan` (Aplicação)

## Princípio central

NotebookLM:
- consulta fontes;
- relaciona documentação;
- identifica divergências;
- produz análises com citações;
- propõe Change Requests.

Antigravity:
- lê o repositório real;
- verifica cada afirmação;
- identifica arquivos reais;
- executa testes;
- produz patches;
- mostra diffs;
- cria commits pequenos somente quando autorizado.

Código real vence:
- NotebookLM;
- documentação antiga;
- planos anteriores;
- vault;
- memória de conversas.

## Modo prepare-query

Use quando o usuário pedir para consultar o NotebookLM.

### Procedimento

1. Descobrir o root real do repositório.
2. Ler:
   - AGENTS.md;
   - regras locais;
   - CURRENT_STATE.md, quando existir;
   - SECURITY.md, quando relevante;
   - TESTING.md, quando relevante;
   - arquivos reais relacionados à tarefa.
3. Registrar baseline:
   - repositório;
   - branch;
   - commit SHA;
   - git status;
   - data;
   - objetivo;
   - arquivos inspecionados.
4. Separar fatos confirmados de hipóteses.
5. Criar arquivo em:

docs/ai/notebooklm/requests/YYYYMMDD-HHMM-<slug>.md

6. Usar o contrato de REQUEST_TEMPLATE.md.
7. Mostrar ao usuário:
   - caminho do request;
   - texto exato que deverá ser enviado ao NotebookLM;
   - fontes do notebook que devem ser selecionadas.
8. Parar após gerar a consulta.
9. Não modificar código nesse modo.

## Modo import-response

Use quando o usuário fornecer uma resposta exportada do NotebookLM.

### Procedimento

1. Localizar o request original.
2. Ler a resposta em:

docs/ai/notebooklm/responses/<arquivo>.md

3. Separar cada afirmação da resposta.
4. Classificar cada afirmação como:
   - confirmada pelo código;
   - confirmada por documentação atual;
   - parcial;
   - divergente;
   - histórica;
   - não comprovada;
   - incorreta.
5. Verificar:
   - paths;
   - funções;
   - endpoints;
   - tipos;
   - contratos JSON;
   - testes;
   - opções Nix;
   - comandos;
   - riscos.
6. Não confiar apenas na citação do NotebookLM.
7. Criar relatório de validação contendo:
   - afirmação;
   - evidência NotebookLM;
   - evidência no repositório;
   - veredito;
   - impacto.
8. Produzir decisão:
   - ACCEPTED;
   - PARTIALLY_ACCEPTED;
   - REJECTED;
   - NEEDS_MORE_EVIDENCE.
9. Não modificar código sem aprovação explícita.

## Modo query-notebook (Requer MCP ativo)

Use quando o MCP estiver habilitado via NixOS e o agente puder consultar autonomamente, removendo o atrito do copy/paste humano.

### Procedimento
1. Formular o request com o mesmo rigor do modo `prepare-query`.
2. Validar que o payload não contém credenciais.
3. Chamar a tool `query_notebook` fornecida pelo servidor MCP.
4. Redirecionar a resposta automaticamente para o fluxo de `validate-response` (validação cruzada).
5. O agente **não deve** aplicar as mudanças instantaneamente. A aprovação do plano continua obrigatória.

## Modo prepare-source-sync (Requer MCP ativo)

Use para garantir que o NotebookLM tem a versão mais recente dos arquivos de arquitetura antes de gerar um plano.

### Procedimento
1. Identificar arquivos chave (ex: `CURRENT_STATE.md`, schemas).
2. Usar a tool `manage_source:check_freshness` para verificar defasagem.
3. Se necessário, alertar o usuário para atualizar as fontes antes de prosseguir.

## Modo apply-approved-plan

Use somente depois de o usuário aprovar o plano validado.

### Procedimento

1. Repetir git status e baseline.
2. Confirmar que o request e a resposta ainda correspondem ao HEAD atual.
3. Informar se o commit mudou desde a consulta.
4. Dividir a implementação em mudanças pequenas.
5. Não misturar:
   - correção de segurança;
   - refatoração;
   - feature;
   - migração;
   - ZFS;
   - alteração de contrato.
6. Aplicar somente o escopo aprovado.
7. Executar testes proporcionais ao risco.
8. Mostrar git diff.
9. Não usar git add .
10. Não fazer commit sem autorização, salvo pedido explícito.
11. Nunca declarar pronto sem evidência.

## Regras de segurança

Nunca:
- automatizar login do Google;
- pedir senha ou cookie do usuário;
- armazenar credenciais do Google;
- usar scraping não autorizado na interface do NotebookLM;
- confiar em resposta sem verificar;
- executar Disko, mkfs, wipefs ou zpool destroy;
- rodar switch ou reboot sem autorização;
- modificar disco real durante consulta documental;
- colocar secrets em request ou response;
- enviar `.env`, tokens, senhas ou chaves privadas ao NotebookLM.

Antes de enviar uma consulta, verificar se ela contém:
- tokens;
- senhas;
- API keys;
- cookies;
- conteúdo de `.env`;
- chaves SSH;
- dados pessoais;
- URLs privadas sensíveis.

Se encontrar conteúdo sensível, parar e avisar o usuário.

## Contrato de saída

Toda consulta deve informar:

- baseline;
- objetivo;
- não objetivos;
- fatos confirmados;
- hipóteses;
- pergunta principal;
- perguntas secundárias;
- fontes recomendadas;
- formato esperado da resposta;
- riscos;
- critérios de conclusão.

Toda resposta importada deve resultar em:

- resumo;
- afirmações verificadas;
- divergências;
- evidências no código;
- decisão;
- plano seguro;
- testes;
- riscos;
- rollback;
- questões pendentes.

## Critério de conclusão da skill

A skill está funcionando quando:

1. aparece no comando `/skills`;
2. consegue gerar um request versionável;
3. consegue importar uma resposta;
4. consegue separar afirmações confirmadas de não comprovadas;
5. não altera código no modo prepare-query;
6. não aceita automaticamente sugestões do NotebookLM;
7. exige aprovação antes de aplicar mudanças.
