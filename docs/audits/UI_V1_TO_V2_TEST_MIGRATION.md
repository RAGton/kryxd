# UI V1 → V2 — Relatório de migração dos testes

> Estado: WIP quebrado — classificação inicial baseada na execução real da suíte UI.
>
> Data: 2026-07-22
>
> Escopo: `ui/src/utils/installPlan.js` e testes diretamente relacionados.

## Evidência da classificação

Execução:

```text
npm test
```

Os resultados históricos e a execução da auditoria estão separados na seção [Resultados históricos](#resultados-históricos). Em resumo:

```text
execução inicial: 112 executados / 95 passaram / 17 falharam
execução após migração (histórica): 102 executados / 100 passaram / 2 falharam
execução atual da auditoria: 102 testes / 101 passaram / 1 falhou
```

A sintaxe do mapper e o codegen passaram antes e durante esta classificação:

```text
node --check ui/src/utils/installPlan.js       PASS
npm run generate:contracts                    PASS
npm run check:generated                        PASS
```

## Regras de migração

- Não atualizar expectativas antigas apenas para produzir verde.
- O `InstallPlanV2` deve conter somente `version`, `isThinkServer`, `repository`, `storage` e `features`.
- Rede, locale, administração, identidade e secrets permanecem no estado do wizard, mas não entram no plano V2.
- Falhas de i18n e outros domínios não são mascaradas como regressões do mapper.
- Fixtures de testes não devem registrar credenciais reais ou valores sensíveis.

## Classificação inicial

| Teste | Expectativa antiga | Classificação | Destino V2 | Ação |
| --- | --- | --- | --- | --- |
| `i18n Hardcoded Strings Sweep` (`i18nHardcodedStrings.test.js:46`) | Zero strings hardcoded | Fora do escopo do mapper | Suite de i18n | Manter falha separada; não alterar nesta recuperação |
| `draft gera install-plan canonico sem vazar estado transitorio` (`installPlan.test.js:64`) | `version=1`, `network`, `locale`, `disk`, `admin` | Contrato V1 substituído | `InstallPlanV2` | Migrar para shape V2 e verificar ausência de campos proibidos |
| `single, split e RAID geram payload coerente com o contrato` (`installPlan.test.js:177`) | `disk.*` e RAID serializados | Contrato V1 / capability unsupported | `storage.*`; RAID deve ser rejeitado | Reescrever como mapper V2 e teste de bloqueio |
| `buildInstallPlanPayload usa 0.0.0.0 como sentinela gateway` (`installPlan.test.js:271`) | `network.gateway` e `network.wan` | Network separado | `NetworkPlanV2` | Retirar do teste de InstallPlan; preservar cobertura em validação de network |
| `buildInstallPlanPayload inclui gateway ... static` (`installPlan.test.js:289`) | `network.gateway` | Network separado | `NetworkPlanV2` | Retirar do teste de InstallPlan |
| `buildInstallPlanPayload mantém wan ...` (`installPlan.test.js:301`) | `network.wan` | Network separado | `NetworkPlanV2` | Retirar do teste de InstallPlan |
| `buildInstallPlanPayload inclui wan ...` (`installPlan.test.js:317`) | `network.wan` | Network separado | `NetworkPlanV2` | Retirar do teste de InstallPlan |
| `buildInstallPlanPayload não vaza campos extras em source` (`installPlan.test.js:330`) | `source` legado | Contrato V1 substituído | `repository` | Migrar para chaves canônicas do repository |
| `buildInstallPlanPayload inclui mgmtMode ...` (`installPlan.test.js:369`) | `network.mode` | Network separado | `NetworkPlanV2` | Retirar do teste de InstallPlan |
| `buildInstallPlanPayload modo DHCP ...` (`installPlan.test.js:384`) | `network.mode` | Network separado | `NetworkPlanV2` | Retirar do teste de InstallPlan |
| `buildInstallPlanPayload não exporta 0.0.0.0 ... gateway` (`installPlan.test.js:397`) | `network.gateway` | Network separado | `NetworkPlanV2` | Retirar do teste de InstallPlan |
| `buildInstallPlanPayload usa serverIp ...` (`installPlan.test.js:478`) | `network.serverIp` | Network separado | `NetworkPlanV2` | Retirar do teste de InstallPlan |
| `buildInstallPlanPayload nao exporta 0.0.0.0 ... serverIp` (`installPlan.test.js:494`) | `network.serverIp` | Network separado | `NetworkPlanV2` | Retirar do teste de InstallPlan |
| `WAN expand/collapse nao afeta ...` (`installPlan.test.js:510`) | `network.wan` | Network separado | `NetworkPlanV2` | Retirar do teste de InstallPlan |
| `contract: buildInstallPlanPayload preserva fields ...` (`installPlan.test.js:522`) | `admin`, `targetRemoteAccess` e capability com dependência implícita | Contrato V1 + fixture incompleta | `features` e contratos separados | Migrar somente campos V2; mover identidade/remote access para contrato próprio |
| `builds a default valid payload` (`utils/installPlan.test.js:29`) | `version=1`, `profile`, `disk`, `network`, `locale` | Contrato V1 substituído | `version`, `repository`, `storage`, `features` | Migrar para fixture V2 |
| `activates srvData appropriately` (`utils/installPlan.test.js:58`) | `storage.enableSrvData` / `storage.srvDataMode` | Contrato V1 / shape intermediário | `features.storage['srv-data']` | Migrado; o storage single mantém `data: null` |
| `i18n Hardcoded Strings Sweep` (segunda execução) | Zero strings hardcoded | Fora do escopo / falha preexistente | Suite de i18n | Não migrar neste épico; registrar como bloqueio independente |

## Resultados históricos

A classificação inicial registrou a suíte antes da migração das expectativas V1:

```text
execução inicial: 112 executados / 95 passaram / 17 falharam
```

Após a migração das expectativas de contrato e da fixture `srvData` para V2:

```text
execução após migração (histórica): 102 executados / 100 passaram / 2 falharam
```

Na auditoria obrigatória atual, a mesma suíte foi reexecutada e produziu:

```text
execução atual da auditoria: 102 testes / 101 passaram / 1 falhou
```

A diferença decorre da execução/test discovery atual; os resultados históricos não foram sobrescritos. A falha atual pertence ao sweep de i18n, que reporta 117 strings hardcoded e permanece fora do escopo desta migração. Os resultados não representam a mesma execução nem devem ser somados.

## Decisões desta rodada

1. A falha de sintaxe foi corrigida sem editar testes.
2. `validateStep()` não constrói o plano final; usa uma projeção parcial.
3. `validateFinalDraft()` constrói e valida o `InstallPlanV2`.
4. A migração das expectativas V1 do mapper foi concluída; os testes focados de contrato V2 passaram.
5. A falha de i18n permanece fora do escopo e não foi mascarada.

## Próxima ordem de trabalho

1. Resolver ou classificar formalmente o bloqueio independente do sweep de i18n.
2. Corrigir a formatação Rust sem usar correções automáticas neste checkpoint.
3. Instalar/prover a dependência de headers PAM necessária para o workspace completo.
4. Só depois retomar as validações de API, schema e drift.
