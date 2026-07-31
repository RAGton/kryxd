import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { installerApi } from '../utils/installerApi.js';
import { sanitizeIp, isUsableRemoteIp } from '../utils/network.js';

export default function RemoteAccess({ wizard, onChange }) {
  const { t } = useTranslation();
  const [detectedIp, setDetectedIp] = useState('');
  const [detecting, setDetecting] = useState(false);
  const [detectError, setDetectError] = useState('');
  const [lastAttempt, setLastAttempt] = useState(null);

  const detectIp = useCallback(async () => {
    setDetecting(true);
    setDetectError('');
    try {
      const status = await installerApi.getNetworkStatus();
      const ip = sanitizeIp(status?.ip || '');

      if (ip && isUsableRemoteIp(ip)) {
        setDetectedIp(ip);
        // Save detected IP to wizard so it's available for other screens
        onChange({ serverIp: ip });
        setLastAttempt(new Date().toLocaleTimeString('pt-BR'));
      } else if (!status?.connected) {
        setDetectError(t('remote_access.no_connection', { defaultValue: 'Sem conectividade de rede detectada.' }));
      } else if (ip) {
        // IP found but not in preferred private ranges
        setDetectedIp(ip);
        onChange({ serverIp: ip });
        setDetectError(`${t('remote_access.ip_not_preferred', { defaultValue: 'IP detectado não está em faixa privada preferida:' })} ${ip}`);
        setLastAttempt(new Date().toLocaleTimeString('pt-BR'));
      } else {
        setDetectError(t('remote_access.waiting_dhcp', { defaultValue: 'IP não detectado na interface ativa. Aguardando DHCP...' }));
      }
    } catch (err) {
      setDetectError(t('remote_access.fail_backend', { defaultValue: 'Falha ao consultar o backend de rede.' }));
      console.error('[RemoteAccess] detectIp error:', err);
    } finally {
      setDetecting(false);
    }
  }, [onChange, t]);

  // Auto-detect IP no mount, independente do toggle targetRemoteAccessEnabled.
  // Faz o usuário ver imediatamente o endereço de acesso atual; se ele
  // habilitar remoto depois, o accessUrl já está pronto sem nova espera.
  useEffect(() => {
    detectIp();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Determine effective IP: prefer wizard.serverIp if valid, else detectedIp
  const effectiveIp = isValidIp(wizard.serverIp) ? wizard.serverIp : (isValidIp(detectedIp) ? detectedIp : '');
  const accessPort = wizard.httpPort || 8080;
  const accessUrl = effectiveIp ? `http://${effectiveIp}:${accessPort}` : '';

  return (
    <div className="wizard-content">
      <h2 className="text-2xl font-bold mb-4">{t('remote_access.title', { defaultValue: 'Acesso Remoto' })}</h2>
      <p className="text-gray-400 mb-8">
        {t('remote_access.desc', { defaultValue: 'Habilite o acesso remoto para continuar a instalação através de outro dispositivo na mesma rede.' })}
      </p>

      <div className="bg-gray-800/50 border border-gray-700 p-6 rounded-xl mb-6">
        <label className="flex items-start space-x-4 cursor-pointer">
          <input
            type="checkbox"
            className="form-checkbox mt-1 h-5 w-5 text-blue-500 bg-gray-900 border-gray-700 rounded focus:ring-blue-500 focus:ring-offset-gray-900"
            checked={wizard.targetRemoteAccessEnabled}
            onChange={(e) => onChange({ targetRemoteAccessEnabled: e.target.checked })}
          />
          <div>
            <span className="block text-lg font-bold text-white mb-1">
              {t('remote_access.enable', { defaultValue: 'Habilitar instalador remoto' })}
            </span>
            <span className="block text-sm text-gray-400">
              {t('remote_access.enable_desc1', { defaultValue: 'Permite acessar a interface a partir de outro dispositivo usando os endereços IP desta máquina na porta' })} {accessPort}.
              <br />
              <strong className="text-yellow-500 mt-2 block">{t('remote_access.warning', { defaultValue: 'Aviso: Use apenas em rede confiável.' })}</strong>
            </span>
          </div>
        </label>
      </div>

      {wizard.targetRemoteAccessEnabled ? (
        <div className="bg-blue-500/10 border border-blue-500/30 p-6 rounded-xl">
          <h3 className="text-lg font-bold text-blue-400 mb-2">{t('remote_access.instructions', { defaultValue: 'Instruções de Acesso' })}</h3>
          <p className="text-gray-300 text-sm mb-4">
            {t('remote_access.access_desc', { defaultValue: 'Acesse a interface a partir de outro dispositivo usando os endereços IP desta máquina na porta' })} {accessPort}.
          </p>

          {accessUrl ? (
            <div className="bg-black/50 p-4 rounded border border-gray-700 font-mono text-sm text-green-400 mb-4">
              {accessUrl}
            </div>
          ) : (
            <div className="bg-amber-500/10 border border-amber-500/30 p-4 rounded-xl mb-4">
              <p className="text-amber-200 text-sm font-semibold mb-1">
                {t('remote_access.ip_not_detected', { defaultValue: 'IP ainda não detectado' })}
              </p>
              <p className="text-amber-100/80 text-sm">
                {t('remote_access.ip_not_detected_desc', { defaultValue: 'Aguardando DHCP / IP não detectado. Verifique a conectividade ou preencha manualmente na tela de Rede.' })}
              </p>
              {detectError ? (
                <p className="text-amber-100/60 text-xs mt-2">{detectError}</p>
              ) : null}
            </div>
          )}

          {/*
            Mostramos APENAS um bloco. `detectIp` sempre grava o IP detectado
            em `wizard.serverIp`, então os dois textos antigos ("detectado
            automaticamente" + "configurado") sempre apontavam para o mesmo
            valor — só ruído visual. Aqui o `effectiveIp` é a fonte única.
          */}
          {effectiveIp ? (
            <div className="text-emerald-200 text-xs mb-4">
              {t('remote_access.server_ip', { defaultValue: 'IP do servidor:' })} <b className="text-emerald-100">{effectiveIp}</b>
              {lastAttempt ? ` · ${t('remote_access.updated_at', { defaultValue: 'atualizado em' })} ${lastAttempt}` : ''}
            </div>
          ) : null}

          <button
            type="button"
            className="btn-primary !px-4 !py-2 text-sm"
            onClick={detectIp}
            disabled={detecting}
          >
            {detecting ? t('remote_access.detecting', { defaultValue: 'Detectando...' }) : t('remote_access.refresh_ip', { defaultValue: 'Atualizar IP automaticamente' })}
          </button>
        </div>
      ) : (
        <div className="bg-gray-800/30 border border-gray-700/50 p-6 rounded-xl">
          <h3 className="text-lg font-bold text-gray-400 mb-2">{t('remote_access.restricted', { defaultValue: 'Acesso Restrito (Local-Only)' })}</h3>
          <p className="text-gray-500 text-sm">
            {t('remote_access.restricted_desc_start', { defaultValue: 'O instalador está acessível apenas localmente através da interface gráfica ou via' })} <code>127.0.0.1</code>{t('remote_access.restricted_desc_end', { defaultValue: '. O firewall bloqueia acessos externos.' })}
          </p>
        </div>
      )}
    </div>
  );
}
