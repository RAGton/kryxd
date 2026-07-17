import React, { useState, useEffect } from 'react';
import { Database, FileText, Download, Trash2, Upload, Search, Filter } from 'lucide-react';

interface StorageContentViewProps {
  storageId: string;
}

const StorageContentView: React.FC<StorageContentViewProps> = ({ storageId }) => {
  const [content, setContent] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/storage/${storageId}/content`)
      .then(res => res.json())
      .then(data => {
        setContent(data);
        setLoading(false);
      });
  }, [storageId]);

  if (loading) return <div className="p-8 text-center text-slate-500 animate-pulse text-xs font-mono uppercase">Loading Storage Content...</div>;

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'vztmpl': return 'text-kve-indigo bg-kve-indigo/10 border-kve-indigo/20';
      case 'iso': return 'text-kve-accent bg-kve-accent/10 border-kve-accent/20';
      case 'backup': return 'text-kve-success bg-kve-success/10 border-kve-success/20';
      default: return 'text-slate-400 bg-slate-400/10 border-slate-400/20';
    }
  };

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-4 bg-slate-900/40 p-3 border border-kve-border rounded-xl">
        <div className="flex items-center gap-2">
            <button className="flex items-center gap-2 px-3 py-1.5 bg-kve-accent text-kve-bg text-[10px] font-bold rounded uppercase tracking-widest hover:bg-kve-accent/90 transition-colors">
              <Upload size={14} /> Upload
            </button>
            <button className="flex items-center gap-2 px-3 py-1.5 bg-slate-800 text-white text-[10px] font-bold rounded border border-slate-700 uppercase tracking-widest hover:bg-slate-700 transition-colors">
              <Download size={14} /> Download from URL
            </button>
        </div>
        <div className="flex-1 max-w-xs relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input 
            type="text" 
            placeholder="Search content..." 
            className="w-full bg-slate-950/50 border border-kve-border rounded-lg py-1.5 pl-9 pr-4 text-xs focus:outline-none focus:border-kve-accent/50 transition-colors"
          />
        </div>
        <button className="p-2 bg-slate-800 text-slate-400 rounded-lg hover:text-white transition-colors">
          <Filter size={16} />
        </button>
      </div>

      {/* Content Table */}
      <div className="bg-slate-900/20 border border-kve-border rounded-xl overflow-hidden">
        <table className="w-full text-xs text-left border-collapse">
          <thead className="text-[10px] font-bold uppercase tracking-widest text-slate-500 bg-slate-900/50">
            <tr>
              <th className="px-4 py-3 border-b border-kve-border">Name</th>
              <th className="px-4 py-3 border-b border-kve-border">Format</th>
              <th className="px-4 py-3 border-b border-kve-border">Size</th>
              <th className="px-4 py-3 border-b border-kve-border">Date</th>
              <th className="px-4 py-3 border-b border-kve-border text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-kve-border/30">
            {content.map((item, i) => (
              <tr key={i} className="hover:bg-slate-800/30 transition-colors">
                <td className="px-4 py-3 font-medium text-slate-300">
                  <div className="flex items-center gap-3">
                    <FileText size={14} className="text-slate-500" />
                    {item.name}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase border ${getTypeColor(item.type)}`}>
                    {item.type}
                  </span>
                </td>
                <td className="px-4 py-3 text-slate-400 font-mono italic">{item.size}</td>
                <td className="px-4 py-3 text-slate-500">{item.date}</td>
                <td className="px-4 py-3 text-right">
                  <div className="flex items-center justify-end gap-2">
                    <button className="p-1.5 rounded hover:bg-slate-700 text-slate-500 hover:text-white transition-colors" title="Download">
                      <Download size={14} />
                    </button>
                    <button className="p-1.5 rounded hover:bg-kve-danger/10 text-slate-500 hover:text-kve-danger transition-colors" title="Delete">
                      <Trash2 size={14} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default StorageContentView;
