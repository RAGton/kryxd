// Hook: useNetworkInterfaces
// Encapsula o estado local da chamada `installerApi.getNetworkInterfaces()`.
// Sem `useEffect` no mount — a orquestração do fetch fica com o componente
// consumidor (evita concorrência no boot duplo).
//
// Retorna:
//   - interfaces:    array cru vindo do backend (`name`, `type`, `state`, ...)
//   - wifiIfaces:    array memoizado filtrando `type === 'wifi'`
//   - ethIfaces:     array memoizado filtrando `type === 'ethernet'`
//   - ifaceNames:    array memoizado só com nomes válidos
//   - loading:       flag de fetch em andamento
//   - error:         mensagem de erro localizada (vazia quando ok)
//   - refreshInterfaces: useCallback que re-executa o fetch

import { useCallback, useMemo, useState } from 'react';
import { installerApi, getInstallerApiErrorMessage } from '../utils/installerApi.js';

export function useNetworkInterfaces() {
  const [interfaces, setInterfaces] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const refreshInterfaces = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const payload = await installerApi.getNetworkInterfaces();
      const list = Array.isArray(payload?.interfaces) ? payload.interfaces : [];
      setInterfaces(list);
      return list;
    } catch (nextError) {
      setError(getInstallerApiErrorMessage(nextError, 'Falha ao carregar interfaces.'));
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  const wifiIfaces = useMemo(
    () => interfaces.filter((i) => i.type === 'wifi'),
    [interfaces]
  );

  const ethIfaces = useMemo(
    () => interfaces.filter((i) => i.type === 'ethernet'),
    [interfaces]
  );

  const ifaceNames = useMemo(
    () => interfaces.map((i) => i.name).filter(Boolean),
    [interfaces]
  );

  return {
    interfaces,
    wifiIfaces,
    ethIfaces,
    ifaceNames,
    loading,
    error,
    refreshInterfaces,
  };
}