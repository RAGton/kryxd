import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_DNS_LIST,
  DEFAULT_DNS_CSV,
  sanitizeIp,
  isValidIpv4,
  netmaskToPrefix,
  isUsableRemoteIp,
  formatIpv4Input,
  normalizeDnsList,
  isValidDnsList,
  validateStaticNetwork,
} from '../../utils/network.js';

test('DEFAULT_DNS_LIST é imutável e contém 1.1.1.1 + 8.8.8.8', () => {
  assert.deepEqual([...DEFAULT_DNS_LIST], ['1.1.1.1', '8.8.8.8']);
  assert.equal(DEFAULT_DNS_CSV, '1.1.1.1,8.8.8.8');
  assert.throws(() => { DEFAULT_DNS_LIST.push('9.9.9.9'); }, TypeError);
});

test('sanitizeIp remove sufixo CIDR e espaços', () => {
  assert.equal(sanitizeIp('192.168.1.1/24'), '192.168.1.1');
  assert.equal(sanitizeIp('  10.0.0.1  '), '10.0.0.1');
  assert.equal(sanitizeIp(''), '');
  assert.equal(sanitizeIp(null), '');
  assert.equal(sanitizeIp(undefined), '');
});

test('isValidIpv4 aceita IPv4 e rejeita o resto', () => {
  assert.equal(isValidIpv4('192.168.1.1'), true);
  assert.equal(isValidIpv4('0.0.0.0'), true);
  assert.equal(isValidIpv4('255.255.255.255'), true);
  assert.equal(isValidIpv4('192.168.1.1/24'), true);
  assert.equal(isValidIpv4('192.168.1'), false);
  assert.equal(isValidIpv4('192.168.1.256'), false);
  // Zero-padded à esquerda é aceito pelo regex (não estrito na forma canônica)
  assert.equal(isValidIpv4('192.168.1.01'), true);
  assert.equal(isValidIpv4('::1'), false);
  assert.equal(isValidIpv4(''), false);
  assert.equal(isValidIpv4('foo'), false);
});

test('netmaskToPrefix retorna null para vazio/inválido, número para válido', () => {
  assert.equal(netmaskToPrefix(''), null);
  assert.equal(netmaskToPrefix(null), null);
  assert.equal(netmaskToPrefix('255.255.255.0'), 24);
  assert.equal(netmaskToPrefix('255.255.255.128'), 25);
  assert.equal(netmaskToPrefix('255.255.255.252'), 30);
  assert.equal(netmaskToPrefix('255.255.0.0'), 16);
  assert.equal(netmaskToPrefix('255.0.0.0'), 8);
  assert.equal(netmaskToPrefix('255.255.255.255'), 32);
  // Máscara não contígua → null
  assert.equal(netmaskToPrefix('255.0.255.0'), null);
  assert.equal(netmaskToPrefix('255.255.255.1'), null);
  // Octeto inválido → null
  assert.equal(netmaskToPrefix('255.255.255.300'), null);
  assert.equal(netmaskToPrefix('aaa.bbb.ccc.ddd'), null);
  // Formato errado → null
  assert.equal(netmaskToPrefix('255.255.255'), null);
});

test('isUsableRemoteIp rejeita loopback, link-local, 0.0.0.0', () => {
  assert.equal(isUsableRemoteIp('192.168.1.1'), true);
  assert.equal(isUsableRemoteIp('8.8.8.8'), true);
  assert.equal(isUsableRemoteIp('10.0.0.1/24'), true);
  assert.equal(isUsableRemoteIp('127.0.0.1'), false);
  assert.equal(isUsableRemoteIp('127.255.255.254'), false);
  assert.equal(isUsableRemoteIp('169.254.0.1'), false);
  assert.equal(isUsableRemoteIp('0.0.0.0'), false);
  assert.equal(isUsableRemoteIp(''), false);
  assert.equal(isUsableRemoteIp('foo'), false);
});

test('formatIpv4Input limpa caracteres inválidos e limita octetos', () => {
  // Comportamento histórico (Network.jsx original) — a função força o ponto
  // após cada bloco de 3 dígitos quando ainda há octetos disponíveis.
  assert.equal(formatIpv4Input(''), '');
  assert.equal(formatIpv4Input('1'), '1');
  assert.equal(formatIpv4Input('192'), '192.');
  assert.equal(formatIpv4Input('192.'), '192.');
  assert.equal(formatIpv4Input('192.168'), '192.168.');
  assert.equal(formatIpv4Input('192.168.1'), '192.168.1');
  assert.equal(formatIpv4Input('192.168.1.1'), '192.168.1.1');
  // Limite a 3 dígitos por octeto
  assert.equal(formatIpv4Input('12345'), '123.');
  // Caracteres não-numéricos são removidos
  assert.equal(formatIpv4Input('192a.168b.1c'), '192.168.1');
  // Heurística de deleção: raw menor que prev suprime a auto-inserção do
  // ponto (comportamento preservado do original).
  assert.equal(formatIpv4Input('192', '192.'), '192');
  assert.equal(formatIpv4Input('192', ''), '192.');
  assert.equal(formatIpv4Input('192', '192'), '192.');
  // Insere ponto após 3 dígitos quando ainda há espaço.
  // Quirk histórico: string corrida sem pontos é parseada só até o primeiro
  // bloco de 3 dígitos — o resto é descartado. Comportamento herdado do
  // original, preservado por fidelidade.
  assert.equal(formatIpv4Input('192168', ''), '192.');
  assert.equal(formatIpv4Input('1921681', ''), '192.');
});

test('normalizeDnsList aceita CSV, array, null e dedup', () => {
  assert.deepEqual(normalizeDnsList(''), []);
  assert.deepEqual(normalizeDnsList('1.1.1.1,8.8.8.8'), ['1.1.1.1', '8.8.8.8']);
  assert.deepEqual(normalizeDnsList('1.1.1.1, 8.8.8.8 , 1.1.1.1'), ['1.1.1.1', '8.8.8.8']);
  assert.deepEqual(normalizeDnsList(['1.1.1.1', '8.8.8.8']), ['1.1.1.1', '8.8.8.8']);
  // IPs inválidos são descartados silenciosamente
  assert.deepEqual(normalizeDnsList('1.1.1.1,foo,8.8.8.8'), ['1.1.1.1', '8.8.8.8']);
  assert.deepEqual(normalizeDnsList(null), []);
});

test('isValidDnsList exige ≥1 item e todos IPv4', () => {
  assert.equal(isValidDnsList(''), false);
  assert.equal(isValidDnsList('foo'), false);
  assert.equal(isValidDnsList('1.1.1.1,foo'), false);
  assert.equal(isValidDnsList('1.1.1.1'), true);
  assert.equal(isValidDnsList('1.1.1.1,8.8.8.8'), true);
  assert.equal(isValidDnsList(['1.1.1.1']), true);
  // CSV vazia (só vírgulas) é inválida
  assert.equal(isValidDnsList(',,,'), false);
});

test('validateStaticNetwork agrega erros por campo', () => {
  const empty = validateStaticNetwork({});
  assert.equal(empty.ok, false);
  assert.ok(empty.errors.address);
  assert.ok(empty.errors.gateway);
  assert.ok(empty.errors.netmask);
  assert.ok(empty.errors.dns);

  const partial = validateStaticNetwork({
    address: '192.168.1.10',
    gateway: '192.168.1.1',
    netmask: '255.255.255.0',
    dns: '1.1.1.1,8.8.8.8',
  });
  assert.equal(partial.ok, true);
  assert.equal(partial.prefix, 24);
  assert.deepEqual(partial.errors, {});

  // IP inválido
  const badIp = validateStaticNetwork({
    address: '999.0.0.0',
    gateway: '192.168.1.1',
    netmask: '255.255.255.0',
    dns: '1.1.1.1',
  });
  assert.equal(badIp.ok, false);
  assert.ok(badIp.errors.address);
  assert.equal(badIp.errors.gateway, undefined);

  // Máscara inválida (não contígua)
  const badMask = validateStaticNetwork({
    address: '192.168.1.10',
    gateway: '192.168.1.1',
    netmask: '255.0.255.0',
    dns: '1.1.1.1',
  });
  assert.equal(badMask.ok, false);
  assert.ok(badMask.errors.netmask);
  assert.equal(badMask.prefix, null);

  // Prefixo > 30
  const tooLarge = validateStaticNetwork({
    address: '192.168.1.10',
    gateway: '192.168.1.1',
    netmask: '255.255.255.252',
    dns: '1.1.1.1',
  });
  assert.equal(tooLarge.prefix, 30);
  assert.equal(tooLarge.ok, true);
});