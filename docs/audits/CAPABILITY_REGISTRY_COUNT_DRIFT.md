# Auditoria — drift de contagem do capability registry

## Estado

- Data da verificação: 2026-07-27
- Registry canônico: `schemas/capabilities.json`
- Consumidor Rust: `crates/kryx/src/domain/capabilities.rs`
- Resultado observado: registry com 43 capabilities; teste ainda espera 42
- Classificação: teste desatualizado após expansão do catálogo

## Fonte de verdade

O arquivo `schemas/capabilities.json` é a fonte de dados canônica. O módulo Rust apenas incorpora, tipa e valida esse JSON por meio de `include_str!`.

```text
schemas/capabilities.json
        ↓ include_str!
crates/kryx/src/domain/capabilities.rs
        ↓
capability_registry()
```

Não existe evidência de que o registry tenha sido alterado pelo Gate 1. O Gate 1 modificou somente:

```text
src/api/v2/kve.rs
src/api/v2/think.rs
```

## Causa do drift 42 × 43

O teste `canonical_registry_has_expected_shape` contém uma expectativa fixa:

```rust
assert_eq!(registry.capabilities.len(), 42);
```

O registry atual inclui a capability:

```text
virtualization.incus
```

Metadados atuais:

```text
wireKey: incus
level: system
domain: virtualization
status: ready
requires: storage.srv-data
conflicts: virtualization.libvirt
```

A presença dessa capability é coerente com a evolução do KVE/Incus. O erro atual indica que o catálogo foi ampliado, mas a expectativa numérica do teste não acompanhou a mudança.

## Avaliação do teste

O teste atual possui duas responsabilidades:

1. verificar a quantidade exata de capabilities;
2. verificar que os IDs são únicos.

A verificação de unicidade continua válida. A contagem fixa é útil apenas como alarme de alteração deliberada do contrato, mas é frágil quando não é atualizada no mesmo commit que adiciona uma capability.

Classificação:

```text
registry: consistente com a fonte canônica
capability virtualization.incus: presente e declarada
teste de unicidade: válido
teste de contagem 42: desatualizado
```

## Correção recomendada

Não remover `virtualization.incus` e não modificar o registry somente para fazer o teste passar.

A correção mínima deve:

1. atualizar a contagem deliberada para 43;
2. manter a verificação de IDs únicos;
3. adicionar uma asserção explícita para `virtualization.incus`;
4. validar os metadados importantes da capability;
5. registrar no commit que houve expansão do contrato de 42 para 43.

Exemplo de intenção de teste:

```rust
assert_eq!(registry.capabilities.len(), 43);

let incus = get_capability("virtualization.incus")
    .expect("virtualization.incus must be registered");

assert_eq!(incus.status, CapabilityStatus::Ready);
assert!(incus.requires.iter().any(|id| id == "storage.srv-data"));
assert!(incus.conflicts.iter().any(|id| id == "virtualization.libvirt"));
```

## Gate 1 relacionado

O Gate 1 reativou os testes das rotas V2 stub de KVE e Think.

Validação executada com target limpo:

```text
10 passed
0 failed
0 ignored
120 filtered out
```

Commit local informado:

```text
949e015b9abd1f538214e1c5ceddc59a54c8479d
test(api): reactivate KVE and Think v2 stub routes
```

Esse commit não altera o capability registry e não é a causa do drift 42 × 43.

## Próxima ação

Abrir um Gate 1.5 isolado para corrigir apenas o teste do registry, executar:

```bash
CARGO_TARGET_DIR=/tmp/kryxd-capability-gate \
  nix develop -c \
  cargo test -p kryx canonical_registry_has_expected_shape \
  --locked -- --nocapture
```

Depois executar os testes completos do crate `kryx`.

## Riscos

- Atualizar somente `42` para `43` sem testar os metadados mantém o teste frágil.
- Remover `virtualization.incus` para restaurar a contagem quebraria a direção arquitetural do KVE.
- Documentar 43 como funcionalidade completamente implementada seria incorreto: a capability pode estar registrada como pronta no catálogo enquanto endpoints KVE ainda retornam `status: "stub"`. Registry e maturidade operacional devem ser descritos separadamente.
