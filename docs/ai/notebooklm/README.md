# Kryonix NotebookLM Integration

## Papel do NotebookLM
O NotebookLM atua como um sistema de RAG (Retrieval-Augmented Generation) focado na documentação do Kryonix OS. Ele consulta a base de conhecimento arquitetural, identifica divergências históricas e propõe Change Requests. O NotebookLM **não** é considerado uma autoridade sobre o código real do repositório.

## Papel do Antigravity
O Antigravity atua como executor no repositório. Ele é responsável por verificar a veracidade das respostas do NotebookLM contra o código em execução, preparar consultas embasadas e aplicar planos rigorosamente testados. O código em execução e as ferramentas locais sempre vencem afirmações geradas pelo NotebookLM.

## Fluxo Request/Response
1. **Prepare:** O Antigravity estrutura uma consulta no formato de um Request em `requests/`.
2. **Execute (Humano):** O usuário copia a consulta e a envia ao NotebookLM manualmente.
3. **Import:** O usuário salva a resposta no diretório `responses/`.
4. **Validate:** O Antigravity valida cada afirmação da resposta contra o repositório atual.
5. **Apply:** O usuário aprova as partes validadas e o Antigravity realiza as mudanças através de pequenos commits.

## Ordem de precedência
1. Código em execução (repo).
2. Documentação viva e atualizada (`CURRENT_STATE.md`, etc.).
3. Resposta do NotebookLM.
4. Histórico documental antigo.

## Riscos de fontes antigas
O NotebookLM pode consumir fontes defasadas. Sempre desconfie de caminhos de arquivos, funções e lógicas apontadas por ele se não forem comprovadas no código atual.

## Proibição de secrets
Sob nenhuma circunstância secrets, tokens, APIs keys, `.env` ou dados sensíveis devem transitar nos templates, requests ou respostas do NotebookLM. O Antigravity bloqueará e alertará sobre isso.

## Como usar os três modos da skill
Você pode pedir ao Antigravity para executar os modos via instrução em linguagem natural ou citando os modos:
- `prepare-query`: Peça para criar uma consulta arquitetural ao NotebookLM sobre algo que precisa ser planejado.
- `import-response`: Avise que você colou a resposta do NotebookLM e peça para validar contra o repo.
- `apply-approved-plan`: Dê a aprovação para aplicar mudanças derivadas da resposta validada.

## Como validar
Você pode utilizar o comando slash `/skills` na interface do chat para visualizar e certificar-se de que a skill `kryonix-notebooklm` está ativa e carregada para uso no repositório atual.
