import React, { useState } from 'react';
import { motion } from 'motion/react';
import { UploadCloud, Zap, History, AlertTriangle, CheckCircle2, Clock, Terminal, ArrowRight, Play, RotateCcw } from 'lucide-react';
import KveCard from '../components/KveCard';
import Modal from '../components/Modal';

const PublishView: React.FC = () => {
  const [isPromoteModalOpen, setIsPromoteModalOpen] = useState(false);
  const [isRollbackModalOpen, setIsRollbackModalOpen] = useState(false);

  const generations = [
    { id: 142, hash: '7a2b9c1d4e8f2a9c3b1d4e8f2a9c3b1d4e8f2a9c', date: '2026-03-18 10:05', status: 'active', user: 'aguiarrocha' },
    { id: 141, hash: '1d4e8f2a9c3b1d4e8f2a9c3b1d4e8f2a9c3b1d4e', date: '2026-03-17 14:20', status: 'previous', user: 'operator-01' },
    { id: 140, hash: '3b1d4e8f2a9c3b1d4e8f2a9c3b1d4e8f2a9c3b1d', date: '2026-03-16 09:10', status: 'archived', user: 'aguiarrocha' },
    { id: 139, hash: 'a9c3b1d4e8f2a9c3b1d4e8f2a9c3b1d4e8f2a9c3', date: '2026-03-15 16:45', status: 'archived', user: 'system' },
  ];

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="space-y-6"
    >
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white tracking-tight">Publish & Boot Management</h2>
          <p className="text-slate-500 text-sm">Controle de gerações NixOS e distribuição de imagens via TFTP/NFS</p>
        </div>
        <div className="flex gap-3">
          <button className="px-4 py-2 rounded-lg bg-slate-900/50 border border-kve-border text-slate-400 hover:text-white transition-colors flex items-center gap-2 text-sm font-bold">
            <History size={18} /> HISTÓRICO COMPLETO
          </button>
          <button className="px-4 py-2 rounded-lg bg-kve-accent text-kve-bg font-bold text-sm shadow-[0_0_20px_rgba(56,189,248,0.2)] hover:shadow-[0_0_25px_rgba(56,189,248,0.4)] transition-all flex items-center gap-2">
            <UploadCloud size={18} /> NOVO BUILD (STAGED)
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <KveCard 
          title="Geração Ativa" 
          subtitle="Ambiente de Produção" 
          icon={<Zap size={16} />}
          className="lg:col-span-2"
        >
          <div className="flex items-center gap-8 p-6 rounded-2xl bg-kve-accent/5 border border-kve-accent/20 relative overflow-hidden">
            <div className="absolute top-0 right-0 p-4 opacity-5">
              <Zap size={120} />
            </div>
            <div className="flex flex-col items-center justify-center w-32 h-32 rounded-full border-4 border-kve-accent/30 bg-kve-accent/10 shadow-[0_0_30px_rgba(56,189,248,0.15)]">
              <span className="text-4xl font-black text-white">#142</span>
              <span className="text-[10px] font-bold text-kve-accent uppercase tracking-widest">ACTIVE</span>
            </div>
            <div className="flex-1 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Hash de Build</p>
                  <p className="text-xs font-mono text-slate-300 truncate">7a2b9c1d4e8f2a9c3b1d4e8f2a9c3b1d4e8f2a9c</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Publicado em</p>
                  <p className="text-xs text-slate-300">18 de Março de 2026, 10:05:42</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Autor do Publish</p>
                  <p className="text-xs text-slate-300">Aguiar Rocha (aguiarrocha)</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Status de Boot</p>
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-kve-success animate-pulse" />
                    <span className="text-xs text-kve-success font-bold">DISTRIBUINDO VIA TFTP</span>
                  </div>
                </div>
              </div>
              <div className="flex gap-3 pt-2">
                <button 
                  onClick={() => setIsRollbackModalOpen(true)}
                  className="px-4 py-2 rounded-lg border border-kve-danger/30 text-kve-danger font-bold text-[10px] hover:bg-kve-danger/10 transition-all flex items-center gap-2 uppercase tracking-widest"
                >
                  <RotateCcw size={14} /> Rollback Imediato
                </button>
                <button className="px-4 py-2 rounded-lg border border-slate-700 text-slate-400 font-bold text-[10px] hover:bg-slate-800 transition-all flex items-center gap-2 uppercase tracking-widest">
                  <Terminal size={14} /> Ver Logs de Build
                </button>
              </div>
            </div>
          </div>
        </KveCard>

        <KveCard 
          title="Staged Build" 
          subtitle="Aguardando Promoção" 
          icon={<Clock size={16} />}
        >
          <div className="flex flex-col h-full justify-between">
            <div className="p-4 rounded-xl bg-slate-900/40 border border-kve-border border-dashed">
              <div className="flex items-center justify-between mb-4">
                <span className="text-2xl font-bold text-slate-400">#143</span>
                <span className="px-2 py-0.5 rounded bg-kve-warning/10 text-kve-warning text-[10px] font-bold uppercase tracking-widest">STAGED</span>
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between text-[10px]">
                  <span className="text-slate-500 uppercase font-bold">Kernel</span>
                  <span className="text-slate-300 font-mono">6.6.21-kve-lts</span>
                </div>
                <div className="flex items-center justify-between text-[10px]">
                  <span className="text-slate-500 uppercase font-bold">Alterações</span>
                  <span className="text-kve-success font-bold">+12 PKGS / -2 PKGS</span>
                </div>
                <div className="flex items-center justify-between text-[10px]">
                  <span className="text-slate-500 uppercase font-bold">Tamanho</span>
                  <span className="text-slate-300 font-mono">1.42 GB</span>
                </div>
              </div>
            </div>
            <button 
              onClick={() => setIsPromoteModalOpen(true)}
              className="w-full mt-6 py-3 rounded-lg bg-kve-accent text-kve-bg font-bold text-xs shadow-[0_0_20px_rgba(56,189,248,0.2)] hover:shadow-[0_0_25px_rgba(56,189,248,0.4)] transition-all flex items-center justify-center gap-2 uppercase tracking-widest"
            >
              <ArrowRight size={16} /> Promover para Produção
            </button>
          </div>
        </KveCard>
      </div>

      <KveCard title="Histórico de Gerações" icon={<History size={16} />} noPadding>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-kve-border bg-slate-900/20">
                <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Geração</th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Hash (SHA-256)</th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Data / Hora</th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Autor</th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Status</th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-kve-border">
              {generations.map((gen) => (
                <tr key={gen.id} className="hover:bg-slate-800/20 transition-colors group">
                  <td className="px-6 py-4">
                    <span className={`text-sm font-bold ${gen.status === 'active' ? 'text-kve-accent' : 'text-slate-300'}`}>#{gen.id}</span>
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-[10px] font-mono text-slate-500 group-hover:text-slate-300 transition-colors">{gen.hash.substring(0, 16)}...</span>
                  </td>
                  <td className="px-6 py-4 text-[10px] font-mono text-slate-400">
                    {gen.date}
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{gen.user}</span>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-widest ${
                      gen.status === 'active' ? 'bg-kve-success/10 text-kve-success' : 
                      gen.status === 'previous' ? 'bg-kve-warning/10 text-kve-warning' : 
                      'bg-slate-800 text-slate-500'
                    }`}>
                      {gen.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button className="p-1.5 rounded bg-slate-800 text-slate-400 hover:text-white transition-colors" title="Ver Detalhes">
                        <History size={14} />
                      </button>
                      {gen.status !== 'active' && (
                        <button className="p-1.5 rounded bg-kve-accent/10 text-kve-accent hover:bg-kve-accent hover:text-kve-bg transition-all" title="Rollback para esta versão">
                          <RotateCcw size={14} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </KveCard>

      {/* Modals */}
      <Modal 
        isOpen={isPromoteModalOpen} 
        onClose={() => setIsPromoteModalOpen(false)}
        title="Promover Geração #143"
        type="info"
        footer={
          <div className="flex justify-end gap-3">
            <button onClick={() => setIsPromoteModalOpen(false)} className="px-4 py-2 text-sm font-bold text-slate-400 hover:text-white transition-colors">CANCELAR</button>
            <button onClick={() => setIsPromoteModalOpen(false)} className="px-4 py-2 rounded-lg bg-kve-accent text-kve-bg font-bold text-sm">CONFIRMAR PUBLISH</button>
          </div>
        }
      >
        <div className="space-y-4">
          <p className="text-sm text-slate-300">A geração <strong className="text-white">#143</strong> será definida como a imagem de boot padrão para todos os nodes da rede.</p>
          <div className="p-3 rounded-lg bg-slate-900/50 border border-kve-border">
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">Verificações de Segurança:</p>
            <div className="space-y-1.5">
              <div className="flex items-center gap-2 text-xs text-kve-success">
                <CheckCircle2 size={12} /> Assinatura GPG Válida
              </div>
              <div className="flex items-center gap-2 text-xs text-kve-success">
                <CheckCircle2 size={12} /> Integridade do Sistema de Arquivos (NFS)
              </div>
              <div className="flex items-center gap-2 text-xs text-kve-success">
                <CheckCircle2 size={12} /> Configuração de Boot TFTP Gerada
              </div>
            </div>
          </div>
        </div>
      </Modal>

      <Modal 
        isOpen={isRollbackModalOpen} 
        onClose={() => setIsRollbackModalOpen(false)}
        title="ALERTA DE ROLLBACK"
        type="danger"
        footer={
          <div className="flex justify-end gap-3">
            <button onClick={() => setIsRollbackModalOpen(false)} className="px-4 py-2 text-sm font-bold text-slate-400 hover:text-white transition-colors">CANCELAR</button>
            <button onClick={() => setIsRollbackModalOpen(false)} className="px-4 py-2 rounded-lg bg-kve-danger text-white font-bold text-sm">EXECUTAR ROLLBACK</button>
          </div>
        }
      >
        <div className="space-y-4">
          <p className="text-sm text-slate-300">Você está prestes a reverter o sistema para a geração <strong className="text-white">#141</strong>.</p>
          <p className="text-xs text-kve-danger font-bold uppercase tracking-widest">Esta ação é imediata e afetará todos os novos boots na rede.</p>
          <textarea 
            className="w-full bg-slate-900/50 border border-kve-danger/20 rounded-lg p-3 text-sm text-slate-300 focus:outline-none focus:border-kve-danger/50 h-24 placeholder:text-slate-600 resize-none"
            placeholder="Descreva o motivo do rollback para auditoria..."
          />
        </div>
      </Modal>
    </motion.div>
  );
};

export default PublishView;
