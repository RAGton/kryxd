#!/usr/bin/env bash
set -euo pipefail

echo "[+] Iniciando captura de evidências de UI e Testes..."

# Configuração de caminhos e arquivos
# Baseado na execução a partir da raiz de repos/kryxd
EVIDENCE_DIR="../kryonix-vault/09-Logs/evidence"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
TAR_FILE="evidence_${TIMESTAMP}.tar.gz"

mkdir -p "$EVIDENCE_DIR"

# 1. Executar testes e2e / capturar screenshot da interface React
echo "[+] Executando dry-run da interface (Playwright)..."
# Assume-se que o npm run test:e2e gera screenshots em ui/screenshots/
npm run test:e2e || echo "[-] Aviso: Testes da UI reportaram erros, prosseguindo para captura."

# 2. Executar testes do backend (Rust)
echo "[+] Executando testes do backend (Rust)..."
cargo test --locked --quiet > backend_test_log.txt 2>&1 || echo "[-] Aviso: Algum teste Rust falhou, log capturado."

# 3. Empacotar evidências
echo "[+] Consolidando artefatos..."
# Se houver uma pasta de screenshots padrão (ex: ui/screenshots), arquiva junto com o log
if [ -d "ui/screenshots" ]; then
    tar -czf "$EVIDENCE_DIR/$TAR_FILE" ui/screenshots backend_test_log.txt
else
    tar -czf "$EVIDENCE_DIR/$TAR_FILE" backend_test_log.txt
fi

rm -f backend_test_log.txt

echo "[+] Evidências salvas e arquivadas em: $EVIDENCE_DIR/$TAR_FILE"
