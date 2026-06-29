# Frontend ↔ Backend Contract

Este documento mapeia todas as interações e contratos entre o Frontend (React/Vite) e o Backend (Rust/Axum) do **Kryonix Installer**.

## Headers e Autenticação

Para requisições que podem modificar o sistema (destrutivas) ou que demandam segurança extra, o backend valida o cabeçalho `X-Kryonix-Installer-Token`.

- **Presença Obrigatória:** `POST /install`, `POST /dry-run`, `POST /disk/apply`, `POST /api/partition`, `POST /api/reboot`, `POST /api/source/github/prepare`, `POST /api/source/github/create-from-template`, `POST /profile/apply`.
- **Exceção (Sem Autenticação):** `GET /*` (maioria), `POST /network/apply` (rede é configurada antes), `POST /network/wifi/connect`.

No frontend, a injeção ocorre no `requestJson` do `installerApi.js` lendo do `sessionStorage.getItem('installer_token')`.

## Map de Endpoints e Rotas

| Endpoint                                       | Método | Auth Token | Payload / Querystring | Retorno Principal |
| ---------------------------------------------- | ------ | ---------- | --------------------- | ----------------- |
| `/health`                                      | GET    | Não        | N/A                   | `{ status: 'ok' }` |
| `/version`                                     | GET    | Não        | N/A                   | `{ version: '...' }` |
| `/hardware`                                    | GET    | Não        | N/A                   | CPU/Memória/Placa-mãe |
| `/probe`                                       | GET    | Não        | N/A                   | Detecção (UEFI, GPU) |
| `/network/status`                              | GET    | Não        | N/A                   | Status online, Interfaces |
| `/network/interfaces`                          | GET    | Não        | N/A                   | Interfaces locais (NICs) |
| `/network/wifi/scan?interface=X`               | GET    | Não        | `interface` (Query)   | Redes Wi-Fi próximas |
| `/network/wifi/connect`                        | POST   | Não        | `{ interface, ssid, password }` | 200 OK |
| `/network/apply`                               | POST   | Não        | `{ hostname, ... }`   | 200 OK |
| `/auth/github/device`                          | POST   | Sim        | N/A                   | Device Flow codes |
| `/auth/github/poll`                            | GET    | Sim        | N/A                   | Polling status (token) |
| `/repos`                                       | GET    | Sim        | N/A                   | Lista repositorios GitHub |
| `/clone`                                       | POST   | Sim        | N/A                   | Git Clone local |
| `/api/source/github/prepare`                   | POST   | Sim        | `{ repo, branch }`    | Prepara repositório |
| `/api/source/github/create-from-template`      | POST   | Sim        | `{ repoName, private, branch, templateRepo }` | Cria repo no GitHub |
| `/api/disks`                                   | GET    | Não        | N/A                   | Discos blockdevices disponíveis |
| `/api/disks/:device/partitions`                | GET    | Não        | N/A                   | Partições do device (`lsblk`) |
| `/dry-run`                                     | POST   | Sim        | `InstallPlan`         | `{ ok, checks }` |
| `/install`                                     | POST   | Sim        | `InstallPlan`         | `202 ACCEPTED` (inicia job) |
| `/install/status`                              | GET    | Não        | N/A                   | Status da instalação em andamento |
| `/install/progress`                            | SSE    | Não        | N/A                   | Server-Sent Events do progresso |
| `/api/reboot`                                  | POST   | Sim        | N/A                   | 200 OK |

## Status de Features

As "features" enviadas no payload sofrem um processo rigoroso de validação de compatibilidade (`validate_plan`).
Frontend deve respeitar o *schema de features* que o Backend espera:

| Status Backend | Tratativa no Backend | Tratativa na UI Frontend |
| -------------- | -------------------- | ------------------------ |
| `supported` | Permite ativação livremente. | Seleção normal (Checkbox/Toggle livre). |
| `partial` | Requer que o ID da feature conste no array `confirmed_features` do payload. Caso não exista, a validação falha. | Exibe aviso/modal de confirmação. Se confirmado, aciciona ao `confirmed_features`. |
| `stub` | Bloqueia a validação no dry-run/installing. | Desabilita o toggle da feature. |
| `legacy` | Bloqueia a validação no dry-run/installing. | Desabilita o toggle da feature. |

*Exemplos Mapeados:*
- `ai.ollama`, `virtualization.vms` -> **Partial**
- `ai.lightrag`, `ai.open-webui`, `remote.desktop.server`, `remote.desktop.client` -> **Stub**
- `network.legacy_bridge`, `system.legacy_boot` -> **Legacy**

## Payload: `InstallPlan`

A interface principal de comunicação para `/dry-run` e `/install`.

```json
{
  "version": 1,
  "hostname": "kryonix",
  "timezone": "America/Cuiaba",
  "locale": "pt_BR.UTF-8",
  "keyboard": "br-abnt2",
  "disk": {
    "mode": "dry-run", 
    "target": "/dev/nvme0n1",
    "layout": "btrfs-simple",
    "boot_mode": "uefi",
    "profile": "single",
    "selectedDisks": ["/dev/nvme0n1"]
  },
  "user": {
    "name": "admin",
    "admin": true,
    "uid": 1000,
    "email": "admin@local",
    "authorized_keys": [],
    "hashedPassword": "super_secret_password"
  },
  "features": {
    "system": { "audio": true },
    "ai": { "ollama": true }
  },
  "confirmed_features": ["ai.ollama"], 
  "target_remote_access": {
    "enabled": false
  },
  "network": { ... }
}
```

**ATENÇÃO DE SEGURANÇA (Contrato `hashedPassword`):**
- A senha (`hashedPassword`) trafega em texto puro **exclusivamente via memória** no frontend (`buildInstallSecretsPayload`) e no request HTTP via HTTPS/Localhost.
- **NUNCA** pode ser escrita ou logada no sistema de arquivos local do LiveCD (e.g. log do `dry-run` ou `install-plan.json`). O executor do backend trata o campo `user.hashedPassword` aplicando o hash nativamente (ex. bcrypt/SHA512) no processo de apply do target system, sem escrever a plain-text no log do daemon.
