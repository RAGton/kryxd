//! Segredos efêmeros recebidos separadamente do plano persistível.

use secrecy::SecretString;
use serde::Deserialize;

/// Segredos necessários durante a instalação.
///
/// A ausência deliberada de `Serialize`, `Clone` e `Debug` impede persistência
/// ou exposição acidental pelas APIs usuais do backend.
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct InstallSecretsV2 {
    pub admin_password: SecretString,
    pub pppoe_password: Option<SecretString>,
}

#[cfg(test)]
mod tests {
    use secrecy::ExposeSecret;

    use super::*;

    #[test]
    fn deserializes_secrets_from_the_dedicated_payload() {
        let secrets: InstallSecretsV2 = serde_json::from_value(serde_json::json!({
            "adminPassword": "correct horse battery staple",
            "pppoePassword": "provider-secret"
        }))
        .unwrap();

        assert_eq!(
            secrets.admin_password.expose_secret(),
            "correct horse battery staple"
        );
        assert_eq!(
            secrets
                .pppoe_password
                .as_ref()
                .map(|secret| secret.expose_secret()),
            Some("provider-secret")
        );
    }

    #[test]
    fn rejects_unknown_secret_field() {
        let result = serde_json::from_value::<InstallSecretsV2>(serde_json::json!({
            "adminPassword": "correct horse battery staple",
            "token": "must-not-be-accepted"
        }));

        assert!(result.is_err());
    }
}
