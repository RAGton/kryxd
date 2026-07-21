import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  ShieldAlert, 
  Lock, 
  User, 
  ArrowRight, 
  Zap, 
  ShieldCheck, 
  Globe, 
  Server, 
  ChevronDown, 
  ChevronUp, 
  Network 
} from 'lucide-react';

import logoImg from '../assets/logo.png';

interface LoginProps {
  onLogin: (session?: unknown) => void;
}

const Login: React.FC<LoginProps> = ({ onLogin }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [operationalScope, setOperationalScope] = useState<'node' | 'cluster'>('cluster');
  const [targetHost, setTargetHost] = useState('');
  const [realm, setRealm] = useState('pve');
  const [realmDropdownOpen, setRealmDropdownOpen] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    try {
      const response = await fetch('/api/v1/auth/login', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password, realm }),
      });

      if (!response.ok) {
        const detail = await response.json().catch(() => ({}));
        throw new Error(detail.error || 'Credenciais inválidas para o KVE Gateway.');
      }

      const session = await response.json();
      localStorage.setItem('kve_operational_scope', operationalScope);
      if (targetHost) {
        localStorage.setItem('kve_remote_ip', targetHost);
      } else {
        localStorage.removeItem('kve_remote_ip');
      }
      onLogin(session);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha de autenticação no KVE Gateway.');
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center p-4 relative overflow-hidden bg-kve-bg">
      {/* Background Effects (Simplified version of BackgroundMosaic for Login) */}
      <div className="absolute inset-0 z-0">
        <div className="absolute inset-0 bg-gradient-to-br from-kve-bg via-[#0a0d1a] to-[#020305]" />
        <div className="absolute inset-0 technical-grid opacity-30" />
        <div className="absolute inset-0 hex-grid opacity-10" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-kve-accent/10 blur-[120px] rounded-full" />
      </div>

      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-md z-10"
      >
        <div className="glass border border-kve-border rounded-2xl p-8 shadow-2xl relative overflow-hidden">
          {/* Top Accent Line */}
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-kve-accent to-transparent" />
          
          <div className="flex flex-col items-center mb-6">
            <motion.div 
              className="w-16 h-16 rounded-2xl flex items-center justify-center shadow-[0_0_30px_rgba(56,189,248,0.4)] mb-4 overflow-hidden border border-kve-border bg-black"
              animate={{ rotateY: [0, 360] }}
              transition={{ duration: 10, repeat: Infinity, ease: "linear" }}
            >
              <img src={logoImg} alt="Kryonix Logo" className="w-full h-full object-cover" />
            </motion.div>
            <h1 className="text-2xl font-black text-white tracking-tighter text-center">KRYONIX</h1>
            <p className="text-slate-500 text-[10px] font-mono uppercase tracking-[0.3em] mt-2">Infrastructure Control v1.2.4</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            
            {/* Operational Scope Premium Selector */}
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Escopo Operacional (Operational Scope)</label>
              <div className="grid grid-cols-2 gap-2 bg-slate-950/60 p-1 border border-kve-border rounded-xl">
                <button
                  type="button"
                  onClick={() => setOperationalScope('node')}
                  className={`py-2 px-3 rounded-lg text-[10px] font-bold uppercase transition-all flex items-center justify-center gap-2 ${
                    operationalScope === 'node' 
                      ? 'bg-kve-accent text-kve-bg shadow-[0_0_15px_rgba(56,189,248,0.3)]' 
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/30'
                  }`}
                >
                  <Server size={12} />
                  Node Server
                </button>
                <button
                  type="button"
                  onClick={() => setOperationalScope('cluster')}
                  className={`py-2 px-3 rounded-lg text-[10px] font-bold uppercase transition-all flex items-center justify-center gap-2 ${
                    operationalScope === 'cluster' 
                      ? 'bg-kve-accent text-kve-bg shadow-[0_0_15px_rgba(56,189,248,0.3)]' 
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/30'
                  }`}
                >
                  <Globe size={12} />
                  KVE
                </button>
              </div>
              <p className="text-[9px] text-slate-500 text-center leading-normal">
                {operationalScope === 'node' 
                  ? '🖥️ Gerenciamento de sistemas diskless e boot de rede.' 
                  : '🌐 Gerenciamento do sistema KVE de virtualização.'}
              </p>
            </div>

            {/* Target Host / Remote IP - Collapsible Accordion */}
            <div className="border-t border-b border-kve-border/40 py-2">
              <button
                type="button"
                onClick={() => setShowAdvanced(!showAdvanced)}
                className="w-full flex items-center justify-between text-[10px] font-bold text-slate-400 uppercase tracking-wider hover:text-white transition-colors"
              >
                <span className="flex items-center gap-1.5">
                  <Network size={12} className="text-kve-accent" />
                  Target Host / Remote IP (Opcional)
                </span>
                {showAdvanced ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
              </button>
              
              <AnimatePresence>
                {showAdvanced && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden pt-2"
                  >
                    <div className="relative group">
                      <Globe className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-600 group-focus-within:text-kve-accent transition-colors" size={14} />
                      <input 
                        type="text" 
                        placeholder="Ex: 192.168.1.10" 
                        className="w-full bg-slate-900/40 border border-kve-border rounded-lg pl-9 pr-3 py-2 text-xs text-white focus:outline-none focus:border-kve-accent/50 transition-all placeholder:text-slate-700 font-mono"
                        value={targetHost}
                        onChange={(e) => setTargetHost(e.target.value)}
                      />
                    </div>
                    <p className="text-[9px] text-slate-600 mt-1">Conecte-se e controle frotas remotas alternativas.</p>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Credentials Fields */}
            <div className="space-y-4">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Identificador de Acesso</label>
                <div className="relative group">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-kve-accent transition-colors" size={16} />
                  <input 
                    type="text" 
                    placeholder="Username / UID (admin)" 
                    className="w-full bg-slate-900/50 border border-kve-border rounded-xl pl-9 pr-4 py-2.5 text-xs text-white focus:outline-none focus:border-kve-accent/50 transition-all placeholder:text-slate-700"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Chave de Segurança</label>
                <div className="relative group">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-kve-accent transition-colors" size={16} />
                  <input 
                    type="password" 
                    placeholder="Chave (admin)" 
                    className="w-full bg-slate-900/50 border border-kve-border rounded-xl pl-9 pr-4 py-2.5 text-xs text-white focus:outline-none focus:border-kve-accent/50 transition-all placeholder:text-slate-700"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                </div>
              </div>
              
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Realm</label>
                <div className="relative group">
                  <ShieldCheck className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-kve-accent transition-colors z-10 pointer-events-none" size={16} />
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setRealmDropdownOpen(!realmDropdownOpen)}
                      className={`w-full bg-slate-900/50 border rounded-xl pl-9 pr-9 py-2.5 text-xs text-white text-left focus:outline-none transition-all flex items-center justify-between ${realmDropdownOpen ? 'border-kve-accent/50 shadow-[0_0_10px_rgba(56,189,248,0.1)]' : 'border-kve-border hover:border-slate-700'}`}
                    >
                      <span className="truncate">
                        {realm === 'pam' && 'Linux PAM standard authentication'}
                        {realm === 'pve' && 'Kryonix VE authentication server'}
                        {realm === 'ldap' && 'LDAP Directory'}
                      </span>
                      <ChevronDown className={`absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none transition-transform duration-200 ${realmDropdownOpen ? 'rotate-180' : ''}`} size={14} />
                    </button>
                    
                    <AnimatePresence>
                      {realmDropdownOpen && (
                        <>
                          <div 
                            className="fixed inset-0 z-40" 
                            onClick={() => setRealmDropdownOpen(false)}
                          />
                          <motion.div
                            initial={{ opacity: 0, y: -5 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -5 }}
                            transition={{ duration: 0.15 }}
                            className="absolute top-full left-0 w-full mt-2 bg-slate-900 border border-kve-border rounded-xl shadow-2xl py-1.5 z-50 overflow-hidden"
                          >
                            {[
                              { id: 'pam', label: 'Linux PAM standard authentication' },
                              { id: 'pve', label: 'Kryonix VE authentication server' },
                              { id: 'ldap', label: 'LDAP Directory' }
                            ].map((option) => (
                              <button
                                key={option.id}
                                type="button"
                                onClick={() => {
                                  setRealm(option.id);
                                  setRealmDropdownOpen(false);
                                }}
                                className={`w-full text-left px-4 py-2 text-xs transition-colors ${
                                  realm === option.id 
                                    ? 'bg-kve-accent/10 text-kve-accent font-medium' 
                                    : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                                }`}
                              >
                                {option.label}
                              </button>
                            ))}
                          </motion.div>
                        </>
                      )}
                    </AnimatePresence>
                  </div>
                </div>
              </div>
            </div>

            {error && (
              <motion.div 
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                className="p-3 rounded-lg bg-kve-danger/10 border border-kve-danger/20 flex items-center gap-3"
              >
                <Zap className="text-kve-danger shrink-0" size={14} />
                <p className="text-[11px] text-kve-danger font-bold uppercase tracking-tight">{error}</p>
              </motion.div>
            )}

            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-3 px-4 rounded-xl bg-kve-accent text-kve-bg font-black text-xs tracking-widest uppercase shadow-[0_0_20px_rgba(56,189,248,0.2)] hover:shadow-[0_0_35px_rgba(56,189,248,0.4)] transition-all flex items-center justify-center gap-2.5 disabled:opacity-50 disabled:cursor-not-allowed group"
            >
              {isLoading ? (
                <div className="w-4 h-4 border-2 border-kve-bg border-t-transparent rounded-full animate-spin" />
              ) : (
                <>
                  ENTRAR
                  <ArrowRight size={14} className="group-hover:translate-x-1 transition-transform" />
                </>
              )}
            </button>
          </form>

          <div className="mt-6 pt-5 border-t border-kve-border flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <ShieldCheck className="text-kve-success" size={12} />
              <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">SSL: Encrypted</span>
            </div>
            <a href="#" className="text-[9px] font-bold text-slate-600 hover:text-kve-accent uppercase tracking-widest transition-colors">Esqueceu a chave?</a>
          </div>
        </div>

        <p className="text-center mt-5 text-[9px] font-mono text-slate-600 uppercase tracking-[0.4em]">
          Authorized Personnel Only • IP Logged: 192.168.1.100
        </p>
      </motion.div>
    </div>
  );
};

export default Login;
