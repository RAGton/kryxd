// Hook: useNetworkStatus
// Encapsula o estado local de `installerApi.getNetworkStatus()` e a decisão
// de "como aplicar o resultado no wizardState" via callback `applyStatus`.
//
// Sem `useEffect` no mount — orquestração fica com o componente consumidor.
//
// O hook **não escreve direto** no wizardState: ele devolve o status bruto
// e a função `checkConnectionStatus` aceita um `applyStatus(result)` opcional
// que o componente passa para aplicar o patch (`netConnected`, `serverIp`, ...).
// Isso preserva a single source of truth no `wizardState` e mantém o hook puro.

import { useCallback, useState } from 'react';
import { installerApi } from '../utils/installerApi.js';
import { sanitizeIp, isUsableRemoteIp } from '../utils/network.js';

export function useNetworkStatus() {
  const [netStatus, setNetStatus] = useState(null);
  const [netConnected, setNetConnected] = useState(false);
  const [netOffline, setNetOffline] = useState(false);

  // applyStatus recebe o patch cru derivado do status, sem aplicar onChange.
  // O componente decide o que fazer com ele (onChange no wizardState).
  const checkConnectionStatus = useCallback(async (applyStatus) => {
    try {
      const status = await installerApi.getNetworkStatus();
      setNetStatus(status);
      const connected = Boolean(status?.connected);
      setNetConnected(connected);
      setNetOffline(false);
      if (connected && status?.ip && isUsableRemoteIp(status.ip)) {
        applyStatus?.({
          netConnected: true,
          netOffline: false,
          serverIp: sanitizeIp(status.ip),
        });
      } else {
        applyStatus?.({ netConnected: false });
      }
      return status;
    } catch {
      // Silencioso: status check é best-effort, falha não deve bloquear UI.
      return null;
    }
  }, []);

  return {
    netStatus,
    netConnected,
    netOffline,
    checkConnectionStatus,
  };
}