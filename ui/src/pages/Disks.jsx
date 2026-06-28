import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
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
import { parseSizeInput } from '../utils/layoutAssistant.js';

const TABS_ID = ['automatic', 'manual', 'lvm', 'raid'];

/* ── helpers ── */

function arraysEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function getDiskCapacityLabel(disk) {
  if (disk.sizeBytes > 0) return disk.sizeLabel || formatBytes(disk.sizeBytes);
  if (disk.size) return disk.size;
  return 'N/A';
}

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
        <div className="bg-slate-600/30 flex-1" />
      </div>
    );
  }

  const total = Number(totalBytes) || partitions.reduce((s, p) => s + Number(p.sizeBytes || p.size_bytes || 0), 0);
  const used = partitions.reduce((s, p) => s + Number(p.sizeBytes || p.size_bytes || 0), 0);
  const free = Math.max(0, total - used);

  return (
    <div className="mt-3">
      <div className="partition-bar border border-white/5 bg-black/20 rounded h-2 overflow-hidden flex">
        {partitions.map((p, i) => {
          const size = Number(p.sizeBytes || p.size_bytes || p.size || 0);
          const pct = total > 0 ? (size / total) * 100 : 100 / partitions.length;
          return (
            <div
              key={i}
              className={`partition-seg ${segClass(p)}`}
              style={{ width: `${pct}%`, minWidth: pct > 0 ? '3px' : '0' }}
              title={`${partLabel(p)} — ${formatBytes(size)}`}
            />
          );
        })}
        {free > 0 && (
          <div
            className="partition-seg bg-slate-600/30"
            style={{ width: `${(free / total) * 100}%` }}
            title={`Livre — ${formatBytes(free)}`}
          />
        )}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-slate-400">
        {partitions.map((p, i) => (
          <div key={i} className="flex items-center gap-1.5">
            <div className={`w-2 h-2 rounded-full ${segClass(p)}`} />
            <span>{partLabel(p)}</span>
          </div>
        ))}
        {free > 0 && (
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-slate-600/30" />
            <span>Livre</span>
          </div>
        )}
      </div>
    </div>
  );
}

function DiskCard({ disk, selected, partData, onClick, mode = 'single' }) {
  const { t } = useTranslation();
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
      role={mode === 'multi' ? "checkbox" : "button"}
      aria-checked={mode === 'multi' ? selected : undefined}
      aria-disabled={blocked}
      tabIndex={blocked ? -1 : 0}
      onKeyDown={e => !blocked && (e.key === 'Enter' || e.key === ' ') && onClick?.()}
    >
      <div className="flex items-center justify-between mb-1">
        <div className="flex flex-col gap-0.5">
          <div className="flex items-center gap-3">
            {mode === 'multi' && (
              <div className={`w-4 h-4 rounded border flex items-center justify-center ${selected ? 'bg-accent-blue border-accent-blue text-black' : 'border-white/30 bg-black/40'}`}>
                {selected && <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
              </div>
            )}
            <span className={`text-[14px] font-bold ${selected ? 'text-accent-blue' : 'text-white'}`}>{disk.path ?? `/dev/${disk.name}`}</span>
          </div>
          {disk.model && (
            <span className="text-[11px] font-medium text-slate-400">{disk.model}</span>
          )}
        </div>
        {blocked ? (
          <span className="rounded bg-danger/10 border border-danger/20 px-2 py-0.5 text-[10px] font-bold text-danger">
            {t('storage.automatic.blockedLabel')}
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
        {disk.type && <span className="bg-black/20 px-1.5 py-0.5 rounded border border-white/5">TYPE: {disk.type}</span>}
        {disk.readonly && <span className="text-danger bg-danger/10 px-1.5 py-0.5 rounded border border-danger/20">READ-ONLY</span>}
        {disk.removable && <span className="text-warning bg-warning/10 px-1.5 py-0.5 rounded border border-warning/20">REMOVABLE</span>}
      </div>

      <PartitionBar partitions={partitions} totalBytes={totalSize} />

      {blocked && reason && (
        <div className="mt-3 text-[11px] font-medium text-danger bg-danger/5 border border-danger/10 p-2 rounded-lg">
          ⚠ {reason}
        </div>
      )}
    </div>
  );
}

function TabAutomatico({ wizard, eligibleDisks, partitions, onChange, onReload, eligiblePaths, diskInventory }) {
  const { t } = useTranslation();
  const hasDisk = eligiblePaths.has(wizard.sysDisk);
  const blocked = diskInventory.filter(d => d.eligible === false);

  return (
    <div className="p-4 space-y-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-bold text-white">{t('storage.automatic.title')}</h3>
        <button
          type="button"
          className="rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 px-3 py-1.5 text-xs text-white transition-colors"
          onClick={onReload}
        >
          {t('storage.automatic.reload')}
        </button>
      </div>

      <div>
        <div className="mb-3 text-[10px] font-bold uppercase tracking-widest text-slate-400">
          {t('storage.automatic.targetDisk')} ({eligibleDisks.length})
        </div>
        {eligibleDisks.length === 0 ? (
          <div className="py-3 text-[13px] font-medium text-slate-400 border border-white/5 bg-white/5 rounded-xl text-center">
            {t('storage.automatic.noEligible')}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3">
            {eligibleDisks.map(disk => (
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
            ))}
          </div>
        )}
      </div>

      {blocked.length > 0 && (
        <div>
          <div className="mb-3 mt-4 text-[10px] font-bold uppercase tracking-widest text-slate-400">
            {t('storage.automatic.blockedDisks')} ({blocked.length})
          </div>
          <div className="grid grid-cols-1 gap-3 opacity-80">
            {blocked.map(disk => (
              <DiskCard
                key={disk.path}
                disk={disk}
                selected={false}
                partData={partitions[disk.name ?? disk.path?.split('/').pop()]}
              />
            ))}
          </div>
        </div>
      )}

      {hasDisk && (
        <div className="pt-6 border-t border-white/5 mt-6 animate-fade-in">
          <h3 className="text-sm font-bold text-white mb-2">{t('storage.automatic.previewTitle')}</h3>
          <p className="text-xs text-slate-400 mb-4">{t('storage.automatic.previewDesc')} {wizard.sysDisk}.</p>
          
          <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4 mb-4">
            <div className="flex h-8 w-full rounded-md overflow-hidden border border-white/10 bg-black/40">
              <div className="w-[10%] bg-indigo-500/80 border-r border-black flex items-center justify-center">
                <span className="text-[10px] font-bold text-white">EFI</span>
              </div>
              <div className="flex-1 bg-accent-blue/80 flex items-center justify-center relative overflow-hidden">
                <span className="text-[11px] font-bold text-white z-10">ROOT BTRFS (~100%)</span>
              </div>
            </div>
          </div>
          
          <div className="overflow-hidden rounded-xl border border-white/10 bg-white/[0.02]">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-white/5 uppercase tracking-wider text-[10px] font-bold text-slate-400">
                <tr>
                  <th className="px-4 py-3">{t('storage.manual.mountpoint')}</th>
                  <th className="px-4 py-3">{t('storage.manual.filesystem')}</th>
                  <th className="px-4 py-3">{t('storage.manual.size')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                <tr className="hover:bg-white/[0.02]">
                  <td className="px-4 py-3 font-mono text-indigo-400">/boot/efi</td>
                  <td className="px-4 py-3">vfat (FAT32)</td>
                  <td className="px-4 py-3">512 MiB</td>
                </tr>
                <tr className="hover:bg-white/[0.02]">
                  <td className="px-4 py-3 font-mono text-accent-blue">/</td>
                  <td className="px-4 py-3">BTRFS</td>
                  <td className="px-4 py-3">~100%</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function TabManual({ wizard, onChange, eligibleDisks }) {
  const { t } = useTranslation();
  const parts = wizard.manualPartitions || [];
  
  const addPartition = () => {
    onChange({
      manualPartitions: [...parts, { 
        id: Math.random().toString(36).substr(2, 9),
        device: eligibleDisks[0]?.path || '', 
        usage: 'root',
        mountpoint: '/', 
        fstype: 'btrfs', 
        sizeInput: '20GiB',
        sizeBytes: parseSizeInput('20GiB', eligibleDisks[0]?.size_bytes || 0, eligibleDisks[0]?.size_bytes || 0),
        label: 'kryonix-root',
        format: true 
      }]
    });
  };

  const updatePart = (index, updates) => {
    const np = [...parts];
    np[index] = { ...np[index], ...updates };
    
    // Auto-calculate sizeBytes if sizeInput or device changed
    if (updates.sizeInput !== undefined || updates.device !== undefined) {
      const disk = eligibleDisks.find(d => d.path === np[index].device);
      const total = disk?.size_bytes || 0;
      const usedByOthers = np.filter((_, i) => i !== index && _.device === np[index].device).reduce((acc, p) => acc + (p.sizeBytes || 0), 0);
      const free = Math.max(0, total - usedByOthers);
      np[index].sizeBytes = parseSizeInput(np[index].sizeInput, total, free);
    }
    
    // Auto-fill fields based on usage
    if (updates.usage !== undefined) {
      const u = updates.usage;
      if (u === 'efi') { np[index].fstype = 'fat32'; np[index].mountpoint = '/boot'; np[index].label = 'EFI'; }
      if (u === 'root') { np[index].fstype = 'btrfs'; np[index].mountpoint = '/'; np[index].label = 'kryonix-root'; }
      if (u === 'home') { np[index].fstype = 'btrfs'; np[index].mountpoint = '/home'; np[index].label = 'kryonix-home'; }
      if (u === 'swap') { np[index].fstype = 'swap'; np[index].mountpoint = ''; np[index].label = 'kryonix-swap'; }
    }
    
    if (updates.fstype === 'swap') {
      np[index].usage = 'swap';
      np[index].mountpoint = '';
    }

    onChange({ manualPartitions: np });
  };

  // Validations
  const validations = [];
  const hasRoot = parts.some(p => p.mountpoint === '/');
  const hasEfi = parts.some(p => p.usage === 'efi' || p.mountpoint === '/boot' || p.mountpoint === '/boot/efi');
  const bootMode = wizard.sysDisk?.boot_mode || 'uefi';
  
  if (!hasRoot) validations.push('Falta partição root (/)');
  if (bootMode === 'uefi' && !hasEfi) validations.push('Falta partição EFI (obrigatória em UEFI)');
  
  const mps = parts.map(p => p.mountpoint).filter(Boolean);
  if (new Set(mps).size !== mps.length) validations.push('Existem pontos de montagem duplicados');
  
  const diskTotals = {};
  parts.forEach(p => {
    if (!diskTotals[p.device]) diskTotals[p.device] = 0;
    diskTotals[p.device] += p.sizeBytes || 0;
  });
  
  Object.keys(diskTotals).forEach(d => {
    const disk = eligibleDisks.find(dk => dk.path === d);
    if (disk && diskTotals[d] > disk.size_bytes) {
      validations.push(`Soma das partições excede o tamanho total do disco ${d}`);
    }
  });

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-bold text-white">Particionamento Manual</h3>
        <button type="button" onClick={addPartition} className="px-3 py-1.5 bg-accent-blue text-black text-xs font-bold rounded hover:bg-accent-blue/80 transition-colors">
          Nova Partição
        </button>
      </div>

      <div className="overflow-x-auto rounded-xl border border-white/10 bg-white/[0.02] mb-6">
        <table className="w-full text-left text-xs text-slate-300">
          <thead className="bg-white/5 uppercase tracking-wider text-[10px] font-bold text-slate-400">
            <tr>
              <th className="px-4 py-3">Disco</th>
              <th className="px-4 py-3">Tamanho</th>
              <th className="px-4 py-3">Uso</th>
              <th className="px-4 py-3">FS</th>
              <th className="px-4 py-3">Rótulo (Label)</th>
              <th className="px-4 py-3">Mountpoint</th>
              <th className="px-4 py-3 text-right">Ação</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {parts.length === 0 ? (
              <tr>
                <td colSpan="7" className="px-4 py-8 text-center text-slate-400 italic">Nenhuma partição definida</td>
              </tr>
            ) : parts.map((p, i) => (
              <tr key={p.id || i} className="hover:bg-white/[0.02]">
                <td className="px-4 py-2">
                  <select className="input-shell text-xs py-1 px-2 w-full" value={p.device} onChange={e => updatePart(i, { device: e.target.value })}>
                    {eligibleDisks.map(d => <option key={d.path} value={d.path}>{d.path}</option>)}
                  </select>
                </td>
                <td className="px-4 py-2">
                  <input type="text" className="input-shell text-xs py-1 px-2 w-20" value={p.sizeInput || p.size} onChange={e => updatePart(i, { sizeInput: e.target.value })} onBlur={e => updatePart(i, { sizeInput: e.target.value })} placeholder="20GiB" title={p.sizeBytes ? formatBytes(p.sizeBytes) : 'Inválido'} />
                </td>
                <td className="px-4 py-2">
                  <select className="input-shell text-xs py-1 px-2 w-full" value={p.usage} onChange={e => updatePart(i, { usage: e.target.value })}>
                    <option value="efi">EFI</option>
                    <option value="root">Root</option>
                    <option value="home">Home</option>
                    <option value="swap">Swap</option>
                    <option value="data">Dados</option>
                    <option value="custom">Custom</option>
                  </select>
                </td>
                <td className="px-4 py-2">
                  <select className="input-shell text-xs py-1 px-2 w-full" value={p.fstype} onChange={e => updatePart(i, { fstype: e.target.value })}>
                    <option value="btrfs">BTRFS</option>
                    <option value="ext4">EXT4</option>
                    <option value="fat32">FAT32 (EFI)</option>
                    <option value="xfs">XFS</option>
                    <option value="swap">SWAP</option>
                  </select>
                </td>
                <td className="px-4 py-2">
                  <input type="text" className="input-shell text-xs py-1 px-2 w-24" value={p.label || ''} onChange={e => updatePart(i, { label: e.target.value })} placeholder="kryonix-root" />
                </td>
                <td className="px-4 py-2">
                  <input type="text" className="input-shell text-xs py-1 px-2 w-24" value={p.mountpoint || ''} onChange={e => updatePart(i, { mountpoint: e.target.value })} disabled={p.usage === 'swap' || p.fstype === 'swap'} placeholder={p.usage === 'swap' ? 'N/A' : '/'} title={p.usage === 'swap' ? 'Swap não usa ponto de montagem' : ''} />
                </td>
                <td className="px-4 py-2 text-right">
                  <button type="button" onClick={() => {
                    const np = parts.filter((_, idx) => idx !== i); onChange({manualPartitions: np});
                  }} className="text-danger hover:text-white px-2 py-1 rounded bg-danger/10 hover:bg-danger/20 transition-colors">X</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {validations.length > 0 && (
        <div className="mb-6 bg-danger/10 border border-danger/20 rounded-xl p-4 text-danger text-sm">
          <strong className="block mb-2">Erros de Validação:</strong>
          <ul className="list-disc pl-5">
            {validations.map((v, i) => <li key={i}>{v}</li>)}
          </ul>
        </div>
      )}

      {parts.length > 0 && eligibleDisks.map(disk => {
        const diskParts = parts.filter(p => p.device === disk.path);
        if (diskParts.length === 0) return null;
        return (
          <div key={disk.path} className="mb-4">
            <h4 className="text-xs font-bold text-slate-400 mb-1">{disk.path} ({formatBytes(disk.size_bytes)})</h4>
            <PartitionBar partitions={diskParts} totalBytes={disk.size_bytes} />
          </div>
        );
      })}
    </div>
  );
}

function TabLVM({ wizard, onChange, eligibleDisks }) {
  const { t } = useTranslation();
  const lvm = wizard.lvmPlan || { vgName: 'kryonix-vg', physicalVolumes: [], logicalVolumes: [] };
  
  const togglePV = (path) => {
    const pvs = new Set(lvm.physicalVolumes);
    if (pvs.has(path)) pvs.delete(path);
    else pvs.add(path);
    onChange({ lvmPlan: { ...lvm, physicalVolumes: Array.from(pvs) }});
  };

  const addLV = () => {
    onChange({ lvmPlan: { ...lvm, logicalVolumes: [...lvm.logicalVolumes, { name: '', size: '', mountpoint: '/', fstype: 'btrfs' }]}});
  };
  
  return (
    <div className="p-4">
      <div className="mb-4 bg-warning/10 border border-warning/20 rounded-xl p-4 flex gap-3 text-warning text-sm">
        <span className="text-xl">⚠</span>
        <div>
          <strong className="block mb-1">{t('storage.lvm.warningTitle')}</strong>
          {t('storage.lvm.warningDesc')}
        </div>
      </div>

      <h3 className="text-sm font-bold text-white mb-3">{t('storage.lvm.physicalVolumes')}</h3>
      <div className="grid grid-cols-2 gap-3 mb-6">
        {eligibleDisks.map(disk => {
          const isSel = lvm.physicalVolumes.includes(disk.path);
          return (
            <label key={disk.path} className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${isSel ? 'bg-accent-blue/10 border-accent-blue/40' : 'bg-white/5 border-white/10 hover:bg-white/10'}`}>
              <input type="checkbox" className="hidden" checked={isSel} onChange={() => togglePV(disk.path)} />
              <div className={`w-4 h-4 rounded border flex items-center justify-center ${isSel ? 'bg-accent-blue border-accent-blue text-black' : 'border-white/30 bg-black/40'}`}>
                {isSel && <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
              </div>
              <div>
                <div className="text-sm font-bold text-white">{disk.path}</div>
                <div className="text-[10px] text-slate-400">{getDiskCapacityLabel(disk)}</div>
              </div>
            </label>
          )
        })}
      </div>

      <h3 className="text-sm font-bold text-white mb-2">{t('storage.lvm.vgStep')}</h3>
      <div className="mb-6">
        <input type="text" className="input-shell w-full max-w-xs" value={lvm.vgName} onChange={e => onChange({ lvmPlan: { ...lvm, vgName: e.target.value }})} placeholder="vg0" />
      </div>

      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-bold text-white">{t('storage.lvm.logicalVolumes')}</h3>
        <button type="button" onClick={addLV} className="px-3 py-1.5 bg-accent-blue text-black text-xs font-bold rounded hover:bg-accent-blue/80 transition-colors">
          {t('storage.lvm.newLV')}
        </button>
      </div>

      <div className="overflow-hidden rounded-xl border border-white/10 bg-white/[0.02]">
        <table className="w-full text-left text-xs text-slate-300">
          <thead className="bg-white/5 uppercase tracking-wider text-[10px] font-bold text-slate-400">
            <tr>
              <th className="px-4 py-3">{t('storage.lvm.lvName')}</th>
              <th className="px-4 py-3">{t('storage.lvm.size')}</th>
              <th className="px-4 py-3">{t('storage.lvm.mountpoint')}</th>
              <th className="px-4 py-3 text-right">{t('storage.lvm.action')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {lvm.logicalVolumes.length === 0 ? (
              <tr>
                <td colSpan="4" className="px-4 py-8 text-center text-slate-400 italic">{t('storage.lvm.empty')}</td>
              </tr>
            ) : lvm.logicalVolumes.map((lv, i) => (
              <tr key={i} className="hover:bg-white/[0.02]">
                <td className="px-4 py-2">
                  <input type="text" className="input-shell text-xs py-1 px-2 w-32" value={lv.name} onChange={e => {
                    const nl = [...lvm.logicalVolumes]; nl[i].name = e.target.value; onChange({lvmPlan: {...lvm, logicalVolumes: nl}});
                  }} />
                </td>
                <td className="px-4 py-2">
                  <input type="text" className="input-shell text-xs py-1 px-2 w-24" value={lv.size} onChange={e => {
                    const nl = [...lvm.logicalVolumes]; nl[i].size = e.target.value; onChange({lvmPlan: {...lvm, logicalVolumes: nl}});
                  }} />
                </td>
                <td className="px-4 py-2">
                  <input type="text" className="input-shell text-xs py-1 px-2 w-24" value={lv.mountpoint} onChange={e => {
                    const nl = [...lvm.logicalVolumes]; nl[i].mountpoint = e.target.value; onChange({lvmPlan: {...lvm, logicalVolumes: nl}});
                  }} />
                </td>
                <td className="px-4 py-2 text-right">
                  <button type="button" onClick={() => {
                    const nl = lvm.logicalVolumes.filter((_, idx) => idx !== i); onChange({lvmPlan: {...lvm, logicalVolumes: nl}});
                  }} className="text-danger hover:text-white px-2 py-1 rounded bg-danger/10 hover:bg-danger/20 transition-colors">{t('storage.lvm.remove')}</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function TabRAID({ wizard, onChange, eligibleDisks }) {
  const { t } = useTranslation();
  const raid = wizard.raidPlan || { level: 'raid1', devices: [], filesystem: 'btrfs', mountpoint: '/' };
  
  const toggleDevice = (path) => {
    const devs = new Set(raid.devices);
    if (devs.has(path)) devs.delete(path);
    else devs.add(path);
    onChange({ raidPlan: { ...raid, devices: Array.from(devs) }});
  };

  const raidOpts = getRaidOptionsForSelection(eligibleDisks.filter(d => raid.devices.includes(d.path)));
  const currentOpt = raidOpts.find(o => o.id === raid.level);

  if (eligibleDisks.length < 2) {
    return (
      <div className="p-4 flex items-center justify-center h-full">
        <div className="text-center p-6 border border-white/10 bg-white/5 rounded-2xl max-w-sm">
          <div className="w-12 h-12 bg-white/5 rounded-full flex items-center justify-center mx-auto mb-4 border border-white/10 text-white">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" /></svg>
          </div>
          <h3 className="text-lg font-bold text-white mb-2">{t('storage.raid.unavailable')}</h3>
          <p className="text-sm text-slate-400">{t('storage.raid.requiresTwoDisks')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-6">
      <div>
        <h3 className="text-sm font-bold text-white mb-3">{t('storage.raid.level')}</h3>
        <div className="grid grid-cols-2 gap-3">
          {raidOpts.map(opt => (
            <label key={opt.id} className={`flex flex-col gap-1 p-3 rounded-xl border cursor-pointer transition-colors ${raid.level === opt.id ? 'bg-accent-blue/10 border-accent-blue/40' : 'bg-white/5 border-white/10 hover:bg-white/10'}`}>
              <input type="radio" name="raidLevel" className="hidden" checked={raid.level === opt.id} onChange={() => onChange({ raidPlan: { ...raid, level: opt.id }})} />
              <div className="flex items-center justify-between">
                <span className="font-bold text-white text-sm">{opt.label}</span>
                <span className="text-[10px] uppercase tracking-wider text-slate-400">{opt.shortLabel}</span>
              </div>
              <p className="text-xs text-slate-400 mt-1">{opt.description}</p>
            </label>
          ))}
        </div>
      </div>

      <div>
        <h3 className="text-sm font-bold text-white mb-3">{t('storage.raid.selectDisks')}</h3>
        <div className="grid grid-cols-1 gap-2">
          {eligibleDisks.map(disk => {
            const isSel = raid.devices.includes(disk.path);
            return (
              <label key={disk.path} className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${isSel ? 'bg-accent-blue/10 border-accent-blue/40' : 'bg-white/5 border-white/10 hover:bg-white/10'}`}>
                <input type="checkbox" className="hidden" checked={isSel} onChange={() => toggleDevice(disk.path)} />
                <div className={`w-4 h-4 rounded border flex items-center justify-center ${isSel ? 'bg-accent-blue border-accent-blue text-black' : 'border-white/30 bg-black/40'}`}>
                  {isSel && <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
                </div>
                <div className="flex-1 flex items-center justify-between">
                  <div className="text-sm font-bold text-white">{disk.path}</div>
                  <div className="text-xs text-slate-400">{getDiskCapacityLabel(disk)}</div>
                </div>
              </label>
            )
          })}
        </div>
      </div>
      
      {currentOpt && raid.devices.length > 0 && (
        <div className={`p-4 rounded-xl border ${currentOpt.enabled ? 'bg-indigo-500/10 border-indigo-500/20' : 'bg-warning/10 border-warning/20'}`}>
          <h4 className="text-xs font-bold uppercase tracking-wider text-white mb-2">{t('storage.raid.estimatedPlan')}</h4>
          {!currentOpt.enabled ? (
            <div className="text-sm text-warning">
              {currentOpt.blockingReasons[0]}
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <div className="flex justify-between items-center text-sm">
                <span className="text-slate-400">{t('storage.raid.effectiveCapacity')}:</span>
                <span className="font-bold text-white">{currentOpt.summary?.usableLabel || '?'}</span>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="text-slate-400">{t('storage.raid.faultTolerance')}:</span>
                <span className="font-bold text-white">{currentOpt.summary?.faultTolerance}</span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function Disks({ wizard, uiState, onChange, validation }) {
  const { t } = useTranslation();
  const modeIndex = TABS_ID.indexOf(wizard.storageMode);
  const activeTab = modeIndex >= 0 ? modeIndex : 0;

  const setActiveTab = (index) => {
    onChange({ storageMode: TABS_ID[index] });
  };

  const [diskInventory, setDiskInventory] = useState([]);
  const [loadingDisks, setLoadingDisks]   = useState(true);
  const [diskError, setDiskError]         = useState('');
  const [reloadKey, setReloadKey]         = useState(0);
  const reloadDisks = () => setReloadKey(k => k + 1);

  const [partitions, setPartitions] = useState({});
  const [destructiveConfirmed, setDestructiveConfirmed] = useState(uiState.destructiveConfirmed || false);

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
          setDiskError(getInstallerApiErrorMessage(err, 'Error'));
          setDiskInventory([]);
        }
      })
      .finally(() => { if (!cancelled) setLoadingDisks(false); });

    return () => { cancelled = true; };
  }, [reloadKey]);

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
  const layoutMode     = wizard.storageMode || 'automatic';

  useEffect(() => {
    if (destructiveConfirmed !== uiState.destructiveConfirmed) {
      onChange({ destructiveConfirmed });
    }
  }, [destructiveConfirmed, uiState.destructiveConfirmed, onChange]);

  useEffect(() => {
    if (loadingDisks) return;
    const firstEligible  = eligibleDisks[0]?.path || '';
    const patch = {};

    if (layoutMode === 'automatic') {
      const nextSys = eligiblePaths.has(wizard.sysDisk) ? wizard.sysDisk : firstEligible;
      if (wizard.sysDisk !== nextSys) patch.sysDisk = nextSys;
      if (!arraysEqual(wizard.selectedDisks || [], nextSys ? [nextSys] : [])) patch.selectedDisks = nextSys ? [nextSys] : [];
    }

    let storageIssues = [];
    
    const hasDisksSelected = 
      (layoutMode === 'automatic' && wizard.sysDisk) || 
      (layoutMode === 'raid' && wizard.raidPlan?.devices?.length > 0) ||
      (layoutMode === 'lvm' && wizard.lvmPlan?.physicalVolumes?.length > 0) ||
      (layoutMode === 'manual' && wizard.manualPartitions?.length > 0);

    if (hasDisksSelected && !destructiveConfirmed) {
      storageIssues.push(t('storage.destructive.confirm'));
    }

    if (!arraysEqual(storageIssues, uiState.storageBlockingIssues || [])) patch.storageBlockingIssues = storageIssues;
    
    if (Object.keys(patch).length > 0) onChange(patch);
  }, [diskInventory, eligibleDisks, eligiblePaths, layoutMode, loadingDisks,
      onChange, uiState.storageBlockingIssues, destructiveConfirmed,
      wizard.sysDisk, wizard.raidPlan, wizard.lvmPlan, wizard.manualPartitions, wizard.selectedDisks, t]);

  let affectedCapacity = 0;
  let affectedDisksText = '';
  
  if (layoutMode === 'automatic' && wizard.sysDisk) {
    const d = diskInventory.find(d => d.path === wizard.sysDisk);
    if (d) { affectedCapacity = d.sizeBytes; affectedDisksText = d.path; }
  } else if (layoutMode === 'raid' && wizard.raidPlan?.devices?.length > 0) {
    const sel = diskInventory.filter(d => wizard.raidPlan.devices.includes(d.path));
    affectedCapacity = sel.reduce((a, b) => a + (b.sizeBytes || 0), 0);
    affectedDisksText = `${sel.length} ${t('storage.manual.disk')}s`;
  } else if (layoutMode === 'lvm' && wizard.lvmPlan?.physicalVolumes?.length > 0) {
    const sel = diskInventory.filter(d => wizard.lvmPlan.physicalVolumes.includes(d.path));
    affectedCapacity = sel.reduce((a, b) => a + (b.sizeBytes || 0), 0);
    affectedDisksText = `${sel.length} ${t('storage.manual.disk')}s (LVM)`;
  } else if (layoutMode === 'manual' && wizard.manualPartitions?.length > 0) {
    const pds = Array.from(new Set(wizard.manualPartitions.map(p => p.device).filter(Boolean)));
    const sel = diskInventory.filter(d => pds.includes(d.path));
    affectedCapacity = sel.reduce((a, b) => a + (b.sizeBytes || 0), 0);
    affectedDisksText = `${sel.length} ${t('storage.manual.disk')}s`;
  }

  const tabLabels = [
    t('storage.tabs.automatic'),
    t('storage.tabs.manual'),
    t('storage.tabs.lvm'),
    t('storage.tabs.raid')
  ];

  return (
    <div className="flex h-full gap-6">
      
      <div className="flex-1 min-w-0 flex flex-col h-full bg-white/[0.02] border border-white/5 rounded-2xl overflow-hidden">
        <div className="shrink-0 flex border-b border-white/5 bg-black/20">
          {tabLabels.map((label, i) => {
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

        <div className="flex-1 overflow-auto custom-scrollbar">
          {loadingDisks ? (
            <div className="flex h-full items-center justify-center text-sm text-slate-400">
              <div className="mr-3 h-4 w-4 animate-spin rounded-full border-2 border-accent-blue border-t-transparent" />
              {t('storage.plan.detecting')}
            </div>
          ) : diskError ? (
            <div className="p-4">
              <div className="py-4 text-[13px] font-medium text-danger">✗ {diskError}</div>
            </div>
          ) : (
            <>
              {activeTab === 0 && (
                <TabAutomatico
                  wizard={wizard}
                  onChange={onChange}
                  eligibleDisks={eligibleDisks}
                  eligiblePaths={eligiblePaths}
                  diskInventory={diskInventory}
                  partitions={partitions}
                  onReload={reloadDisks}
                />
              )}
              {activeTab === 1 && <TabManual wizard={wizard} onChange={onChange} eligibleDisks={eligibleDisks} />}
              {activeTab === 2 && <TabLVM wizard={wizard} onChange={onChange} eligibleDisks={eligibleDisks} />}
              {activeTab === 3 && <TabRAID wizard={wizard} onChange={onChange} eligibleDisks={eligibleDisks} />}
            </>
          )}
        </div>
      </div>

      <div className="w-[340px] shrink-0 flex flex-col gap-4 overflow-y-auto min-h-0 pb-2 custom-scrollbar pr-1">
        
        <div className="shrink-0 rounded-2xl border border-white/10 bg-white/5 p-5">
          <h3 className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-4">{t('storage.plan.title')}</h3>
          
          {!affectedDisksText ? (
            <div className="text-sm text-slate-400 text-center py-4">
              {t('storage.plan.empty')}
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-2 mt-2">
                <div className="flex justify-between items-center text-xs border-b border-white/5 pb-2">
                  <span className="text-slate-500">{t('storage.plan.mode')}</span>
                  <span className="font-bold text-white uppercase">{layoutMode}</span>
                </div>
                <div className="flex justify-between items-center text-xs border-b border-white/5 pb-2">
                  <span className="text-slate-500">{t('storage.plan.targets')}</span>
                  <span className="font-bold text-accent-blue truncate max-w-[150px]">{affectedDisksText}</span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-500">{t('storage.plan.capacity')}</span>
                  <span className="font-bold text-white">{formatBytes(affectedCapacity)}</span>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className={`shrink-0 rounded-2xl border p-5 transition-colors ${
          !affectedDisksText ? 'opacity-50 pointer-events-none border-white/5 bg-black/20' : 
          destructiveConfirmed ? 'border-warning/30 bg-warning/5' : 'border-danger/30 bg-danger/10'
        }`}>
          <div className="flex items-center gap-3 mb-3">
            <div className={`flex w-8 h-8 rounded-full items-center justify-center ${destructiveConfirmed ? 'bg-warning/20 text-warning' : 'bg-danger/20 text-danger'}`}>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <h3 className={`text-sm font-bold ${destructiveConfirmed ? 'text-warning' : 'text-danger'}`}>
              {t('storage.destructive.title')}
            </h3>
          </div>
          
          <p className="text-xs text-slate-300 leading-relaxed mb-5">
            {t('storage.destructive.description')}
          </p>

          <label className="flex items-start gap-3 cursor-pointer group">
            <input
              type="checkbox"
              className={`mt-0.5 h-5 w-5 shrink-0 rounded border-white/20 bg-black/40 text-warning focus:ring-warning/50 appearance-none checked:appearance-auto cursor-pointer`}
              checked={destructiveConfirmed}
              onChange={(e) => setDestructiveConfirmed(e.target.checked)}
            />
            <span className={`text-xs leading-tight font-medium transition-colors ${destructiveConfirmed ? 'text-warning' : 'text-slate-300 group-hover:text-white'}`}>
              {t('storage.destructive.confirm')}
            </span>
          </label>
        </div>

      </div>
    </div>
  );
}
