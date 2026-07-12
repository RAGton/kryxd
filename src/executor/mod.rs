pub mod kryonixos;
pub mod nixos;
pub mod partition;
pub mod progress;
pub mod safety;
pub mod target_tree;
pub mod verify;

pub use progress::ProgressEvent;
pub use safety::{SafetyCheck, run_safety_checks};
pub use target_tree::run_preflight;

use std::sync::Arc;
use tokio::sync::broadcast;

use crate::InstallPlan;

pub async fn run_installation(
    plan: &InstallPlan,
    tx: Arc<broadcast::Sender<ProgressEvent>>,
) -> Result<(), String> {
    // ── P0.2: Validar antes de qualquer ação destrutiva ───────────────────────
    //
    // ORDEM CORRETA (antes desta correção, run_disko era a primeira chamada):
    //   1. Gerar target tree (sem tocar disco)
    //   2. Validar preflight estático (arquivos + bad refs)
    //   3. Avaliar flake com `nix eval` (sem tocar disco)
    //   4. Somente então chamar run_disko (DESTRUTIVO)
    //
    // Rationale: se timezone, locale ou features.generated.nix tiver erro de
    // sintaxe Nix, o nixos-install falha DEPOIS de apagar o disco. Com a
    // inversão abaixo, a falha é detectada na fase segura e o disco permanece
    // intocado.

    let _ = tx.send(ProgressEvent {
        step: "kryonixos".into(),
        message: "Gerando target tree (engine + módulos generated)...".into(),
        percent: 20,
    });
    kryonixos::generate_kryonixos_tree(plan, tx.clone()).await?;

    // Preflight estático: verifica arquivos + bad refs (sem executar nix).
    let _ = tx.send(ProgressEvent {
        step: "preflight".into(),
        message: "Validando target flake (arquivos + bad refs)...".into(),
        percent: 38,
    });
    let report = target_tree::run_preflight_install_gate().await?;
    if !report.passed() {
        return Err(format!(
            "Preflight do target falhou: bad_refs={:?} target_flake_exists={} engine_flake_exists={} features_generated_exists={} hardware_generated_exists={}",
            report.bad_references,
            report.target_flake_exists,
            report.engine_flake_exists,
            report.features_generated_exists,
            report.hardware_generated_exists,
        ));
    }

    // Avaliação Nix do target flake ANTES de qualquer ação destrutiva.
    // Detecta erros de sintaxe Nix em features/network/users.generated.nix
    // antes que o disco seja apagado.
    let _ = tx.send(ProgressEvent {
        step: "preflight".into(),
        message: "Avaliando target flake com nix eval (pré-destrutivo)...".into(),
        percent: 42,
    });
    target_tree::eval_target_flake(plan, tx.clone()).await?;

    // ── PONTO DE NÃO-RETORNO: disco será apagado a partir daqui ─────────────
    let _ = tx.send(ProgressEvent {
        step: "partition".into(),
        message: "Iniciando particionamento (ação destrutiva)...".into(),
        percent: 45,
    });
    partition::run_disko(plan, tx.clone()).await?;

    // NÃO removemos /mnt/etc/kryonixos/flake.lock aqui: ele foi gerado
    // explicitamente em target_tree::pre_lock_target() para imobilizar o
    // tree antes do nixos-install. Sem este lock pré-existente, nixos-install
    // escreveria um durante a avaliação e provocaria "NAR hash mismatch".
    
    // IMPORTANTE: Como particionamos o disco agora, precisamos regenerar o
    // hardware.generated.nix para que o nixos-generate-config detecte os UUIDs
    // reais das partições criadas (em vez do dummy que passamos no nix eval).
    let _ = tx.send(ProgressEvent {
        step: "kryonixos".into(),
        message: "Regerando hardware.generated.nix com UUIDs reais...".into(),
        percent: 50,
    });
    target_tree::write_hardware_generated(plan).await?;

    nixos::run_nixos_install(plan, tx.clone()).await?;

    // Prova estrutural antes de declarar sucesso: GPT + root populado +
    // bootloader. Sem isto, um disco intocado seria reportado como PASS.
    let _ = tx.send(ProgressEvent {
        step: "verify".into(),
        message: "Verificando estrutura do disco (GPT/ESP/root)...".into(),
        percent: 95,
    });
    verify::verify_disk_install(plan).await?;

    // Só agora marcamos a instalação como concluída (caminho vivo).
    verify::write_install_flag().await?;

    let _ = tx.send(ProgressEvent {
        step: "done".into(),
        message: "Disco verificado: GPT, root e bootloader presentes.".into(),
        percent: 100,
    });

    Ok(())
}

#[cfg(test)]
mod tests {
    /// Garante que a ORDEM do pipeline está correta:
    /// kryonixos (tree gen) → preflight → eval_target_flake → disko (destrutivo).
    ///
    /// Lê o source do próprio módulo para verificar que run_disko NÃO é a
    /// primeira chamada em run_installation.
    #[test]
    fn test_pipeline_order_disko_is_not_first() {
        let source = include_str!("mod.rs");

        // generate_kryonixos_tree deve aparecer ANTES de run_disko
        let pos_tree = source
            .find("kryonixos::generate_kryonixos_tree")
            .expect("generate_kryonixos_tree deve estar em mod.rs");
        let pos_disko = source
            .find("partition::run_disko")
            .expect("run_disko deve estar em mod.rs");
        assert!(
            pos_tree < pos_disko,
            "generate_kryonixos_tree ({pos_tree}) deve aparecer ANTES de run_disko ({pos_disko})"
        );

        // eval_target_flake deve aparecer ANTES de run_disko
        let pos_eval = source
            .find("target_tree::eval_target_flake")
            .expect("eval_target_flake deve estar em mod.rs");
        assert!(
            pos_eval < pos_disko,
            "eval_target_flake ({pos_eval}) deve aparecer ANTES de run_disko ({pos_disko})"
        );
    }
}
