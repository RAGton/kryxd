import { useState } from 'react';
import { loginGateway } from '../lib/api.js';

export default function Login({ onLogin }) {
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');
    setLoading(true);
    try {
      const session = await loginGateway({ username, password });
      onLogin?.(session);
    } catch (err) {
      setError(err.message || 'Falha ao autenticar no KCP');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-slate-950 px-6 text-white">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(59,130,246,0.16),transparent_34%),radial-gradient(circle_at_bottom_right,rgba(14,165,233,0.08),transparent_32%)]" />
      <div className="absolute left-1/2 top-1/2 h-72 w-72 -translate-x-1/2 -translate-y-1/2 rounded-full bg-blue-500/10 blur-3xl" />

      <section className="relative w-full max-w-md rounded-2xl border border-white/5 bg-slate-900/50 p-8 shadow-[0_0_30px_rgba(59,130,246,0.1)] backdrop-blur-md">
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="mb-5 flex h-16 w-16 animate-pulse items-center justify-center rounded-2xl border border-blue-400/30 bg-blue-500/10 text-3xl font-black text-blue-400 shadow-[0_0_34px_rgba(59,130,246,0.35)]">
            K
          </div>
          <p className="text-xs font-bold uppercase tracking-[0.28em] text-blue-400">Kryonix Control Plane</p>
          <h1 className="mt-3 text-3xl font-black tracking-tight">Enterprise Gateway</h1>
          <p className="mt-2 text-sm leading-6 text-slate-400">
            Sessão efêmera para acessar a topologia do cluster e recursos do host.
          </p>
        </div>

        <form className="space-y-4" onSubmit={handleSubmit}>
          <label className="block">
            <span className="mb-2 block text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Usuário</span>
            <input
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              autoComplete="username"
              className="w-full rounded-xl border border-slate-800 bg-slate-950 px-4 py-3 text-white outline-none transition-colors placeholder:text-slate-600 focus:border-blue-500"
              placeholder="admin"
            />
          </label>

          <label className="block">
            <span className="mb-2 block text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Senha</span>
            <input
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              type="password"
              autoComplete="current-password"
              className="w-full rounded-xl border border-slate-800 bg-slate-950 px-4 py-3 text-white outline-none transition-colors placeholder:text-slate-600 focus:border-blue-500"
              placeholder="••••••••••••"
            />
          </label>

          {error && (
            <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-blue-500 px-4 py-3 font-black text-white shadow-[0_0_30px_rgba(59,130,246,0.22)] transition hover:bg-blue-400 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? 'Autenticando…' : 'Entrar no KCP'}
          </button>
        </form>

        <p className="mt-5 text-center text-xs text-slate-500">
          Cookie de sessão HttpOnly • SameSite Strict • expiração curta
        </p>
      </section>
    </main>
  );
}
