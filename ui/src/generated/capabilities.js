// Gerado por scripts/generate-ui-contracts.mjs — não editar manualmente.
export const CAPABILITY_REGISTRY = {
  "registryVersion": 1,
  "schemaVersion": 1,
  "source": "kryxd/ui/src/data/featureCatalog.js",
  "wireContract": "InstallPlanV2.features",
  "capabilities": [
    {
      "id": "ai.claude",
      "wireKey": "claude",
      "level": "user",
      "domain": "ai",
      "name": "Claude Desktop",
      "requires": [],
      "conflicts": [],
      "status": "ready"
    },
    {
      "id": "ai.gemini",
      "wireKey": "gemini",
      "level": "user",
      "domain": "ai",
      "name": "Gemini Web Wrapper",
      "requires": [],
      "conflicts": [],
      "status": "ready"
    },
    {
      "id": "ai.kryonix-brain",
      "wireKey": "kryonix-brain",
      "level": "system",
      "domain": "ai",
      "name": "Kryonix Brain",
      "requires": [
        "storage.srv-data",
        "ai.neo4j",
        "ai.lightrag",
        "ai.ollama"
      ],
      "conflicts": [],
      "status": "ready"
    },
    {
      "id": "ai.lightrag",
      "wireKey": "lightrag",
      "level": "system",
      "domain": "ai",
      "name": "LightRAG",
      "requires": [
        "storage.srv-data"
      ],
      "conflicts": [],
      "status": "stub"
    },
    {
      "id": "ai.neo4j",
      "wireKey": "neo4j",
      "level": "system",
      "domain": "ai",
      "name": "Neo4j",
      "requires": [
        "storage.srv-data"
      ],
      "conflicts": [],
      "status": "ready"
    },
    {
      "id": "ai.ollama",
      "wireKey": "ollama",
      "level": "system",
      "domain": "ai",
      "name": "Ollama",
      "requires": [
        "storage.srv-data"
      ],
      "conflicts": [],
      "status": "partial"
    },
    {
      "id": "ai.open-webui",
      "wireKey": "open-webui",
      "level": "system",
      "domain": "ai",
      "name": "Open WebUI",
      "requires": [
        "ai.ollama"
      ],
      "conflicts": [],
      "status": "stub"
    },
    {
      "id": "desktop.audio",
      "wireKey": "audio",
      "level": "system",
      "domain": "desktop",
      "name": "PipeWire Audio",
      "requires": [],
      "conflicts": [],
      "status": "ready"
    },
    {
      "id": "desktop.bluetooth",
      "wireKey": "bluetooth",
      "level": "system",
      "domain": "desktop",
      "name": "Bluetooth",
      "requires": [],
      "conflicts": [],
      "status": "ready"
    },
    {
      "id": "desktop.kde-shortcuts",
      "wireKey": "kde-shortcuts",
      "level": "user",
      "domain": "desktop",
      "name": "KDE Expert Shortcuts",
      "requires": [
        "desktop.plasma"
      ],
      "conflicts": [],
      "status": "ready"
    },
    {
      "id": "desktop.kvantum-theme",
      "wireKey": "kvantum-theme",
      "level": "user",
      "domain": "desktop",
      "name": "Kvantum Theming",
      "requires": [
        "desktop.plasma"
      ],
      "conflicts": [],
      "status": "ready"
    },
    {
      "id": "desktop.lock-screen-theme",
      "wireKey": "lock-screen-theme",
      "level": "user",
      "domain": "desktop",
      "name": "Kryonix Lock Screen",
      "requires": [
        "desktop.plasma"
      ],
      "conflicts": [],
      "status": "ready"
    },
    {
      "id": "desktop.plasma",
      "wireKey": "plasma",
      "level": "system",
      "domain": "desktop",
      "name": "KDE Plasma",
      "requires": [],
      "conflicts": [],
      "status": "ready"
    },
    {
      "id": "desktop.printing",
      "wireKey": "printing",
      "level": "system",
      "domain": "desktop",
      "name": "CUPS Printing",
      "requires": [],
      "conflicts": [],
      "status": "ready"
    },
    {
      "id": "dev.jupyter",
      "wireKey": "jupyter",
      "level": "user",
      "domain": "dev",
      "name": "Jupyter Notebook",
      "requires": [
        "dev.python"
      ],
      "conflicts": [],
      "status": "ready"
    },
    {
      "id": "dev.nix",
      "wireKey": "nix",
      "level": "user",
      "domain": "dev",
      "name": "Nix Tooling",
      "requires": [],
      "conflicts": [],
      "status": "ready"
    },
    {
      "id": "dev.python",
      "wireKey": "python",
      "level": "user",
      "domain": "dev",
      "name": "Python Environment",
      "requires": [],
      "conflicts": [],
      "status": "ready"
    },
    {
      "id": "dev.rust",
      "wireKey": "rust",
      "level": "user",
      "domain": "dev",
      "name": "Rust Toolchain",
      "requires": [],
      "conflicts": [],
      "status": "ready"
    },
    {
      "id": "editor.antigravity",
      "wireKey": "antigravity",
      "level": "user",
      "domain": "dev",
      "name": "Antigravity IDE",
      "requires": [],
      "conflicts": [],
      "status": "ready"
    },
    {
      "id": "editor.vscode-insiders",
      "wireKey": "vscode-insiders",
      "level": "user",
      "domain": "dev",
      "name": "VSCode Insiders",
      "requires": [],
      "conflicts": [],
      "status": "ready"
    },
    {
      "id": "mcp.filesystem",
      "wireKey": "filesystem",
      "level": "system",
      "domain": "mcp",
      "name": "Filesystem MCP",
      "requires": [],
      "conflicts": [],
      "status": "ready"
    },
    {
      "id": "mcp.github",
      "wireKey": "github",
      "level": "system",
      "domain": "mcp",
      "name": "GitHub MCP",
      "requires": [],
      "conflicts": [],
      "status": "ready"
    },
    {
      "id": "mcp.neo4j",
      "wireKey": "neo4j",
      "level": "system",
      "domain": "mcp",
      "name": "Neo4j MCP",
      "requires": [
        "ai.neo4j"
      ],
      "conflicts": [],
      "status": "ready"
    },
    {
      "id": "mcp.ollama",
      "wireKey": "ollama",
      "level": "system",
      "domain": "mcp",
      "name": "Ollama MCP",
      "requires": [
        "ai.ollama"
      ],
      "conflicts": [],
      "status": "ready"
    },
    {
      "id": "observability.grafana",
      "wireKey": "grafana",
      "level": "system",
      "domain": "observability",
      "name": "Grafana",
      "requires": [
        "observability.prometheus"
      ],
      "conflicts": [],
      "status": "ready"
    },
    {
      "id": "observability.prometheus",
      "wireKey": "prometheus",
      "level": "system",
      "domain": "observability",
      "name": "Prometheus",
      "requires": [],
      "conflicts": [],
      "status": "ready"
    },
    {
      "id": "obsidian.vault",
      "wireKey": "vault",
      "level": "user",
      "domain": "ai",
      "name": "Obsidian Integration",
      "requires": [],
      "conflicts": [],
      "status": "ready"
    },
    {
      "id": "remote.openssh",
      "wireKey": "openssh",
      "level": "system",
      "domain": "remote",
      "name": "OpenSSH Server",
      "requires": [],
      "conflicts": [],
      "status": "ready"
    },
    {
      "id": "remote.tailscale",
      "wireKey": "tailscale",
      "level": "system",
      "domain": "remote",
      "name": "Tailscale",
      "requires": [],
      "conflicts": [],
      "status": "ready"
    },
    {
      "id": "remote.vnc",
      "wireKey": "vnc",
      "level": "system",
      "domain": "remote",
      "name": "VNC Server",
      "requires": [
        "desktop.plasma"
      ],
      "conflicts": [],
      "status": "ready"
    },
    {
      "id": "remote.web-installer",
      "wireKey": "web-installer",
      "level": "system",
      "domain": "remote",
      "name": "Kryonix Web Installer",
      "requires": [],
      "conflicts": [],
      "status": "ready"
    },
    {
      "id": "security.firewall",
      "wireKey": "firewall",
      "level": "system",
      "domain": "security",
      "name": "Strict Firewall",
      "requires": [],
      "conflicts": [],
      "status": "ready"
    },
    {
      "id": "security.qemu-guest",
      "wireKey": "qemu-guest",
      "level": "system",
      "domain": "security",
      "name": "QEMU Guest Agent",
      "requires": [],
      "conflicts": [],
      "status": "ready"
    },
    {
      "id": "shell.zsh",
      "wireKey": "zsh",
      "level": "user",
      "domain": "dev",
      "name": "ZSH (Oh My Zsh)",
      "requires": [],
      "conflicts": [],
      "status": "ready"
    },
    {
      "id": "storage.ai-models",
      "wireKey": "ai-models",
      "level": "system",
      "domain": "storage",
      "name": "Pre-cache AI Models",
      "requires": [
        "ai.ollama"
      ],
      "conflicts": [],
      "status": "ready"
    },
    {
      "id": "storage.encryption.luks2",
      "wireKey": "luks2",
      "level": "installer",
      "domain": "storage",
      "name": "LUKS2 encryption",
      "requires": [],
      "conflicts": [],
      "status": "unsupported",
      "reason": "executor ainda rejeita LUKS2",
      "blockReason": "executor ainda rejeita LUKS2"
    },
    {
      "id": "storage.srv-data",
      "wireKey": "srv-data",
      "level": "system",
      "domain": "storage",
      "name": "/srv/data Mount",
      "requires": [],
      "conflicts": [],
      "status": "ready"
    },
    {
      "id": "storage.topology.manual",
      "wireKey": "manual",
      "level": "installer",
      "domain": "storage",
      "name": "Manual topology",
      "requires": [],
      "conflicts": [],
      "status": "unsupported",
      "reason": "renderer executável ainda bloqueado no backend",
      "blockReason": "renderer executável ainda bloqueado no backend"
    },
    {
      "id": "storage.topology.raid",
      "wireKey": "raid",
      "level": "installer",
      "domain": "storage",
      "name": "RAID topology",
      "requires": [],
      "conflicts": [],
      "status": "unsupported",
      "reason": "renderer executável ainda bloqueado no backend",
      "blockReason": "renderer executável ainda bloqueado no backend"
    },
    {
      "id": "terminal.warp",
      "wireKey": "warp",
      "level": "user",
      "domain": "dev",
      "name": "Warp Terminal",
      "requires": [
        "desktop.plasma"
      ],
      "conflicts": [],
      "status": "ready"
    },
    {
      "id": "virtualization.libvirt",
      "wireKey": "libvirt",
      "level": "system",
      "domain": "server",
      "name": "Libvirt / KVM",
      "requires": [],
      "conflicts": [],
      "status": "partial"
    },
    {
      "id": "virtualization.podman",
      "wireKey": "podman",
      "level": "system",
      "domain": "server",
      "name": "Podman",
      "requires": [],
      "conflicts": [],
      "status": "ready"
    }
  ],
  "invariants": [
    "IDs são únicos",
    "wireKey é a chave curta dentro do domínio",
    "status unsupported nunca pode ser promovido automaticamente",
    "registry não contém secrets"
  ]
};
export const CAPABILITIES = Object.freeze(CAPABILITY_REGISTRY.capabilities);
export const CAPABILITY_BY_ID = Object.freeze(Object.fromEntries(CAPABILITIES.map((capability) => [capability.id, capability])));
export const UNSUPPORTED_CAPABILITY_IDS = Object.freeze(CAPABILITIES.filter((capability) => capability.status === 'unsupported').map((capability) => capability.id));
