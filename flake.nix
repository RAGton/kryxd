{
  description = "kryxd — Kryonix Daemon for continuous datacenter orchestration (Axum backend + Vite/React UI).";

  inputs = {
    nixpkgs.url = "github:nixos/nixpkgs/nixos-26.05";
  };

  outputs =
    { self, nixpkgs }:
    let
      systems = [
        "x86_64-linux"
        "aarch64-linux"
      ];

      forEachSystem = nixpkgs.lib.genAttrs systems;

      pkgsFor =
        system:
        import nixpkgs {
          inherit system;
          config.allowUnfree = true;
        };
    in
    {
      packages = forEachSystem (
        system:
        let
          pkgs = pkgsFor system;
          kryxdUi = pkgs.callPackage ./nix/ui.nix { };
          kryxd = pkgs.callPackage ./nix/package.nix { inherit kryxdUi; };
        in
        {
          inherit kryxd;
          inherit kryxdUi;
          default = kryxd;
        }
      );

      # `nix flake check` builds these.
      # - cargo-tests: o próprio build do package roda `cargo test` por padrão
      #   (rustPlatform.buildRustPackage). Reusar o package como check evita
      #   duplicação e mantém o lock único.
      # - ui-build: garante que a UI builda isoladamente (sem depender da Rust).
      checks = forEachSystem (
        system:
        let
          pkgs = pkgsFor system;
        in
        {
          cargo-tests = self.packages.${system}.kryxd;
          ui-build = self.packages.${system}.kryxdUi;
        }
      );

      formatter = forEachSystem (system: (pkgsFor system).nixfmt-rfc-style);
    };
}
