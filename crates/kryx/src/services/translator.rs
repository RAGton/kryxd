use crate::domain::config::{InstallPlanV2, NetworkMode, Topology, WanNetworkMode};

/// Gera a configuração Nix declarativa baseada no plano de instalação.
pub fn generate_nix_config(plan: &InstallPlanV2) -> Result<String, String> {
    let mut config = String::new();

    // 1. Cabecalho
    config.push_str("{ config, lib, ... }:\n");
    config.push_str("{\n");

    // 2. Node Think Server (KCP)
    //
    // O bloco canônico é `plan.node_think`. A flag legada
    // `plan.is_think_server` (boolean simples, aposentada) é mantida
    // por compatibilidade com payloads V2 antigos: quando `true`, é
    // tratada como `node_think.enable = true` com `hostId` ausente
    // (uso sem ZFS, edge Think legado).
    //
    // A diretriz Nix `node.thinkServer.hostId` só é emitida quando o
    // `hostId` está presente e não-vazio — o tradutor NÃO infere nem
    // inventa o identificador. Quando ausente, o módulo Nix fica
    // responsável por gerar o próprio (ou recusar, se ZFS exigir).
    //
    // Quando `enable` for `true`, a WAN já foi validada como
    // obrigatória pelo validador de contrato
    // (validate_node_think_plan). Aqui só emitimos as diretivas.
    let think_enabled = plan
        .node_think
        .as_ref()
        .is_some_and(|t| t.enable)
        || plan.is_think_server;
    if think_enabled {
        config.push_str("  node.thinkServer.enable = true;\n");
        let host_id = plan.node_think.as_ref().and_then(|t| t.host_id.as_ref());
        if let Some(id) = host_id {
            let trimmed = id.trim();
            if !trimmed.is_empty() {
                config.push_str(&format!(
                    "  node.thinkServer.hostId = \"{}\";\n",
                    trimmed
                ));
            }
        }
    }

    // 3. Storage Topology
    let topology_str = match plan.storage.topology {
        Topology::Single => "single",
        Topology::Split => "split",
        Topology::Raid => "raid",
        Topology::Manual => "manual",
    };
    config.push_str(&format!(
        "  kryonix.storage.topology = \"{}\";\n",
        topology_str
    ));

    // System Disks
    if !plan.storage.system_disks.is_empty() {
        let disks = plan
            .storage
            .system_disks
            .iter()
            .map(|d| format!("\"{}\"", d))
            .collect::<Vec<_>>()
            .join(" ");
        config.push_str(&format!("  kryonix.storage.systemDisks = [ {} ];\n", disks));
    }

    // Data Disks
    if !plan.storage.data_disks.is_empty() {
        let disks = plan
            .storage
            .data_disks
            .iter()
            .map(|d| format!("\"{}\"", d))
            .collect::<Vec<_>>()
            .join(" ");
        config.push_str(&format!("  kryonix.storage.dataDisks = [ {} ];\n", disks));
    }

    // Filesystems
    if let Some(root) = &plan.storage.root {
        let fs_str = format!("{:?}", root.filesystem).to_lowercase();
        config.push_str(&format!(
            "  kryonix.storage.root.filesystem = \"{}\";\n",
            fs_str
        ));
    }

    if let Some(data) = &plan.storage.data {
        let fs_str = format!("{:?}", data.filesystem).to_lowercase();
        config.push_str(&format!(
            "  kryonix.storage.data.filesystem = \"{}\";\n",
            fs_str
        ));
    }

    // Quotas (ZFS / BTRFS)
    if let Some(zfs) = &plan.storage.zfs {
        config.push_str(&format!(
            "  kryonix.storage.zfs.userRefquota = \"{}\";\n",
            zfs.user_refquota
        ));
    }

    if let Some(btrfs) = &plan.storage.btrfs {
        config.push_str(&format!(
            "  kryonix.storage.btrfs.userQgroupLimit = \"{}\";\n",
            btrfs.user_qgroup_limit
        ));
    }

    // 4. Features
    for (category, feature_map) in &plan.features {
        for (feature, enabled) in feature_map {
            if *enabled {
                config.push_str(&format!(
                    "  kryonix.features.{}.{} = true;\n",
                    category, feature
                ));
            }
        }
    }

    // 5. Network — emite diretivas `networking.*` quando o plano traz o bloco.
    //
    // KCR-2026-07-31-01 Etapa 4: O V2 passa a assumir a rede declarativa
    // (Caminho 1). O translator mapeia o `NetworkPlan` para diretivas
    // nativas do NixOS. A senha PPPoE NUNCA aparece no output — o backend
    // escreve o arquivo em `/etc/kryonix/secrets/pppoe-<iface>` via
    // `InstallSecretsV2`, e o translator emite apenas a referência
    // `passwordFile`. Espelha o padrão já existente de `adminPasswordFile`.
    if let Some(network) = &plan.network {
        emit_management_network(&mut config, &network.management);
        if let Some(wan) = &network.wan {
            emit_wan_network(&mut config, wan);
        }
    }

    // Fim do módulo
    config.push_str("}\n");

    Ok(config)
}

/// Emite `networking.hostName` + `interfaces.<iface>.ipv4.addresses` para
/// a interface de management (LAN/PXE). Em DHCP, emite apenas o nome
/// de host (o NixOS cuida do `dhcpcd` por padrão).
fn emit_management_network(config: &mut String, mgmt: &crate::domain::config::ManagementNetwork) {
    config.push_str(&format!("  networking.hostName = \"{}\";\n", mgmt.hostname));

    match mgmt.mode {
        NetworkMode::Dhcp => {
            // dhcpcd é o default no NixOS — sem diretiva explícita.
            // Apenas referenciamos a interface para garantir que ela suba.
            config.push_str(&format!(
                "  networking.interfaces.{}.useDHCP = true;\n",
                mgmt.interface
            ));
        }
        NetworkMode::Static => {
            let addr = mgmt.address.as_deref().unwrap_or("0.0.0.0");
            config.push_str(&format!(
                "  networking.interfaces.{}.ipv4.addresses = [ {{ address = \"{}\"; prefixLength = {}; }} ];\n",
                mgmt.interface, addr, mgmt.prefix_length
            ));

            if !mgmt.dns.is_empty() {
                let nameservers = mgmt
                    .dns
                    .iter()
                    .map(|d| format!("\"{}\"", d))
                    .collect::<Vec<_>>()
                    .join(" ");
                config.push_str(&format!(
                    "  networking.nameservers = [ {} ];\n",
                    nameservers
                ));
            }

            if let Some(gw) = &mgmt.gateway {
                config.push_str(&format!("  networking.defaultGateway = \"{}\";\n", gw));
            }
        }
    }
}

/// Emite diretivas para a interface WAN (DHCP / Static / PPPoE).
///
/// Em PPPoE, emite `networking.pppoe.<iface>.{enable, username,
/// passwordFile}`. A senha é provisionada em runtime via
/// `InstallSecretsV2` → `/etc/kryonix/secrets/pppoe-<iface>` (0600).
fn emit_wan_network(config: &mut String, wan: &crate::domain::config::WanNetwork) {
    match wan.mode {
        WanNetworkMode::Dhcp => {
            config.push_str(&format!(
                "  networking.interfaces.{}.useDHCP = true;\n",
                wan.interface
            ));
        }
        WanNetworkMode::Static => {
            let addr = wan.address.as_deref().unwrap_or("0.0.0.0");
            let prefix = wan.prefix_length.unwrap_or(24);
            config.push_str(&format!(
                "  networking.interfaces.{}.ipv4.addresses = [ {{ address = \"{}\"; prefixLength = {}; }} ];\n",
                wan.interface, addr, prefix
            ));
            if let Some(gw) = &wan.gateway {
                config.push_str(&format!("  networking.defaultGateway = \"{}\";\n", gw));
            }
        }
        WanNetworkMode::Pppoe => {
            let user = wan.pppoe_user.as_deref().unwrap_or("");
            // NOTA: senha NUNCA vai no Nix config. O translator emite
            // apenas o `passwordFile` que será provisionado pelo handler
            // `/api/v2/secrets` em modo 0600 antes do `switch`.
            config.push_str(&format!(
                "  networking.pppoe.{}.enable = true;\n",
                wan.interface
            ));
            config.push_str(&format!(
                "  networking.pppoe.{}.username = \"{}\";\n",
                wan.interface, user
            ));
            config.push_str(&format!(
                "  networking.pppoe.{}.passwordFile = \"/etc/kryonix/secrets/pppoe-{}\";\n",
                wan.interface, wan.interface
            ));
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::config::{
        Encryption, FileSystem, ManagementNetwork, MountPlan, NetworkPlan, RepositoryPlan,
        StoragePlan, WanNetwork, ZfsStoragePlan,
    };
    use std::collections::BTreeMap;

    #[test]
    fn test_think_server_translation() {
        let mut features = BTreeMap::new();
        let mut server_features = BTreeMap::new();
        server_features.insert("containers".to_string(), true);
        features.insert("server".to_string(), server_features);

        let plan = InstallPlanV2 {
            version: 2,
            is_think_server: false,
            node_think: Some(crate::domain::config::NodeThinkPlan {
                enable: true,
                host_id: Some("8425e349".to_string()),
            }),
            repository: RepositoryPlan {
                core_url: "url".to_string(),
                upstream_url: "url".to_string(),
                downstream_url: "url".to_string(),
                branch: "main".to_string(),
            },
            network: None,
            storage: StoragePlan {
                topology: Topology::Split,
                system_disks: vec!["/dev/sda".to_string()],
                data_disks: vec!["/dev/sdb".to_string()],
                root: Some(MountPlan {
                    filesystem: FileSystem::Ext4,
                    encryption: Encryption::None,
                }),
                data: Some(MountPlan {
                    filesystem: FileSystem::Zfs,
                    encryption: Encryption::Luks2,
                }),
                raid_level: None,
                manual_partitions: vec![],
                zfs: Some(ZfsStoragePlan {
                    user_refquota: "100G".to_string(),
                }),
                btrfs: None,
            },
            features,
        };

        let result = generate_nix_config(&plan).unwrap();

        assert!(result.contains("node.thinkServer.enable = true;"));
        assert!(result.contains("node.thinkServer.hostId = \"8425e349\";"));
        assert!(!result.contains("kryonix.thinkServer"));
        assert!(result.contains("kryonix.storage.topology = \"split\";"));
        assert!(result.contains("kryonix.storage.systemDisks = [ \"/dev/sda\" ];"));
        assert!(result.contains("kryonix.storage.dataDisks = [ \"/dev/sdb\" ];"));
        assert!(result.contains("kryonix.storage.root.filesystem = \"ext4\";"));
        assert!(result.contains("kryonix.storage.data.filesystem = \"zfs\";"));
        assert!(result.contains("kryonix.storage.zfs.userRefquota = \"100G\";"));
        assert!(result.contains("kryonix.features.server.containers = true;"));
    }

    #[test]
    fn test_think_server_disabled_emits_nothing() {
        let plan = InstallPlanV2 {
            version: 2,
            is_think_server: false,
            node_think: Some(crate::domain::config::NodeThinkPlan {
                enable: false,
                host_id: Some("deadbeef".to_string()),
            }),
            repository: RepositoryPlan {
                core_url: "url".to_string(),
                upstream_url: "url".to_string(),
                downstream_url: "url".to_string(),
                branch: "main".to_string(),
            },
            network: None,
            storage: StoragePlan {
                topology: Topology::Single,
                system_disks: vec!["/dev/nvme0n1".to_string()],
                data_disks: vec![],
                root: Some(MountPlan {
                    filesystem: FileSystem::Ext4,
                    encryption: Encryption::None,
                }),
                data: None,
                raid_level: None,
                manual_partitions: vec![],
                zfs: None,
                btrfs: None,
            },
            features: BTreeMap::new(),
        };

        let result = generate_nix_config(&plan).unwrap();

        assert!(!result.contains("node.thinkServer"));
        assert!(!result.contains("kryonix.thinkServer"));
    }

    #[test]
    fn test_node_think_absent_emits_nothing() {
        let plan = InstallPlanV2 {
            version: 2,
            is_think_server: false,
            node_think: None,
            repository: RepositoryPlan {
                core_url: "url".to_string(),
                upstream_url: "url".to_string(),
                downstream_url: "url".to_string(),
                branch: "main".to_string(),
            },
            network: None,
            storage: StoragePlan {
                topology: Topology::Single,
                system_disks: vec!["/dev/nvme0n1".to_string()],
                data_disks: vec![],
                root: Some(MountPlan {
                    filesystem: FileSystem::Ext4,
                    encryption: Encryption::None,
                }),
                data: None,
                raid_level: None,
                manual_partitions: vec![],
                zfs: None,
                btrfs: None,
            },
            features: BTreeMap::new(),
        };

        let result = generate_nix_config(&plan).unwrap();

        assert!(!result.contains("node.thinkServer"));
        assert!(!result.contains("kryonix.thinkServer"));
    }

    // ── KCR-2026-07-31-01 Etapa 4: translator.rs emite networking.* ─────────

    fn network_plan_dhcp_management_only() -> NetworkPlan {
        NetworkPlan {
            management: ManagementNetwork {
                interface: "enp1s0".to_string(),
                mode: NetworkMode::Dhcp,
                address: None,
                prefix_length: 24,
                gateway: None,
                dns: vec![],
                hostname: "kryonix-edge-01".to_string(),
            },
            wan: None,
        }
    }

    fn network_plan_static_management_with_pppoe_wan() -> NetworkPlan {
        NetworkPlan {
            management: ManagementNetwork {
                interface: "enp1s0".to_string(),
                mode: NetworkMode::Static,
                address: Some("192.168.1.10".to_string()),
                prefix_length: 24,
                gateway: Some("192.168.1.1".to_string()),
                dns: vec!["1.1.1.1".to_string(), "8.8.8.8".to_string()],
                hostname: "kryonix-think-pppoe".to_string(),
            },
            wan: Some(WanNetwork {
                interface: "enp2s0".to_string(),
                mode: WanNetworkMode::Pppoe,
                address: None,
                prefix_length: None,
                gateway: None,
                dns: vec![],
                pppoe_user: Some("cliente@provedor.net".to_string()),
            }),
        }
    }

    fn plan_with(network: Option<NetworkPlan>) -> InstallPlanV2 {
        InstallPlanV2 {
            version: 2,
            is_think_server: false,
            node_think: None,
            repository: RepositoryPlan {
                core_url: "url".to_string(),
                upstream_url: "url".to_string(),
                downstream_url: "url".to_string(),
                branch: "main".to_string(),
            },
            network,
            storage: StoragePlan {
                topology: Topology::Single,
                system_disks: vec!["/dev/nvme0n1".to_string()],
                data_disks: vec![],
                root: Some(MountPlan {
                    filesystem: FileSystem::Ext4,
                    encryption: Encryption::None,
                }),
                data: None,
                raid_level: None,
                manual_partitions: vec![],
                zfs: None,
                btrfs: None,
            },
            features: BTreeMap::new(),
        }
    }

    #[test]
    fn test_translates_dhcp_management_only() {
        // KCR #5: DHCP management sem WAN — emite hostName + useDHCP,
        // NÃO emite diretivas WAN (sem bloco wan).
        let result =
            generate_nix_config(&plan_with(Some(network_plan_dhcp_management_only()))).unwrap();

        assert!(result.contains("networking.hostName = \"kryonix-edge-01\";"));
        assert!(result.contains("networking.interfaces.enp1s0.useDHCP = true;"));
        assert!(!result.contains("networking.interfaces.enp1s0.ipv4"));
        assert!(!result.contains("networking.defaultGateway"));
        assert!(!result.contains("networking.nameservers"));
        assert!(!result.contains("networking.pppoe"));
        assert!(!result.contains("enp2s0"));
    }

    #[test]
    fn test_translates_pppoe_wan_emits_password_file_reference() {
        // KCR #6: PPPoE WAN — emite passwordFile reference (sem senha).
        // CRÍTICO: senha NUNCA pode aparecer no Nix config.
        let result = generate_nix_config(&plan_with(Some(
            network_plan_static_management_with_pppoe_wan(),
        )))
        .unwrap();

        // Management static: address/gateway/nameservers/hostname
        assert!(result.contains("networking.hostName = \"kryonix-think-pppoe\";"));
        assert!(result.contains(
            "networking.interfaces.enp1s0.ipv4.addresses = [ { address = \"192.168.1.10\"; prefixLength = 24; } ];"
        ));
        assert!(result.contains("networking.defaultGateway = \"192.168.1.1\";"));
        assert!(result.contains("networking.nameservers = [ \"1.1.1.1\" \"8.8.8.8\" ];"));

        // WAN PPPoE: enable + username + passwordFile reference (sem senha)
        assert!(result.contains("networking.pppoe.enp2s0.enable = true;"));
        assert!(result.contains("networking.pppoe.enp2s0.username = \"cliente@provedor.net\";"));
        assert!(result.contains(
            "networking.pppoe.enp2s0.passwordFile = \"/etc/kryonix/secrets/pppoe-enp2s0\";"
        ));

        // Garantias negativas — o que NÃO pode estar presente
        assert!(!result.contains("networking.interfaces.enp2s0"));
        assert!(!result.contains("networking.interfaces.enp2s0.ipv4"));
        assert!(
            !result.contains("password = "),
            "PPPoE password MUST NOT appear in Nix config"
        );
        assert!(!result.contains("provedorSecret")); // qualquer placeholder de senha hipotético
    }

    #[test]
    fn test_translates_no_network_emits_nothing() {
        // KCR #7: network: None → nenhuma diretiva networking.* no output.
        let result = generate_nix_config(&plan_with(None)).unwrap();

        assert!(!result.contains("networking."));
        assert!(!result.contains("networking.hostName"));
        assert!(!result.contains("networking.interfaces"));
        assert!(!result.contains("networking.pppoe"));
        assert!(!result.contains("useDHCP"));
        assert!(!result.contains("nameservers"));
        assert!(!result.contains("defaultGateway"));

        // Demais blocos continuam emitindo normalmente (sanity)
        assert!(result.contains("kryonix.storage.topology"));
        assert!(!result.contains("node.thinkServer"));
    }
}
