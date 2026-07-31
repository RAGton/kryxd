// Funções puras de rede do instalador.
// Single Source of Truth para helpers de IP/máscara/DNS.
// Reutilizadas pelo wizard (Network.jsx, RemoteAccess.jsx, WizardInstaller.jsx)
// e por buildInstallPlanPayload (installPlan.js).
// Sem dependência de React/DOM — testável via node:test.

const IPV4_PATTERN = /^((25[0-5]|2[0-4]\d|[01]?\d?\d)\.){3}(25[0-5]|2[0-4]\d|[01]?\d?\d)$/;

// Lista padrão de servidores DNS. Usada como fallback no wizard e na
// configuração inicial do plano. Centralizada aqui para evitar divergência
// entre wizardState e UI.
export const DEFAULT_DNS_LIST = Object.freeze(['1.1.1.1', '8.8.8.8']);
export const DEFAULT_DNS_CSV = DEFAULT_DNS_LIST.join(',');

function trim(value) {
  return String(value ?? '').trim();
}

// Remove sufixo CIDR (/24) e espaços. Útil para normalizar IPs que podem
// chegar como "192.168.1.1/24" vindos do backend nmcli.
export function sanitizeIp(value) {
  return String(value ?? '').split('/')[0].trim();
}

export function isValidIpv4(value) {
  return IPV4_PATTERN.test(sanitizeIp(value));
}

// Converte máscara dotted (255.255.255.0) em prefixo CIDR (24).
// Retorna `null` para máscara vazia, malformada ou não contígua.
export function netmaskToPrefix(netmask) {
  const normalized = trim(netmask);
  if (!normalized) return null;

  const parts = normalized.split('.');
  if (parts.length !== 4) return null;

  let bits = 0;
  let seenZero = false;
  for (const part of parts) {
    const octet = Number(part);
    if (!Number.isInteger(octet) || octet < 0 || octet > 255) return null;
    for (let bit = 7; bit >= 0; bit -= 1) {
      const current = (octet >> bit) & 1;
      if (current === 1) {
        if (seenZero) return null;
        bits += 1;
      } else {
        seenZero = true;
      }
    }
  }
  return bits;
}

// IP é "remoto usável" quando:
//   - É IPv4 válido
//   - Não é loopback (127.0.0.0/8)
//   - Não é link-local (169.254.0.0/16)
//   - Não é "0.0.0.0" (placeholder do NetworkManager)
export function isUsableRemoteIp(value) {
  const ip = sanitizeIp(value);
  if (!ip) return false;
  if (ip === '0.0.0.0') return false;
  if (ip.startsWith('127.')) return false;
  if (ip.startsWith('169.254.')) return false;
  return IPV4_PATTERN.test(ip);
}

// Formata um valor digitado como IPv4 parcial: aceita só dígitos e pontos,
// limita a 4 octetos de até 3 dígitos, insere pontos automaticamente.
// `previousValue` permite detectar deleção para não inserir pontos extras.
export function formatIpv4Input(nextValue, previousValue = '') {
  const raw = String(nextValue ?? '');
  const previous = String(previousValue ?? '');
  const isDeleting = raw.length < previous.length;
  const cleaned = raw.replace(/[^\d.]/g, '');

  const parts = cleaned
    .split('.')
    .slice(0, 4)
    .map((part) => part.replace(/\D/g, '').slice(0, 3));

  let formatted = parts
    .filter((part, index) => part !== '' || index < parts.length - 1)
    .join('.');

  if (!isDeleting) {
    const visibleParts = formatted.split('.');
    const lastPart = visibleParts[visibleParts.length - 1] || '';
    const endedWithDot = cleaned.endsWith('.');

    if (endedWithDot && visibleParts.length < 4 && !formatted.endsWith('.')) {
      formatted += '.';
    } else if (!cleaned.includes('.') && lastPart.length === 3 && visibleParts.length < 4) {
      formatted += '.';
    } else if (cleaned.includes('.') && lastPart.length === 3 && visibleParts.length < 4 && !formatted.endsWith('.')) {
      formatted += '.';
    }
  }

  return formatted;
}

// Aceita string CSV, array ou null. Retorna array de IPv4 únicos.
// Itens inválidos são descartados silenciosamente; quando todos são inválidos
// o resultado é um array vazio (use isValidDnsList para validar antes).
export function normalizeDnsList(value) {
  const items = Array.isArray(value)
    ? value
    : String(value ?? '').split(',');
  const cleaned = items.map(trim).filter(Boolean);
  return Array.from(new Set(cleaned.filter(isValidIpv4)));
}

// Verdadeiro quando há ao menos um item E todos os itens não-vazios são IPv4 válidos.
// Lista vazia conta como inválida (DNS é obrigatório no modo static).
export function isValidDnsList(value) {
  const items = Array.isArray(value)
    ? value.map(trim).filter(Boolean)
    : String(value ?? '').split(',').map(trim).filter(Boolean);
  if (items.length === 0) return false;
  return items.every(isValidIpv4);
}

// Valida o bloco de rede em modo static.
// Entrada: { address, gateway, netmask, dns } — dns pode ser CSV ou array.
// Saída: { ok, errors: { address?, gateway?, netmask?, dns? }, prefix }.
export function validateStaticNetwork(input = {}) {
  const errors = {};
  const address = trim(input.address);
  const gateway = trim(input.gateway);
  const netmask = trim(input.netmask);

  if (!address) {
    errors.address = 'IP do servidor é obrigatório.';
  } else if (!isValidIpv4(address)) {
    errors.address = 'IP do servidor inválido.';
  }

  if (!gateway) {
    errors.gateway = 'Gateway é obrigatório.';
  } else if (!isValidIpv4(gateway)) {
    errors.gateway = 'Gateway inválido.';
  }

  const prefix = netmaskToPrefix(netmask);
  if (prefix === null) {
    errors.netmask = 'Máscara/prefixo inválido.';
  } else if (prefix < 1 || prefix > 30) {
    errors.netmask = 'Prefixo fora da faixa utilizável (1–30).';
  }

  if (!isValidDnsList(input.dns)) {
    errors.dns = 'Informe ao menos um DNS IPv4 válido (separado por vírgula).';
  }

  return {
    ok: Object.keys(errors).length === 0,
    errors,
    prefix,
  };
}