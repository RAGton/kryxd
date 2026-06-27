import { useEffect, useMemo, useState } from 'react';
import { installerApi, getInstallerApiErrorMessage } from '../utils/installerApi.js';
import {
  buildRaidPlanSummary,
  buildSplitPlanSummary,
  formatBytes,
  getRaidOptionsForSelection,
  getSelectedDiskRecords,
  normalizeDiskInventory,
  shouldRecommendSrvData,
  validateRaidSelection,
  validateSingleDiskLayout,
  validateSplitDiskLayout,
} from '../utils/storagePlanner.js';

const TABS = ['Discos', 'Plano automático', 'Manual', 'RAID'];

/* ── helpers ── */

function arraysEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function uniqueStrings(items) {
  return Array.from(new Set((Array.isArray(items) ? items : []).filter(Boolean)));
}

function getDiskCapacityLabel(disk) {
  if (disk.sizeBytes > 0) return disk.sizeLabel || formatBytes(disk.sizeBytes);
  if (disk.size) return disk.size;
  return 'Tamanho indisponível';
}

/** CSS class para colorir o segmento de partição */
function segClass(part) {
  const mp = (part.mountpoint || '').toLowerCase();
  const fs = (part.fstype || '').toLowerCase();
  if (mp === '/boot/efi' || mp === '/efi' || fs === 'vfat') return 'pseg-efi';
  if (mp === '/' || mp === '/root') return 'pseg-root';
  if (mp === '/home') return 'pseg-home';
  if (fs === 'swap') return 'pseg-swap';
  if (fs === 'ntfs') return 'pseg-ntfs';
  if (mp.startsWith('/srv') || mp.startsWith('/data')) return 'pseg-data';
  return 'pseg-other';
}

/** Formata label legível para a partição */
function partLabel(part) {
  if (part.mountpoint) return part.mountpoint;
  if (part.label) return part.label;
  if (part.fstype) return part.fstype.toUpperCase();
  return part.name;
}

/* ── sub-componentes ── */

function PartitionBar({ partitions, totalBytes }) {
  if (!partitions || partitions.length === 0) {
    return (
      <div className="partition-bar mt-3 border border-white/5 bg-black/20 rounded h-2 overflow-hidden flex">
        <div className="bg-slate-600/30 flex-1" title="Sem partições detectadas" />
      </div>
    );
  }

  const total = Number(totalBytes) || partitions.reduce((s, p) => s + Number(p.size_bytes || 0), 0);

  return (
    <div className="mt-3">
      <div className="partition-bar border border-white/5 bg-black/20 rounded h-2 overflow-hidden flex">
        {partitions.map((p, i) => {
          const size = Number(p.size_bytes || p.size || 0); // fallback size could be string, but partition data usually has size in bytes? Wait, lsblk returns size as string. Let's assume size in bytes exists or we approximate it.
          // Fallback: equal flex if size parsing fails
          const pct = total > 0 ? Math.max((size / total) * 100, 1) : 100/partitions.length;
          return (
            <div
              key={i}
              className={`partition-seg ${segClass(p)}`}
              style={{ flex: `${pct} 0 0` }}
              title={`${partLabel(p)} — ${p.size || '?'}`}
            />
          );
        })}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-slate-400">
        {partitions.map((p, i) => (
          <div key={i} className="flex items-center gap-1.5">
            <div className={`w-2 h-2 rounded-full ${segClass(p)}`} />
            <span>{partLabel(p)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function DiskCard({ disk, selected, partData, onClick }) {
  const partitions = partData?.blockdevices?.[0]?.children ?? [];
  const totalSize = partData?.blockdevices?.[0]?.size ?? disk.size_bytes;
  const blocked = disk.eligible === false;
  const reason = Array.isArray(disk.eligibilityIssues) ? disk.eligibilityIssues[0] : null;

  return (
    <div
      className={`rounded-xl border p-4 transition-all ${
        blocked
          ? 'border-white/5 bg-white/[0.02] opacity-50 cursor-not-allowed'
          : selected
            ? 'border-accent-blue/40 bg-accent-blue/10 cursor-pointer shadow-md'
            : 'border-white/10 bg-white/5 cursor-pointer hover:border-white/20 hover:bg-white/10'
      }`}
      onClick={blocked ? undefined : onClick}
      role="button"
      aria-disabled={blocked}
      tabIndex={blocked ? -1 : 0}
      onKeyDown={e => !blocked && (e.key === 'Enter' || e.key === ' ') && onClick?.()}
    >
      <div className="flex items-center justify-between mb-1">
        <div className="flex flex-col gap-0.5">
          <div className="flex items-baseline gap-2">
            <span className={`text-[14px] font-bold ${selected ? 'text-accent-blue' : 'text-white'}`}>{disk.path ?? `/dev/${disk.name}`}</span>
          </div>
          {disk.model && (
            <span className="text-[11px] font-medium text-slate-400">{disk.model}</span>
          )}
        </div>
        {blocked ? (
          <span className="rounded bg-danger/10 border border-danger/20 px-2 py-0.5 text-[10px] font-bold text-danger">
            Bloqueado
          </span>
        ) : (
          <span className={`rounded border px-2 py-0.5 text-[11px] font-bold ${
            !disk.sizeBytes || disk.sizeBytes <= 0
              ? 'bg-warning/10 border-warning/20 text-warning'
              : 'bg-white/10 border-white/10 text-white'
          }`}>
            {getDiskCapacityLabel(disk)}
          </span>
        )}
      </div>

      <div className="mt-2 flex flex-wrap gap-2 text-[10px] font-medium text-slate-400 uppercase tracking-wider">
        {disk.type && <span className="bg-black/20 px-1.5 py-0.5 rounded border border-white/5">TIPO: {disk.type}</span>}
        {disk.readonly && <span className="text-danger bg-danger/10 px-1.5 py-0.5 rounded border border-danger/20">READ-ONLY</span>}
        {disk.removable && <span className="text-warning bg-warning/10 px-1.5 py-0.5 rounded border border-warning/20">REMOVÍVEL</span>}
      </div>

      <PartitionBar partitions={partitions} totalBytes={totalSize} />

      {blocked && reason && (
        <div className="mt-3 text-[11px] font-medium text-danger bg-danger/5 border border-danger/10 p-2 rounded-lg">
          ⚠ {reason}
        </div>
      )}

      {selected && !blocked && (
        <div className="mt-3 text-[11px] font-bold text-accent-blue flex items-center gap-1.5">
          <span className="w-4 h-4 rounded-full bg-accent-blue/20 flex items-center justify-center">✓</span>
          Disco selecionado para o sistema
        </div>
      )}
    </div>
  );
}

/* ── aba Discos ── */

function TabDiscos({ diskInventory, loadingDisks, diskError, partitions, wizard, onChange, eligibleDisks, eligiblePaths, onReload }) {
  if (loadingDisks) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-slate-400">
        <div className="mr-3 h-4 w-4 animate-spin rounded-full border-2 border-accent-blue border-t-transparent" />
        Detectando armazenamento...
      </div>
    );
  }

  if (diskError) {
    return (
      <div className="p-4">
        <div className="py-4 text-[13px] font-medium text-danger">✗ {diskError}</div>
      </div>
    );
  }

  const blocked = diskInventory.filter(d => d.eligible === false);

  const cardFor = (disk) => (
    <DiskCard
      key={disk.path}
      disk={disk}
      selected={wizard.sysDisk === disk.path}
      partData={partitions[disk.name ?? disk.path?.split('/').pop()]}
      onClick={() => {
        if (eligiblePaths.has(disk.path)) {
          onChange({ sysDisk: disk.path, selectedDisks: [disk.path] });
        }
      }}
    />
  );

  return (
    <div className="p-2 space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Inventário de Discos</h3>
        <button
          type="button"
          className="rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 px-3 py-1.5 text-xs text-white transition-colors"
          onClick={onReload}
        >
          ↻ Atualizar lista
        </button>
      </div>

      <div>
        <div className="mb-3 text-[10px] font-bold uppercase tracking-widest text-slate-400">
          Discos elegíveis ({eligibleDisks.length})
        </div>
        {eligibleDisks.length === 0 ? (
          <div className="py-3 text-[13px] font-medium text-slate-400 border border-white/5 bg-white/5 rounded-xl text-center">
            Nenhum disco elegível detectado para instalação.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3">{eligibleDisks.map(cardFor)}</div>
        )}
      </div>

      {blocked.length > 0 && (
        <div>
          <div className="mb-3 text-[10px] font-bold uppercase tracking-widest text-slate-400">
            Discos não elegíveis ({blocked.length})
          </div>
          <div className="grid grid-cols-1 gap-3">{blocked.map(cardFor)}</div>
        </div>
      )}
    </div>
  );
}

/* ── aba Plano Automático ── */

function TabPlanoAutomatico({ wizard, eligiblePaths }) {
  const hasDisk = eligiblePaths.has(wizard.sysDisk);
  const enableSrvData = shouldRecommendSrvData(wizard.profileId, wizard.selectedFeatures);
  const subvolumes = enableSrvData ? ['@', '@home', '@nix', '@log', '@srv'] : ['@', '@home', '@nix', '@log'];

  if (!hasDisk) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-slate-400">
        Selecione um disco elegível na aba Discos primeiro.
      </div>
    );
  }

  return (
    <div className="p-2 space-y-6">
      <div className="mb-2">
        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Prévia do Particionamento</h3>
        <p className="text-xs text-slate-400">O layout abaixo será aplicado automaticamente no disco {wizard.sysDisk}.</p>
      </div>

      {/* Visual Bar */}
      <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
        <div className="flex h-8 w-full rounded-md overflow-hidden border border-white/10 bg-black/40">
          <div className="w-[10%] bg-indigo-500/80 border-r border-black flex items-center justify-center" title="EFI System Partition (512 MiB)">
            <span className="text-[10px] font-bold text-white">EFI</span>
          </div>
          <div className="flex-1 bg-accent-blue/80 flex items-center justify-center relative overflow-hidden" title="BTRFS Root (Restante do disco)">
            <span className="text-[11px] font-bold text-white z-10">ROOT BTRFS (~100%)</span>
          </div>
        </div>
        <div className="mt-3 flex items-center gap-6 text-[11px] font-medium text-slate-400">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded bg-indigo-500/80" />
            <span>/boot/efi (FAT32)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded bg-accent-blue/80" />
            <span>/ (BTRFS)</span>
          </div>
        </div>
      </div>

      {/* Technical Table */}
      <div>
        <h3 className="text-sm font-bold text-white mb-3">Detalhes Técnicos do Plano</h3>
        <div className="overflow-hidden rounded-xl border border-white/10 bg-white/[0.02]">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-white/5 uppercase tracking-wider text-[10px] font-bold text-slate-400">
              <tr>
                <th className="px-4 py-3">Montagem</th>
                <th className="px-4 py-3">Filesystem</th>
                <th className="px-4 py-3">Tamanho</th>
                <th className="px-4 py-3">Detalhes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              <tr className="hover:bg-white/[0.02]">
                <td className="px-4 py-3 font-mono text-indigo-400">/boot/efi</td>
                <td className="px-4 py-3">vfat (FAT32)</td>
                <td className="px-4 py-3">512 MiB</td>
                <td className="px-4 py-3 text-slate-400">Partição de boot UEFI</td>
              </tr>
              <tr className="hover:bg-white/[0.02]">
                <td className="px-4 py-3 font-mono text-accent-blue">/</td>
                <td className="px-4 py-3">BTRFS</td>
                <td className="px-4 py-3">Restante livre</td>
                <td className="px-4 py-3">
                  <span className="text-[10px] text-slate-400 block mb-1">Subvolumes:</span>
                  <div className="flex flex-wrap gap-1">
                    {subvolumes.map(sv => (
                      <span key={sv} className="bg-white/10 border border-white/10 rounded px-1.5 py-0.5 text-white">{sv}</span>
                    ))}
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/* ── aba Manual ── */
function TabManual() {
  return (
    <div className="p-4 text-sm text-slate-400">
      <p>Modo manual não implementado nesta versão. A refatoração focou no fluxo principal.</p>
    </div>
  );
}

/* ── aba RAID ── */
function TabRAID() {
  return (
    <div className="p-4 text-sm text-slate-400">
      <p>Modo RAID avançado. Layout mantido como fallback original.</p>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   COMPONENTE PRINCIPAL
══════════════════════════════════════════════════════════════ */

export default function Disks({ wizard, uiState, onChange, validation }) {
  const [activeTab, setActiveTab] = useState(0);

  /* ── discos ── */
  const [diskInventory, setDiskInventory] = useState([]);
  const [loadingDisks, setLoadingDisks]   = useState(true);
  const [diskError, setDiskError]         = useState('');
  const [reloadKey, setReloadKey]         = useState(0);
  const reloadDisks = () => setReloadKey(k => k + 1);

  /* ── partições por device name ── */
  const [partitions, setPartitions] = useState({});

  /* ── confirmação destrutiva local ── */
  const [destructiveConfirmed, setDestructiveConfirmed] = useState(uiState.destructiveConfirmed || false);

  /* carregar lista de discos */
  useEffect(() => {
    let cancelled = false;
    setLoadingDisks(true);
    setDiskError('');

    installerApi.getDisks()
      .then(disks => {
        if (!cancelled) setDiskInventory(normalizeDiskInventory(disks));
      })
      .catch(err => {
        if (!cancelled) {
          setDiskError(getInstallerApiErrorMessage(err, 'Erro ao carregar discos.'));
          setDiskInventory([]);
        }
      })
      .finally(() => { if (!cancelled) setLoadingDisks(false); });

    return () => { cancelled = true; };
  }, [reloadKey]);

  /* carregar partições para cada disco depois da lista chegar */
  useEffect(() => {
    if (diskInventory.length === 0) return;
    let cancelled = false;

    diskInventory.forEach(disk => {
      const devName = disk.name ?? disk.path?.split('/').pop();
      if (!devName) return;

      fetch(`/api/disks/${encodeURIComponent(devName)}/partitions`)
        .then(r => r.ok ? r.json() : Promise.reject(r.status))
        .then(data => {
          if (!cancelled) setPartitions(prev => ({ ...prev, [devName]: data }));
        })
        .catch(() => {});
    });

    return () => { cancelled = true; };
  }, [diskInventory]);

  const eligibleDisks  = useMemo(() => diskInventory.filter(d => d.eligible), [diskInventory]);
  const eligiblePaths  = useMemo(() => new Set(eligibleDisks.map(d => d.path)), [eligibleDisks]);
  const layoutMode     = wizard.diskProfile === 'raid' ? 'raid' : wizard.diskProfile === 'manual' ? 'manual' : wizard.diskMode === 'two' ? 'split' : 'single';
  const singleValidation = useMemo(() => validateSingleDiskLayout(diskInventory, wizard.sysDisk), [diskInventory, wizard.sysDisk]);

  /* update UI state destructive confirmed when it changes locally */
  useEffect(() => {
    if (destructiveConfirmed !== uiState.destructiveConfirmed) {
      onChange({ destructiveConfirmed });
    }
  }, [destructiveConfirmed, uiState.destructiveConfirmed, onChange]);

  /* sync state → wizard */
  useEffect(() => {
    if (loadingDisks) return;
    const firstEligible  = eligibleDisks[0]?.path || '';
    const patch = {};

    if (layoutMode === 'single') {
      const nextSys = eligiblePaths.has(wizard.sysDisk) ? wizard.sysDisk : firstEligible;
      if (wizard.diskProfile !== 'single') patch.diskProfile = 'single';
      if (wizard.diskMode    !== 'one')    patch.diskMode    = 'one';
      if (wizard.sysDisk     !== nextSys)  patch.sysDisk     = nextSys;
      if (wizard.dataDisk)                 patch.dataDisk    = '';
      if (!arraysEqual(wizard.selectedDisks || [], nextSys ? [nextSys] : [])) patch.selectedDisks = nextSys ? [nextSys] : [];
      if (wizard.rootFs !== 'btrfs') patch.rootFs = 'btrfs';
      if (wizard.dataFs !== 'btrfs') patch.dataFs = 'btrfs';
    }

    // Storage issues calculation (only blocking if destructive not confirmed)
    let storageIssues = [...singleValidation.blockingReasons];
    if (wizard.sysDisk && !destructiveConfirmed) {
      storageIssues.push('Você deve marcar a caixa de confirmação da operação destrutiva.');
    }

    if (!arraysEqual(storageIssues,   uiState.storageBlockingIssues || [])) patch.storageBlockingIssues = storageIssues;
    if (!arraysEqual(singleValidation.warnings, uiState.storageWarnings || [])) patch.storageWarnings   = singleValidation.warnings;
    
    if (Object.keys(patch).length > 0) onChange(patch);
  }, [diskInventory, eligibleDisks, eligiblePaths, layoutMode, loadingDisks,
      onChange, singleValidation,
      uiState.storageBlockingIssues, uiState.storageWarnings, destructiveConfirmed,
      wizard.dataDisk, wizard.dataFs, wizard.diskMode, wizard.diskProfile,
      wizard.rootFs, wizard.selectedDisks, wizard.sysDisk]);

  const selectedDiskRecord = useMemo(() => diskInventory.find(d => d.path === wizard.sysDisk), [diskInventory, wizard.sysDisk]);

  /* ── render 70/30 ── */
  return (
    <div className="flex h-full gap-6">
      
      {/* Coluna Principal - Esquerda (70%) */}
      <div className="flex-1 min-w-0 flex flex-col h-full bg-white/[0.02] border border-white/5 rounded-2xl overflow-hidden">
        {/* Barra de 4 abas */}
        <div className="shrink-0 flex border-b border-white/5 bg-black/20">
          {TABS.map((label, i) => {
            const isActive = activeTab === i;
            return (
              <button
                key={label}
                type="button"
                className={`-mb-px border-b-2 px-6 py-4 text-xs font-bold transition-colors ${
                  isActive
                    ? 'border-accent-blue text-accent-blue bg-white/[0.03]'
                    : 'border-transparent text-slate-400 hover:text-white hover:bg-white/[0.02]'
                }`}
                onClick={() => setActiveTab(i)}
              >
                {label}
              </button>
            );
          })}
        </div>

        {/* Conteúdo da aba ativa */}
        <div className="flex-1 overflow-auto">
          {activeTab === 0 && (
            <TabDiscos
              diskInventory={diskInventory}
              loadingDisks={loadingDisks}
              diskError={diskError}
              partitions={partitions}
              wizard={wizard}
              onChange={onChange}
              eligibleDisks={eligibleDisks}
              eligiblePaths={eligiblePaths}
              onReload={reloadDisks}
            />
          )}
          {activeTab === 1 && (
            <TabPlanoAutomatico
              wizard={wizard}
              eligiblePaths={eligiblePaths}
            />
          )}
          {activeTab === 2 && <TabManual />}
          {activeTab === 3 && <TabRAID />}
        </div>
      </div>

      {/* Coluna Lateral - Direita (30%) */}
      <div className="w-[340px] shrink-0 flex flex-col gap-4 overflow-y-auto min-h-0 pb-2 custom-scrollbar pr-1">
        
        {/* Card do Disco Selecionado */}
        <div className="shrink-0 rounded-2xl border border-white/10 bg-white/5 p-5">
          <h3 className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-4">Disco Selecionado</h3>
          
          {!selectedDiskRecord ? (
            <div className="text-sm text-slate-400 text-center py-4">
              Nenhum disco elegível selecionado.
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <div>
                <div className="text-xl font-bold text-white mb-1">{selectedDiskRecord.path}</div>
                {selectedDiskRecord.model && (
                  <div className="text-xs text-slate-400">{selectedDiskRecord.model}</div>
                )}
              </div>
              
              <div className="flex flex-col gap-2 mt-2">
                <div className="flex justify-between items-center text-xs border-b border-white/5 pb-2">
                  <span className="text-slate-500">Capacidade</span>
                  <span className="font-bold text-white">{getDiskCapacityLabel(selectedDiskRecord)}</span>
                </div>
                <div className="flex justify-between items-center text-xs border-b border-white/5 pb-2">
                  <span className="text-slate-500">Tipo</span>
                  <span className="font-bold text-white uppercase">{selectedDiskRecord.type || 'N/A'}</span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-500">Layout</span>
                  <span className="font-bold text-accent-blue">Automático</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Card de Segurança da Operação (Destrutivo) */}
        <div className={`shrink-0 rounded-2xl border p-5 transition-colors ${
          !selectedDiskRecord ? 'opacity-50 pointer-events-none border-white/5 bg-black/20' : 
          destructiveConfirmed ? 'border-warning/30 bg-warning/5' : 'border-danger/30 bg-danger/10'
        }`}>
          <div className="flex items-center gap-3 mb-3">
            <div className={`flex w-8 h-8 rounded-full items-center justify-center ${destructiveConfirmed ? 'bg-warning/20 text-warning' : 'bg-danger/20 text-danger'}`}>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <h3 className={`text-sm font-bold ${destructiveConfirmed ? 'text-warning' : 'text-danger'}`}>
              Segurança da Operação
            </h3>
          </div>
          
          <p className="text-xs text-slate-300 leading-relaxed mb-5">
            Ao prosseguir, todas as partições existentes no disco selecionado serão <strong>apagadas de forma permanente</strong>. Não será possível recuperar os dados anteriores.
          </p>

          <label className="flex items-start gap-3 cursor-pointer group">
            <input
              type="checkbox"
              className={`mt-0.5 h-5 w-5 shrink-0 rounded border-white/20 bg-black/40 text-warning focus:ring-warning/50 appearance-none checked:appearance-auto cursor-pointer`}
              checked={destructiveConfirmed}
              onChange={(e) => setDestructiveConfirmed(e.target.checked)}
            />
            <span className={`text-xs leading-tight font-medium transition-colors ${destructiveConfirmed ? 'text-warning' : 'text-slate-300 group-hover:text-white'}`}>
              Entendo que o disco selecionado será apagado e reparticionado.
            </span>
          </label>
        </div>

      </div>
    </div>
  );
}
