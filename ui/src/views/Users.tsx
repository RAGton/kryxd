import React, { useState } from 'react';
import { 
  Search, 
  UserPlus, 
  Shield, 
  Lock, 
  Unlock, 
  Edit3, 
  Trash2,
  Filter,
  Download,
  CheckCircle2,
  XCircle,
  Mail,
  User as UserIcon
} from 'lucide-react';
import { motion } from 'motion/react';
import KveCard from '../components/KveCard';
import Modal from '../components/Modal';
import { User } from '../types';

const mockUsers: User[] = [
  { id: '1', username: 'aguiarrocha', email: 'aguiarrocha36@gmail.com', role: 'admin', status: 'active', quotaUsed: 850, quotaLimit: 1000, lastActivity: 'Agora' },
  { id: '2', username: 'operator-01', email: 'op1@kve.local', role: 'operator', status: 'active', quotaUsed: 120, quotaLimit: 500, lastActivity: '2h atrás' },
  { id: '3', username: 'user-alpha', email: 'alpha@kve.local', role: 'user', status: 'active', quotaUsed: 450, quotaLimit: 500, lastActivity: '1d atrás' },
  { id: '4', username: 'user-beta', email: 'beta@kve.local', role: 'user', status: 'blocked', quotaUsed: 10, quotaLimit: 500, lastActivity: '15d atrás' },
  { id: '5', username: 'guest-tmp', email: 'guest@kve.local', role: 'user', status: 'active', quotaUsed: 5, quotaLimit: 50, lastActivity: '5m atrás' },
];

const UsersView: React.FC = () => {
  const [isNewUserModalOpen, setIsNewUserModalOpen] = useState(false);

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="space-y-6"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
            <input 
              type="text" 
              placeholder="Filtrar usuários..." 
              className="bg-slate-900/50 border border-kve-border rounded-lg pl-10 pr-4 py-2 text-sm text-slate-300 focus:outline-none focus:border-kve-accent/50 w-64 transition-all"
            />
          </div>
          <button className="p-2 rounded-lg border border-kve-border hover:bg-slate-800 transition-colors text-slate-400 hover:text-white flex items-center gap-2 text-sm font-medium">
            <Filter size={16} /> Filtros
          </button>
        </div>
        <div className="flex items-center gap-3">
          <button className="p-2 rounded-lg border border-kve-border hover:bg-slate-800 transition-colors text-slate-400 hover:text-white flex items-center gap-2 text-sm font-medium">
            <Download size={16} /> Exportar
          </button>
          <button 
            onClick={() => setIsNewUserModalOpen(true)}
            className="px-4 py-2 rounded-lg bg-kve-accent text-kve-bg font-bold text-sm shadow-[0_0_15px_rgba(56,189,248,0.2)] hover:shadow-[0_0_20px_rgba(56,189,248,0.4)] transition-all flex items-center gap-2"
          >
            <UserPlus size={18} /> NOVO USUÁRIO
          </button>
        </div>
      </div>

      <KveCard noPadding>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-kve-border bg-slate-900/20">
                <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Usuário</th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Role</th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Status</th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Quota Usage</th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Atividade</th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-kve-border">
              {mockUsers.map((user) => (
                <tr key={user.id} className="hover:bg-slate-800/10 transition-colors group">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center text-xs font-bold text-kve-accent border border-kve-border group-hover:border-kve-accent/30 transition-colors">
                        {user.username.substring(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <p className="text-sm font-bold text-white">{user.username}</p>
                        <p className="text-[10px] text-slate-500 font-mono">{user.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <Shield size={14} className={
                        user.role === 'admin' ? "text-kve-danger" :
                        user.role === 'operator' ? "text-kve-warning" :
                        "text-slate-500"
                      } />
                      <span className="text-xs font-bold text-slate-300 uppercase tracking-tight">{user.role}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      {user.status === 'active' ? (
                        <CheckCircle2 size={14} className="text-kve-success" />
                      ) : (
                        <XCircle size={14} className="text-kve-danger" />
                      )}
                      <span className={`text-[10px] font-bold uppercase tracking-widest ${
                        user.status === 'active' ? "text-kve-success" : "text-kve-danger"
                      }`}>
                        {user.status}
                      </span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="w-48">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[10px] font-mono text-slate-500">{user.quotaUsed}GB / {user.quotaLimit}GB</span>
                        <span className="text-[10px] font-bold text-slate-400">{Math.round((user.quotaUsed / user.quotaLimit) * 100)}%</span>
                      </div>
                      <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
                        <div 
                          className={`h-full rounded-full transition-all duration-500 ${
                            (user.quotaUsed / user.quotaLimit) > 0.8 ? "bg-kve-danger" :
                            (user.quotaUsed / user.quotaLimit) > 0.5 ? "bg-kve-warning" :
                            "bg-kve-accent"
                          }`}
                          style={{ width: `${(user.quotaUsed / user.quotaLimit) * 100}%` }}
                        />
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-xs text-slate-400">{user.lastActivity}</span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button className="p-1.5 rounded hover:bg-slate-700 text-slate-400 hover:text-white transition-colors" title="Editar">
                        <Edit3 size={16} />
                      </button>
                      <button className="p-1.5 rounded hover:bg-slate-700 text-slate-400 hover:text-white transition-colors" title={user.status === 'active' ? "Bloquear" : "Desbloquear"}>
                        {user.status === 'active' ? <Lock size={16} /> : <Unlock size={16} />}
                      </button>
                      <button className="p-1.5 rounded hover:bg-slate-700 text-kve-danger hover:bg-kve-danger/10 transition-colors" title="Excluir">
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </KveCard>

      {/* New User Modal */}
      <Modal 
        isOpen={isNewUserModalOpen} 
        onClose={() => setIsNewUserModalOpen(false)}
        title="Cadastrar Novo Usuário"
        type="info"
        footer={
          <div className="flex justify-end gap-3">
            <button onClick={() => setIsNewUserModalOpen(false)} className="px-4 py-2 text-sm font-bold text-slate-400 hover:text-white transition-colors">CANCELAR</button>
            <button onClick={() => setIsNewUserModalOpen(false)} className="px-4 py-2 rounded-lg bg-kve-accent text-kve-bg font-bold text-sm">CRIAR USUÁRIO</button>
          </div>
        }
      >
        <div className="space-y-4">
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Username</label>
            <div className="relative">
              <UserIcon className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-600" size={16} />
              <input type="text" className="w-full bg-slate-900/50 border border-kve-border rounded-lg pl-10 pr-4 py-2 text-sm text-white focus:outline-none focus:border-kve-accent/50" placeholder="ex: jdoe" />
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">E-mail</label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-600" size={16} />
              <input type="email" className="w-full bg-slate-900/50 border border-kve-border rounded-lg pl-10 pr-4 py-2 text-sm text-white focus:outline-none focus:border-kve-accent/50" placeholder="ex: john@kve.local" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Role</label>
              <select className="w-full bg-slate-900/50 border border-kve-border rounded-lg px-4 py-2 text-sm text-white focus:outline-none focus:border-kve-accent/50 appearance-none">
                <option value="user">User</option>
                <option value="operator">Operator</option>
                <option value="admin">Admin</option>
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Quota (GB)</label>
              <input type="number" className="w-full bg-slate-900/50 border border-kve-border rounded-lg px-4 py-2 text-sm text-white focus:outline-none focus:border-kve-accent/50" placeholder="500" />
            </div>
          </div>
        </div>
      </Modal>
    </motion.div>
  );
};

export default UsersView;
