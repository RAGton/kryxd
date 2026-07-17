import { useState } from 'react';
import { AlertTriangle, CheckCircle2, Loader2, Search, X } from 'lucide-react';
import { Outlet } from 'react-router-dom';
import TreeView from '../components/kcp/TreeView.jsx';
import { createInstance } from '../lib/api.js';

const DEFAULT_CREATE_FORM = {
  name: '',
  kind: 'vm',
  image: 'images:ubuntu/24.04',
  cpu: '2',
  ram_mb: '2048',
  disk_gb: '20',
  network_bridge: 'incusbr0',
};

function Field({ label, children }) {
  return (
    <label className="space-y-1.5 text-xs font-bold uppercase tracking-wider text-slate-500">
      <span>{label}</span>
      {children}
    </label>
  );
}

const fieldClass = 'w-full rounded-lg border border-slate-800 bg-black/40 px-3 py-2 text-sm text-slate-100 outline-none transition focus:border-blue-500/60';

export default function DashboardLayoutWithTree() {
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState(DEFAULT_CREATE_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState(null);

  const updateField = (field) => (event) => {
    setCreateForm((current) => ({ ...current, [field]: event.target.value }));
  };

  const closeCreateModal = () => {
    if (!submitting) {
      setCreateOpen(false);
    }
  };

  const submitCreate = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    setToast(null);

    try {
      const payload = {
        ...createForm,
        cpu: Number(createForm.cpu),
        ram_mb: Number(createForm.ram_mb),
        disk_gb: Number(createForm.disk_gb),
      };
      const response = await createInstance(payload);
      setToast({
        kind: 'success',
        text: `${payload.kind.toUpperCase()} ${payload.name} enviada ao Incus${response?.task_id ? ` · task ${response.task_id}` : ''}`,
      });
      setCreateOpen(false);
      setCreateForm(DEFAULT_CREATE_FORM);
      window.dispatchEvent(new CustomEvent('kve:topology-refresh'));
      window.setTimeout(() => setToast(null), 5000);
    } catch (err) {
      setToast({
        kind: 'error',
        text: err instanceof Error ? err.message : 'Falha ao criar instância no Incus',
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-[#0a0a0a] text-slate-100 font-sans">
      <header className="flex h-16 shrink-0 items-center justify-between border-b border-slate-800 bg-slate-950/80 px-5 backdrop-blur">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-blue-500/30 bg-blue-600 text-sm font-black text-white shadow-[0_0_30px_rgba(59,130,246,0.18)]">
            K
          </div>
          <div>
            <p className="text-sm font-black uppercase tracking-[0.2em] text-white">Kryonix VE</p>
            <p className="text-xs text-slate-500">Industrial Control Plane</p>
          </div>
        </div>

        <div className="hidden w-full max-w-xl items-center gap-3 rounded-xl border border-slate-800 bg-slate-950 px-4 py-2 text-sm text-slate-500 md:flex">
          <Search size={16} className="text-slate-600" />
          <input
            aria-label="Global Search"
            className="w-full bg-transparent text-slate-300 placeholder:text-slate-600 focus:outline-none"
            placeholder="Global Search: node, VM, CT, storage…"
            readOnly
          />
        </div>

        <button
          type="button"
          onClick={() => setCreateOpen(true)}
          className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white shadow-[0_0_28px_rgba(37,99,235,0.22)] transition hover:bg-blue-500"
        >
          Create VM/CT
        </button>
      </header>

      {toast && (
        <div className={`fixed right-5 top-20 z-[120] flex max-w-md items-center gap-3 rounded-xl border px-4 py-3 text-sm shadow-2xl ${
          toast.kind === 'success'
            ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
            : 'border-red-500/30 bg-red-500/10 text-red-200'
        }`}>
          {toast.kind === 'success' ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}
          <span>{toast.text}</span>
        </div>
      )}

      {createOpen && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
          <form onSubmit={submitCreate} className="w-full max-w-xl overflow-hidden rounded-2xl border border-slate-800 bg-slate-950 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 bg-slate-900/70 px-6 py-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.22em] text-blue-400">Incus Deploy</p>
                <h2 className="mt-1 text-lg font-black text-white">Create VM / CT</h2>
              </div>
              <button
                type="button"
                onClick={closeCreateModal}
                disabled={submitting}
                className="rounded-lg p-2 text-slate-500 transition hover:bg-slate-800 hover:text-white disabled:cursor-wait disabled:opacity-50"
              >
                <X size={18} />
              </button>
            </div>

            <div className="grid gap-4 p-6 md:grid-cols-2">
              <Field label="Nome">
                <input className={fieldClass} value={createForm.name} onChange={updateField('name')} placeholder="vm-app-01" required />
              </Field>
              <Field label="Tipo">
                <select className={fieldClass} value={createForm.kind} onChange={updateField('kind')}>
                  <option value="vm">Virtual Machine</option>
                  <option value="ct">Container</option>
                </select>
              </Field>
              <Field label="Imagem">
                <input className={fieldClass} value={createForm.image} onChange={updateField('image')} placeholder="images:ubuntu/24.04" required />
              </Field>
              <Field label="Bridge / Network">
                <input className={fieldClass} value={createForm.network_bridge} onChange={updateField('network_bridge')} placeholder="incusbr0" required />
              </Field>
              <Field label="CPU">
                <input className={fieldClass} type="number" min="1" value={createForm.cpu} onChange={updateField('cpu')} required />
              </Field>
              <Field label="RAM MB">
                <input className={fieldClass} type="number" min="256" step="256" value={createForm.ram_mb} onChange={updateField('ram_mb')} required />
              </Field>
              <Field label="Disco GB">
                <input className={fieldClass} type="number" min="1" value={createForm.disk_gb} onChange={updateField('disk_gb')} required />
              </Field>
              <div className="rounded-lg border border-blue-500/20 bg-blue-500/10 p-3 text-xs text-blue-100">
                O frontend envia apenas o payload declarativo para o kryxd. Socket root do Incus e credenciais ficam só no backend.
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 border-t border-slate-800 bg-slate-900/60 px-6 py-4">
              <button
                type="button"
                onClick={closeCreateModal}
                disabled={submitting}
                className="rounded-lg px-4 py-2 text-sm font-bold text-slate-400 transition hover:text-white disabled:cursor-wait disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-blue-500 disabled:cursor-wait disabled:opacity-60"
              >
                {submitting && <Loader2 size={16} className="animate-spin" />}
                {submitting ? 'Deploying…' : 'Deploy'}
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <TreeView />
        <main className="min-w-0 flex-1 overflow-hidden bg-[#0a0a0a]">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
