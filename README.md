# kryxd — Kryonix Daemon (Control Panel + Installer)

> **Kryonix Daemon for continuous datacenter orchestration** (Axum/Rust backend + Vite/React UI). Combina o **KCP — Kryonix Control Panel** (gestão de cluster, virtualização via KVE/Incus, capability registry, REST API) com o **Installer backend** (orquestração de disko + nixos-install a partir de um `InstallPlanV2` declarativo).

[![Compatibilidade: NixOS 26.05](https://img.shields.io/badge/NixOS-26.05-blueviolet)](#compatibilidade)
[![Status: experimental](https://img.shields.io/badge/status-experimental-orange)](#status)
[![Última atualização: 2026-08-02](https://img.shields.io/badge/updated-2026--08--02-lightgrey)](#changelog)

## Descrição

O `kryxd` é o **daemon central do ecossistema Kryonix**. Ele não é "só" o installer — é o **painel de controle operacional** de toda a plataforma, oferecendo:

- **REST API + WebSocket** (Axum 0.7 + Tokio) na porta `8080` por padrão (override `KRYONIX_INSTALLER_BIND`)
- **UI React 18 + Vite 6** servida como assets estáticos pelo próprio daemon (KCP screen)
- **KVE — Kryonix Virtualization Engine**: provider de virtualização que fala com o socket Unix do **Incus** (`/var/lib/incus/unix.socket`) para listar/operar instâncias sem depender da CLI `incus` no PATH
- **Installer backend**: particionamento via **Disko** (renderer puro em `src/services/partitioner.rs`), geração do target flake V2 em `/mnt/etc/kryonixos`, execução de `nixos-install --flake`, validação contra o JSON schema canônico
- **Capability registry** com **50 capabilities** em 10 domínios (ai, desktop, dev, mcp, observability, remote, security, server, storage, virtualization), consumido pela UI para wizard dinâmico
- **CLI client**: consumido pelo `kryx-cli` (subcomandos `kcp`, `kve`, `think`) via HTTP síncrono (`ureq`) sobre `127.0.0.1:8080`
- **Storage backend** (PR #27, 2026-07-30): `MediaStorage` (DirectoryStorage) para ISOs e VirtualDiskImages usados pelo KVE

O motor Kryonix (`github:RAGton/kryonix`) consome-o como flake input via `inputs.kryxd.url = "github:RAGton/kryxd";`.

**Versão atual:** `v0.2.1` (Cargo.toml + ui/package.json).

## Status

**experimental**: a UI está em migração V1→V2 (102 testes, 101 passam, 1 falha pré-existente em i18n hardcoded fora de escopo). O backend é estável mas várias áreas estão em Gates ativos (Gate 4: KVE-Incus slice vertical já merged em PR #25; Gate 5.5: media storage em auditoria). Capability registry tem drift conhecido de count (`assert_eq!(registry.capabilities.len(), 43)` vs 50 reais — pendência owner do registry).

## Compatibilidade

| Componente        | Versão suportada                       |
|-------------------|----------------------------------------|
| NixOS             | 26.05 (Kryonix OS)                      |
| Kryonix (meta)    | 26.05                                  |
| Rust              | toolchain 1.86+ (Axum 0.7, Tokio 1.x)  |
| Node.js           | 22.x (Vite 6 + React 18)               |
| Incus             | socket Unix `/var/lib/incus/unix.socket` |

## Instalação

```sh
# Build via Nix (canônico)
nix build .#kryxd

# Validação completa
nix flake check --keep-going
nix flake show --all-systems
```

```sh
# Build Rust direto (sem Nix, usado em dev)
cargo fmt --all -- --check
cargo clippy --all-targets --all-features -- -D warnings
cargo test --locked
```

```sh
# Build UI (sem Nix, usado em dev)
cd ui
npm ci
npm test
npm run build

# Regenerar contracts UI a partir dos schemas JSON
npm run generate:contracts
npm run check:generated
```

## Uso

DEV local pode sobrescrever a versão do motor via:

```sh
nix build --override-input kryxd path:../kryxd
```

```nix
# flake.nix do consumidor (kryonixos, kryonix)
inputs.kryxd.url = "github:RAGton/kryxd";

# overlay
final: prev: {
  kryxd = inputs.kryxd.packages.${final.system}.kryxd;
}
```

### Endpoints principais (Axum router)

| Path base                 | Função                                      | Auth |
|---------------------------|---------------------------------------------|------|
| `/api/v1/legacy/*`        | Legado (health, hardware, network, disk)    | token em alguns |
| `/api/v2/*`               | Capability registry, install plan, KVE stub | token em destrutivos |
| `/api/virt/*`             | KVE real (Incus provider, Unix socket)      | token em destrutivos |

Sub-routers canônicos V2 (`src/api/v2/`):
- `capabilities.rs` — read-only registry (50 caps)
- `install.rs` — `PlanStore` (SHA-256 dedup, atomic write, mode 0600) + `InstallService` (valida capabilities, salva plano, salva secrets, executa preflight)
- `virt.rs` — nodes + instances + state (Incus)
- `kve.rs` — stub retornando `status: "stub"` (será promovido pelo slice vertical do Gate 4)
- `think.rs` — stub retornando `status: "stub"` (Node Think Server)
- `system.rs`, `console.rs`, `cluster.rs`, `storage.rs` — ainda em V1 path

### Componentes em destaque

#### KVE — Kryonix Virtualization Engine

Provider de virtualização do instalador, consumindo o socket Unix do **Incus** (`/var/lib/incus/unix.socket`) para listar e operar instâncias sem depender da CLI `incus` no PATH. Modelos de domínio (VM/container, CPU, RAM, disco) vivem em `crates/kryx/src/domain/virtualization.rs` e `src/services/kve.rs`.

Endpoints expostos:
- `GET /api/v2/kve/instances` — lista instâncias (kind=container|virtual-machine)
- `GET /api/v2/kve/images` — lista imagens disponíveis
- `GET /api/v2/kve/storage` — pools de storage
- `GET /api/v2/kve/health` — health check do provider

> Padrão obrigatório: provider retorna 503 com `KveErrorBody { status: "unavailable", code, message, source }` quando Incus indisponível — **nunca** 200 com array vazio.

#### Capability Registry (50 caps, 10 domínios)

Registry canônico em `schemas/capabilities.json` (validação por `schemas/capabilities.schema.json`). Distribuição por status:
- **43 ready** (estáveis)
- **2 partial** (funcionam com ressalvas)
- **2 stub** (interface presente, implementação futura)
- **3 unsupported** (fora do escopo MVP)

Runtime enrichment só em `virtualization.incus` (lê `incus list --format=json` no boot). Demais caps são estáticas. Toda mutação de plano passa por `validate_plan_capabilities` em `src/api/install.rs`.

#### Storage Backend (DirectoryStorage)

PR #27 (2026-07-30) introduziu o backend de mídia em `src/services/media_storage.rs` (831 linhas):
- `MediaStorageConfig { id, root_path, max_bytes }`
- Atomic staging em `<root>/staging/.staging-<uuid>` → rename atômico para `<root>/isos/` ou `<root>/disks/`
- Validação: path traversal (`..`), caracteres proibidos, prefixos inelegíveis
- `max_bytes` checado só no `finalize` (não durante streaming — dívida conhecida)
- `verify_handle_storage()` antes de qualquer operação

#### kryx-cli HTTP client

`kryxd` expõe sua API para ser consumida pela CLI unificada `kryx` (subcomandos `kcp`, `kve`, `think` em `kryx-cli/src/cli/`). O client HTTP vive em `kryx-cli/src/client.rs` (síncrono via `ureq`, timeout 5s, base `http://127.0.0.1:8080`, override `KRYXD_URL`).

### Layout do repo

```
.
├── Cargo.toml / Cargo.lock            # backend Rust (Axum, tokio, reqwest, secrecy, …)
├── crates/kryx/                      # lib compartilhada (domain + services)
│   └── src/domain/{config,identity,capabilities,virtualization,manifest}.rs
│   └── src/services/{identity,translator}.rs
├── src/
│   ├── api/{v1,v2}/                  # Axum routers (V2 é canônico)
│   ├── services/                     # partitioner, kve, media_storage, target_tree, …
│   ├── executor/                     # nixos.rs, partition.rs (orquestração real)
│   └── main.rs                       # entrypoint, bind 8080
├── ui/                               # Vite 6 + React 18 (kryxd-ui)
│   └── src/{pages,components,state,utils,generated}/
├── schemas/                          # SSOT contratos JSON
│   ├── capabilities.json             # 50 caps registry
│   ├── capabilities.schema.json
│   └── install-plan.schema.json      # InstallPlanV2
├── docs/
│   ├── FRONTEND_BACKEND_CONTRACT.md  # SSOT API
│   ├── audits/                       # auditorias registry + testes V1→V2
│   └── ai/notebooklm/                # templates auditoria MCP
├── nix/{package,ui}.nix              # derivations
└── flake.nix                         # outputs: packages.${system}.{default, kryxd}
```

### Segurança

- Bind default `127.0.0.1:8080`. Para bind remoto, exige `KRYONIX_ALLOW_REMOTE_BIND=1` (senão daemon aborta)
- CORS: só `http://127.0.0.1*`, `http://localhost*`, `http://[::1]*`
- Token de installer obrigatório em rotas destrutivas (`X-Kryonix-Installer-Token`, gerado em boot)
- `secrecy` crate para secrets em memória
- Auditoria Fase 2 (2026-06-19): 15 riscos, P1-P6 críticos, **PARTIAL** status — ver `docs/audits/`

## Repos relacionados

Este repo integra com (cross-links via `../<repo>/README.md`):

- [`kryonix`](../kryonix/): motor / core da distro (consome `kryxd` como flake input)
- [`kryonixos`](../kryonixos/): downstream / hosts reais (inspiron, glacier, inspiron-nina)
- [`kryx-cli`](../kryx-cli/): CLI unificada `kryx` que consome a API via HTTP
- [`kryonix-brain-lightrag`](../kryonix-brain-lightrag/): RAG engine (LightRAG) — pode usar KVE para storage de embeddings
- [`kryonix-home`](../kryonix-home/): organizador de home directory (Rust CLI)
- [`kryonix-aura`](../kryonix-aura/): agente Aura (launcher/provider)
- [`kryonix-assets`](../kryonix-assets/): wallpapers, temas SDDM, branding
- [`kryonix-vault`](../kryonix-vault/): Obsidian vault (memória, ADRs, logs)

Veja [`AGENTS.md`](../../AGENTS.md) do meta-repo para a visão consolidada do workspace.

## Contribuição

Mudanças devem ser pequenas, reversíveis e cobertas por testes. Workflow obrigatório:

1. `cargo fmt --check --all`
2. `cargo clippy --all-targets -- -D warnings`
3. `cargo test --locked` (workspace completo)
4. `cd ui && npm test` (126 testes) + `npm run check:generated`
5. `nix flake check --keep-going` (se escopo toca Nix)

Gate humano obrigatório para `kryx switch` em produção (sempre o humano, nunca o agente). Veja [`AGENTS.md`](AGENTS.md) deste repo para regras de gate, escopo atômico, e path explícito em `git add` (nunca `git add .`).

## Licença

Unfree (uso interno Kryonix).

## Changelog

- **2026-08-02**: reescrito sob template canônico (`agents/kryonix-core/README-TEMPLATE.md`) — badges Shields.io, seções Status + Descrição + Contribuição expandidas, KVE/Registry/Storage detalhados, layout do repo espelhado, refs KCR-2026-07.
- **2026-08-02**: sincronizado com template canônico — seção Compatibilidade + Repos relacionados adicionadas.
- **2026-08-02**: KCP daemon + Installer backend + UI (refs KCR-UI-1, KCR-UI-2)
- **2026-07-30 (PR #27)**: media storage backend (DirectoryStorage) + NodeThinkPlan tipado.
- **2026-07-28 (PR #25)**: KVE slice vertical (provider Incus real via Unix socket).
- **2026-07-27 (PR #23)**: UI KCP consumindo `/api/v2/kve/{health,instances,storage}`.
