# Kryonix Installer

Backend Axum (Rust) + web UI (Vite + React) que orquestra a instalação do
KryonixOS sobre NixOS — particionamento via disko, geração do target flake v2
(`/mnt/etc/kryonixos`) e execução do `nixos-install` a partir de um plano
declarativo (`install-plan.json`).

Este repositório é a fonte canônica do installer. O motor Kryonix
(`https://github.com/RAGton/kryonix`) consome-o como flake input.

## Layout

```
.
├── Cargo.toml / Cargo.lock     # backend Rust (Axum, tokio, walkdir, …)
├── src/                        # executor, network, disk, auth, target_tree, …
├── ui/                         # Vite + React (kryxd-ui)
├── schemas/                    # JSON schema do install plan
├── nix/                        # derivations (package.nix, ui.nix)
└── flake.nix                   # outputs: packages.${system}.{default, kryxd}
```

## Build via Nix

```sh
nix build .#kryxd
nix flake check --keep-going
nix flake show --all-systems
```

## Desenvolvimento Rust

```sh
cargo fmt --all -- --check
cargo clippy --all-targets --all-features -- -D warnings
cargo test --locked
```

## Desenvolvimento UI

```sh
cd ui
npm ci
npm test
npm run build
```

## Consumir do motor Kryonix

```nix
# flake.nix
inputs.kryxd.url = "github:RAGton/kryxd";

# overlay
final: prev: {
  kryxd = inputs.kryxd.packages.${final.system}.kryxd;
}
```

DEV local pode sobrescrever via:

```sh
nix build --override-input kryxd path:../kryxd
```

## Componentes recentes

### KVE — Kryonix Virtualization Engine

Provider de virtualização do instalador, consumindo o socket Unix do
**Incus** (`/var/lib/incus/unix.socket`) para listar e operar instâncias sem
depender da CLI `incus` no PATH. Modelos de domínio (VM/container, CPU, RAM,
disco) vivem em `src/services/kve.rs` e `src/api/virt.rs`.

Endpoints expostos (via Axum, porta 8080):

- `GET /api/v1/virt/nodes` — lista nós/instâncias (`incus list --format=json`)
- `POST /api/v1/virt/instances` — lança instância (`incus launch`) com
  `InstanceConfig { name, is_vm, image, cpu, ram_mb, disk_gb }` e AppArmor
  `raw.lxc` para containers.

> Branch ativa de desenvolvimento: `feat/kve-incus-read`. O provider Unix
> socket é a fonte canônica; a chamada via binário `incus` é fallback.

### kryx-cli HTTP client

`kryxd` expõe sua API para ser consumida pela CLI unificada `kryx` (subcomando
`kcp`/`think` em `pr-13-kcp-cli-proxy`). O client HTTP vive em
`src/api/` e segue o contrato OpenAPI em `openapi.yaml`.

## Documentação interna

- `docs/FRONTEND_BACKEND_CONTRACT.md` — contrato UI ↔ API.
- `docs/audits/` — auditorias de capability registry e migração de testes.
- `docs/ai/notebooklm/` — templates de auditoria MCP/NotebookLM.

## Licença

Unfree (uso interno Kryonix).

---

## Compatibilidade

| Componente | Versao |
|---|---|
| NixOS | 26.05 (Kryonix OS) |
| Kryonix (meta) | 26.05 |
| Rust | toolchain 1.86 (Axum 0.7) |
| Node.js | 22.x (Vite + React) |

## Repos relacionados

Este repo integra com (cross-links via `../<repo>/README.md`):

- [`kryonix`](../kryonix/): motor / core da distro
- [`kryonixos`](../kryonixos/): downstream / hosts reais
- [`kryx-cli`](../kryx-cli/): CLI publicado `kryx`
- [`kryonix-brain-lightrag`](../kryonix-brain-lightrag/): RAG engine (LightRAG)
- [`kryonix-home`](../kryonix-home/): organizador de home directory
- [`kryonix-aura`](../kryonix-aura/): agente Aura + automação
- [`kryonix-assets`](../kryonix-assets/): wallpapers, temas, branding
- [`kryonix-vault`](../kryonix-vault/): Obsidian vault (memória)

Veja [`AGENTS.md`](../../AGENTS.md) do meta-repo para a visao consolidada.

## Changelog

- **2026-08-02**: sincronizado com template canonico ([`agents/kryonix-core/README-TEMPLATE.md`](../../agents/kryonix-core/README-TEMPLATE.md)) — secao Compatibilidade + Repos relacionados adicionadas. Conteudo existente preservado.
- **2026-08-02**: KCP daemon + Installer backend + UI (refs KCR-UI-1, KCR-UI-2)
