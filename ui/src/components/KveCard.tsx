import React from 'react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface KveCardProps {
  title?: string;
  subtitle?: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  headerActions?: React.ReactNode;
  noPadding?: boolean;
}

const KveCard: React.FC<KveCardProps> = ({ 
  title, 
  subtitle, 
  icon, 
  children, 
  className, 
  headerActions,
  noPadding = false
}) => {
  return (
    <div className={cn(
      "glass rounded-xl overflow-hidden flex flex-col shadow-2xl relative group",
      className
    )}>
      {/* Subtle highlight on top */}
      <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-kve-accent/30 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
      
      {(title || icon) && (
        <div className="px-6 py-4 flex items-center justify-between border-b border-kve-border bg-slate-900/20">
          <div className="flex items-center gap-3">
            {icon && <div className="text-kve-accent">{icon}</div>}
            <div>
              {title && <h3 className="text-sm font-bold text-white tracking-tight">{title}</h3>}
              {subtitle && <p className="text-[10px] text-slate-500 font-mono uppercase tracking-widest">{subtitle}</p>}
            </div>
          </div>
          {headerActions && <div className="flex items-center gap-2">{headerActions}</div>}
        </div>
      )}
      <div className={cn(
        "flex-1",
        noPadding ? "" : "p-6"
      )}>
        {children}
      </div>
    </div>
  );
};

export default KveCard;
