# AGENTS.md — kryxd

> Regras operacionais para o daemon `kryxd` (installer backend + UI React/Vite).

## Objective

Manter `kryxd` como daemon installer + UI unificada, consumindo contratos V2 e expondo capability registry. Mudanças devem ser pequenas, reversíveis e cobertas por testes.

## Repository role

- Backend Axum/Rust (porta 8080) — installer daemon
- Frontend React/Vite — capability-driven UI
- Capability registry (`src/api/capabilities.rs`, `schemas/capabilities.json`)
- OpenAPI contract (single source of truth para endpoints HTTP)

## Versionamento e release

Este repo segue a **diretriz canônica unificada** do ecossistema Kryonix:

- **SSOT canônico:** [[kryonix-vault/02-Areas/Kryonix/canonical/release-process.md]]
- **Skill procedural:** `~/.hermes/skills/kryonix-versioning.md`
- **Manifesto:** `Cargo.toml` (linha `version`) + `ui/package.json` (key `"version"`)
- **Tag prefix:** `v` (e.g., `v0.2.0`)

Antes de qualquer bump de versão, carregue a skill e siga o procedimento SSOT.

## Regras para agentes

- Não desenvolver diretamente em `/etc/kryonixos/`. Trabalhar em `repos/kryxd` no meta-repo.
- Sempre `nix flake check` antes de commit.
- Não commitar secrets (tokens, .env, chaves SSH).
- Path explícito em `git add` (nunca `git add .`).
- Mudanças na UI devem refletir o backend real (não documentar `PARTIAL`/`UNKNOWN` como pronto).

## First steps before editing

1. Inspecionar o estado do `cargo` e do `npm run build`.
2. Identificar o escopo (backend Rust, UI React, capability, OpenAPI).
3. Procurar issues/PRs em aberto relacionados.
4. Preferir atualizar arquivos existentes a criar novos.

## Related notes

- Capability registry: ver SSOT canônico de release process.
- OpenAPI contract: `kryxd/openapi.yaml` (SSOT para HTTP API).
- Vault: [[kryonix-vault/02-Areas/Kryonix/canonical/release-process]]