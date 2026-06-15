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
├── ui/                         # Vite + React (kryonix-installer-ui-web)
├── schemas/                    # JSON schema do install plan
├── nix/                        # derivations (package.nix, ui.nix)
└── flake.nix                   # outputs: packages.${system}.{default, kryonix-installer}
```

## Build via Nix

```sh
nix build .#kryonix-installer
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
inputs.kryonix-installer.url = "github:RAGton/kryonix-installer";

# overlay
final: prev: {
  kryonix-installer = inputs.kryonix-installer.packages.${final.system}.kryonix-installer;
}
```

DEV local pode sobrescrever via:

```sh
nix build --override-input kryonix-installer path:../kryonix-installer
```

## Licença

Unfree (uso interno Kryonix).
