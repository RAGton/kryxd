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

## Licença

Unfree (uso interno Kryonix).
