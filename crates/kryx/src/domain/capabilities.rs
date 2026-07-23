//! Registry canônico e validação server-side das capabilities do Kryonix.
//!
//! O JSON em `schemas/capabilities.json` é a única fonte de dados. Este módulo
//! somente tipa, valida e projeta esse contrato; não consulta a UI nem runtime.

use std::collections::{BTreeMap, BTreeSet};
use std::fmt;
use std::sync::OnceLock;

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

const REGISTRY_JSON: &str = include_str!("../../../../schemas/capabilities.json");

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum CapabilityStatus {
    Ready,
    Partial,
    Stub,
    Legacy,
    Unsupported,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum CapabilityRisk {
    Low,
    Medium,
    High,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum CapabilityDomain {
    Ai,
    Desktop,
    Dev,
    Editor,
    Mcp,
    Observability,
    Obsidian,
    Remote,
    Security,
    Server,
    Shell,
    Storage,
    Terminal,
    Virtualization,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CapabilityDefinition {
    pub id: String,
    pub wire_key: String,
    #[serde(default)]
    pub level: Option<String>,
    pub domain: CapabilityDomain,
    #[serde(default)]
    pub name: Option<String>,
    #[serde(default)]
    pub risk: Option<CapabilityRisk>,
    pub requires: Vec<String>,
    pub conflicts: Vec<String>,
    pub status: CapabilityStatus,
    #[serde(default)]
    pub reason: Option<String>,
    #[serde(default)]
    pub block_reason: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CapabilityRegistry {
    pub registry_version: u32,
    pub schema_version: u32,
    #[serde(default)]
    pub source: Option<String>,
    pub wire_contract: String,
    #[serde(default)]
    pub invariants: Vec<String>,
    pub capabilities: Vec<CapabilityDefinition>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum CapabilityError {
    RegistryLoad(String),
    InvalidRegistry(String),
    UnknownCapability(String),
    UnsupportedCapability(String),
    MissingDependency {
        capability: String,
        dependency: String,
    },
    ActiveConflict {
        capability: String,
        conflict: String,
    },
    DependencyCycle(String),
}

impl fmt::Display for CapabilityError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::RegistryLoad(error) => {
                write!(f, "falha ao carregar registry de capabilities: {error}")
            }
            Self::InvalidRegistry(error) => write!(f, "registry de capabilities inválido: {error}"),
            Self::UnknownCapability(id) => write!(f, "capability desconhecida: {id}"),
            Self::UnsupportedCapability(id) => write!(f, "capability bloqueada: {id}"),
            Self::MissingDependency {
                capability,
                dependency,
            } => {
                write!(f, "{capability} exige capability ausente: {dependency}")
            }
            Self::ActiveConflict {
                capability,
                conflict,
            } => {
                write!(f, "capabilities conflitantes: {capability} e {conflict}")
            }
            Self::DependencyCycle(id) => write!(f, "ciclo de dependências envolvendo: {id}"),
        }
    }
}

impl std::error::Error for CapabilityError {}

static REGISTRY: OnceLock<Result<CapabilityRegistry, String>> = OnceLock::new();

/// Carrega e valida uma única instância estática do registry canônico.
pub fn capability_registry() -> Result<&'static CapabilityRegistry, CapabilityError> {
    match REGISTRY.get_or_init(|| parse_registry(REGISTRY_JSON)) {
        Ok(registry) => Ok(registry),
        Err(error) => Err(CapabilityError::RegistryLoad(error.clone())),
    }
}

/// Retorna uma capability pelo ID canônico.
pub fn get_capability(id: &str) -> Option<&'static CapabilityDefinition> {
    capability_registry()
        .ok()?
        .capabilities
        .iter()
        .find(|capability| capability.id == id)
}

/// Digest SHA-256 estável do JSON canônico, sem normalização ou campos voláteis.
pub fn registry_digest() -> Result<String, CapabilityError> {
    capability_registry()?;
    let digest = Sha256::digest(REGISTRY_JSON.as_bytes());
    Ok(format!("sha256:{digest:x}"))
}

/// Valida a seleção wire da UI: `features[domain][wireKey] = true`.
pub fn validate_feature_selection(
    selection: &BTreeMap<String, BTreeMap<String, bool>>,
) -> Result<(), CapabilityError> {
    let registry = capability_registry()?;
    let by_id: BTreeMap<&str, &CapabilityDefinition> = registry
        .capabilities
        .iter()
        .map(|capability| (capability.id.as_str(), capability))
        .collect();
    let mut active = BTreeSet::new();

    for (domain, features) in selection {
        for (wire_key, enabled) in features {
            if !enabled {
                continue;
            }

            let canonical_id = format!("{domain}.{wire_key}");
            let capability = by_id.get(canonical_id.as_str()).copied().or_else(|| {
                let mut matches = registry
                    .capabilities
                    .iter()
                    .filter(|candidate| candidate.wire_key == *wire_key);
                let first = matches.next();
                if first.is_some() && matches.next().is_none() {
                    first
                } else {
                    None
                }
            });
            let capability = capability
                .ok_or_else(|| CapabilityError::UnknownCapability(canonical_id.clone()))?;

            if capability.status == CapabilityStatus::Unsupported {
                return Err(CapabilityError::UnsupportedCapability(
                    capability.id.clone(),
                ));
            }
            active.insert(capability.id.clone());
        }
    }

    for id in &active {
        let capability = by_id
            .get(id.as_str())
            .expect("active capability came from registry");
        for dependency in &capability.requires {
            if !active.contains(dependency) {
                return Err(CapabilityError::MissingDependency {
                    capability: id.clone(),
                    dependency: dependency.clone(),
                });
            }
        }
        for conflict in &capability.conflicts {
            if active.contains(conflict) {
                return Err(CapabilityError::ActiveConflict {
                    capability: id.clone(),
                    conflict: conflict.clone(),
                });
            }
        }
    }

    Ok(())
}

fn parse_registry(json: &str) -> Result<CapabilityRegistry, String> {
    let registry: CapabilityRegistry =
        serde_json::from_str(json).map_err(|error| error.to_string())?;
    validate_registry(&registry).map_err(|error| error.to_string())?;
    Ok(registry)
}

fn validate_registry(registry: &CapabilityRegistry) -> Result<(), CapabilityError> {
    if registry.registry_version != 1 || registry.schema_version != 1 {
        return Err(CapabilityError::InvalidRegistry(
            "registryVersion e schemaVersion devem ser 1".into(),
        ));
    }
    if registry.wire_contract != "InstallPlanV2.features" {
        return Err(CapabilityError::InvalidRegistry(
            "wireContract deve ser InstallPlanV2.features".into(),
        ));
    }

    let mut ids = BTreeSet::new();
    for capability in &registry.capabilities {
        if !ids.insert(capability.id.clone()) {
            return Err(CapabilityError::InvalidRegistry(format!(
                "ID duplicado: {}",
                capability.id
            )));
        }
        if capability.wire_key.trim().is_empty() {
            return Err(CapabilityError::InvalidRegistry(format!(
                "wireKey vazio: {}",
                capability.id
            )));
        }
        if capability.status == CapabilityStatus::Unsupported && capability.block_reason.is_none() {
            return Err(CapabilityError::InvalidRegistry(format!(
                "capability unsupported sem blockReason: {}",
                capability.id
            )));
        }
        for reference in capability.requires.iter().chain(&capability.conflicts) {
            if reference == &capability.id {
                return Err(CapabilityError::InvalidRegistry(format!(
                    "autorreferência em {}",
                    capability.id
                )));
            }
            if !ids.contains(reference)
                && !registry
                    .capabilities
                    .iter()
                    .any(|candidate| candidate.id == *reference)
            {
                return Err(CapabilityError::InvalidRegistry(format!(
                    "referência inexistente {} em {}",
                    reference, capability.id
                )));
            }
        }
    }

    let by_id: BTreeMap<&str, &CapabilityDefinition> = registry
        .capabilities
        .iter()
        .map(|capability| (capability.id.as_str(), capability))
        .collect();
    let mut visiting = BTreeSet::new();
    let mut visited = BTreeSet::new();
    for id in by_id.keys() {
        visit_dependency(id, &by_id, &mut visiting, &mut visited)?;
    }
    Ok(())
}

fn visit_dependency(
    id: &str,
    by_id: &BTreeMap<&str, &CapabilityDefinition>,
    visiting: &mut BTreeSet<String>,
    visited: &mut BTreeSet<String>,
) -> Result<(), CapabilityError> {
    if visited.contains(id) {
        return Ok(());
    }
    if !visiting.insert(id.to_string()) {
        return Err(CapabilityError::DependencyCycle(id.to_string()));
    }
    let capability = by_id
        .get(id)
        .expect("dependency traversal starts from registry IDs");
    for dependency in &capability.requires {
        visit_dependency(dependency, by_id, visiting, visited)?;
    }
    visiting.remove(id);
    visited.insert(id.to_string());
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn canonical_registry_has_expected_shape() {
        let registry = capability_registry().unwrap();
        assert_eq!(registry.capabilities.len(), 42);
        assert_eq!(
            registry.capabilities.len(),
            registry
                .capabilities
                .iter()
                .map(|c| &c.id)
                .collect::<BTreeSet<_>>()
                .len()
        );
    }

    #[test]
    fn digest_is_stable_and_sha256() {
        let first = registry_digest().unwrap();
        assert_eq!(first, registry_digest().unwrap());
        assert!(first.starts_with("sha256:"));
        assert_eq!(first.len(), "sha256:".len() + 64);
    }

    #[test]
    fn unsupported_capabilities_have_block_reasons() {
        let registry = capability_registry().unwrap();
        assert!(
            registry
                .capabilities
                .iter()
                .filter(|c| c.status == CapabilityStatus::Unsupported)
                .all(|c| c.block_reason.is_some())
        );
    }

    #[test]
    fn selection_requires_dependencies() {
        let selection = BTreeMap::from([(
            "ai".to_string(),
            BTreeMap::from([("ollama".to_string(), true)]),
        )]);
        assert!(matches!(
            validate_feature_selection(&selection),
            Err(CapabilityError::MissingDependency { .. })
        ));
    }

    #[test]
    fn selection_accepts_virtualization_wire_bucket() {
        let selection = BTreeMap::from([(
            "server".to_string(),
            BTreeMap::from([("podman".to_string(), true)]),
        )]);
        assert!(validate_feature_selection(&selection).is_ok());
    }
}
