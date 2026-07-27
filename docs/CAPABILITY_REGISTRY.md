# Capability Registry — contrato canônico

## Objetivo

Documentar a fonte de verdade, as invariantes e o fluxo de consumo do registry de capabilities do `kryxd`.

## Fonte de verdade

O arquivo canônico é:

```text
schemas/capabilities.json
```

O crate compartilhado não mantém uma segunda lista. Ele incorpora e valida o JSON por meio de:

```text
crates/kryx/src/domain/capabilities.rs
```

O endpoint público projeta o mesmo registry em:

```text
GET /api/v2/capabilities
```

A UI recebe uma projeção gerada por:

```text
scripts/generate-ui-contracts.mjs
```

Fluxo esperado:

```text
schemas/capabilities.json
        │
        ├── include_str! → crates/kryx
        ├── endpoint     → /api/v2/capabilities
        └── codegen      → ui/src/generated/capabilities.js
```

## Estado atual

O registry possui **43 capabilities**.

A alteração de 42 para 43 foi deliberada no commit:

```text
c544d415f9c11f4039343b09f02b4211a68e5cb9
feat(capabilities): register virtualization.incus capability (v0.2.0) — V58b P1
```

A capability adicionada foi:

```text
id: virtualization.incus
wireKey: incus
domain: virtualization
requires: storage.srv-data
conflicts: virtualization.libvirt
status declarativo: ready
```

O endpoint pode enriquecer o status em runtime para `ready`, `stub` ou `partial`, conforme o socket Unix e a unit `incus.service`.

Portanto, **43 é o estado canônico atual**. O registry não deve ser reduzido para 42 apenas para satisfazer testes antigos.

## Drift conhecido 42 × 43

Duas verificações ficaram desatualizadas quando `virtualization.incus` foi adicionada:

```text
crates/kryx/src/domain/capabilities.rs
scripts/generate-ui-contracts.mjs
```

O endpoint `src/api/capabilities.rs` já reconhece 43 capabilities e verifica explicitamente a presença de `virtualization.incus`.

Esse é um problema de propagação incompleta do contrato, não um erro no JSON canônico.

## Invariantes semânticas

A contagem total é uma observação de versão, não a principal garantia de integridade. As validações obrigatórias são:

- IDs únicos;
- `wireKey` não vazio;
- versões do registry e schema reconhecidas;
- `wireContract = InstallPlanV2.features`;
- dependências e conflitos apontam para IDs existentes;
- nenhuma autorreferência;
- nenhuma dependência cíclica;
- capability `unsupported` possui `blockReason`;
- seleção ativa respeita dependências e conflitos;
- o registry não contém secrets;
- capabilities obrigatórias de arquitetura estão presentes.

Capabilities mínimas que devem ser verificadas semanticamente:

```text
storage.srv-data
storage.topology.raid
storage.topology.manual
storage.encryption.luks2
virtualization.incus
virtualization.libvirt
```

## Política para novas capabilities

Ao adicionar ou remover uma capability:

1. alterar somente `schemas/capabilities.json` como fonte de dados;
2. validar schema, IDs, dependências e conflitos;
3. atualizar testes semânticos;
4. regenerar a projeção da UI;
5. validar o endpoint `/api/v2/capabilities`;
6. registrar a mudança de contrato no changelog ou Vault;
7. não alterar um número mágico isoladamente sem explicar a mudança real.

## Comandos de validação

Contagem e unicidade:

```bash
python3 - <<'PY'
import json
from collections import Counter
from pathlib import Path

registry = json.loads(Path("schemas/capabilities.json").read_text())
items = registry["capabilities"]
ids = [item["id"] for item in items]

duplicates = sorted(identifier for identifier, count in Counter(ids).items() if count > 1)
print(f"capabilities={len(items)}")
print(f"duplicates={duplicates}")

assert len(items) == 43
assert not duplicates
assert "virtualization.incus" in ids
PY
```

Teste do domínio Rust:

```bash
CARGO_TARGET_DIR=/tmp/kryxd-capability-registry \
  nix develop -c \
  cargo test -p kryx canonical_registry_has_expected_shape --locked -- --nocapture
```

Codegen:

```bash
cd ui
npm run generate:contracts
npm run check:generated
```

## Riscos

- manter contagens mágicas em vários consumidores cria drift a cada evolução legítima;
- marcar `virtualization.incus` como `ready` no JSON não prova que o daemon está ativo; o status runtime deve continuar separado;
- remover uma capability apenas para fazer um teste passar pode quebrar UI capability-driven e seleção de features;
- adicionar capability sem consumidor pode ser válido quando o status é `stub` ou `unsupported`, mas deve ser explícito.

## Critério de conclusão do drift atual

O drift 42 × 43 estará encerrado quando:

- o teste do crate deixar de esperar 42;
- o generator deixar de rejeitar qualquer registry diferente de 42;
- as validações semânticas continuarem passando;
- a UI gerada e o endpoint consumirem o mesmo JSON;
- a documentação e o Vault registrarem `virtualization.incus` como a 43ª capability legítima.
