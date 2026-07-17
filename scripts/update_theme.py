import os
import glob

replacements = {
    'bg-slate-950/60': 'bg-[#1C1C1E] border border-[#38383A]',
    'bg-slate-950/70': 'bg-[#1C1C1E]',
    'bg-slate-950/95': 'bg-[#1C1C1E]',
    'bg-slate-900': 'bg-[#2C2C2E]',
    'border-white/10': 'border-[#38383A]',
    'border-white/5': 'border-[#38383A]',
    'bg-white/[0.03]': 'bg-[#2C2C2E]',
    'bg-white/[0.04]': 'bg-[#2C2C2E]',
    'bg-white/[0.05]': 'bg-[#3A3A3C]',
    'bg-white/5': 'bg-[#3A3A3C]',
    'text-slate-300': 'text-[#F5F5F7]',
    'text-slate-400': 'text-[#86868B]',
    'text-slate-200': 'text-[#F5F5F7]',
    'text-slate-500': 'text-[#86868B]',
    'text-white': 'text-[#F5F5F7]',
    
    'border-cyan-400/20': 'border-[#0A84FF]/30',
    'bg-cyan-400/10': 'bg-[#0A84FF]/10',
    'text-cyan-50': 'text-[#F5F5F7]',
    'text-cyan-100': 'text-[#F5F5F7]',
    'text-cyan-200': 'text-[#0A84FF]',
    'text-cyan-200/80': 'text-[#0A84FF]/80',
    'text-cyan-300': 'text-[#0A84FF]',
    'bg-cyan-950/30': 'bg-[#0A84FF]/10',
    
    'border-emerald-400/20': 'border-[#32D74B]/30',
    'bg-emerald-400/10': 'bg-[#32D74B]/10',
    'text-emerald-100': 'text-[#32D74B]',
    'text-emerald-300': 'text-[#32D74B]',
    
    'border-amber-400/20': 'border-[#FF9F0A]/30',
    'bg-amber-400/10': 'bg-[#FF9F0A]/10',
    'bg-amber-400/5': 'bg-[#FF9F0A]/10',
    'text-amber-50': 'text-[#F5F5F7]',
    'text-amber-100': 'text-[#F5F5F7]',
    'text-amber-200': 'text-[#FF9F0A]',
    'text-amber-300': 'text-[#FF9F0A]',
    'ring-amber-400/50': 'ring-[#FF9F0A]/50',
    'text-amber-100/80': 'text-[#FF9F0A]/80',
    
    'border-rose-400/20': 'border-[#FF453A]/30',
    'border-rose-400/25': 'border-[#FF453A]/30',
    'bg-rose-400/10': 'bg-[#FF453A]/10',
    'text-rose-50': 'text-[#F5F5F7]',
    'text-rose-200': 'text-[#FF453A]',
    'text-rose-200/70': 'text-[#FF453A]/70',
    
    'border-accent-400/60': 'border-[#5E5CE6]/60',
    'bg-accent-500/15': 'bg-[#5E5CE6]/15',
}

files = glob.glob('ui/src/pages/*.jsx') + glob.glob('ui/src/components/*.jsx')

for filepath in files:
    with open(filepath, 'r') as f:
        content = f.read()

    changed = False
    for old, new in replacements.items():
        if old in content:
            content = content.replace(old, new)
            changed = True
        
    if changed:
        with open(filepath, 'w') as f:
            f.write(content)
        print(f"Updated {filepath}")
