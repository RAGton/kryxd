import React from 'react';
import { FEATURE_CATALOG } from '../data/featureCatalog.js';

export default function UserFeatures({ wizard, onChange }) {
  const userFeatures = FEATURE_CATALOG.filter(f => f.level === 'user');
  const domains = [...new Set(userFeatures.map(f => f.domain))];

  const handleToggle = (featureId) => {
    const feature = FEATURE_CATALOG.find(f => f.id === featureId);
    if (feature?.status === 'stub' || feature?.status === 'legacy') return;

    const selected = new Set(wizard.selectedFeatures || []);
    if (selected.has(featureId)) {
      selected.delete(featureId);
    } else {
      if (feature?.status === 'partial') {
        const msg = `A feature '${feature.name}' é classificada como parcial ou experimental. Requer confirmação explícita para ser ativada.\n\nDeseja ativá-la mesmo assim?`;
        if (!window.confirm(msg)) return;
      }
      selected.add(featureId);
    }
    onChange({ selectedFeatures: Array.from(selected) });
  };

  return (
    <div className="wizard-content">

      <div className="space-y-8">
        {domains.map(domain => {
          const featuresInDomain = userFeatures.filter(f => f.domain === domain);
          if (featuresInDomain.length === 0) return null;

          return (
            <div key={domain} className="mb-6">
              <h3 className="text-xs font-bold text-slate-400 mb-3 uppercase tracking-widest">{featuresInDomain[0].category}</h3>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                {featuresInDomain.map(feature => {
                  const isSelected = wizard.selectedFeatures?.includes(feature.id);
                  const isBlocked = feature.status === 'stub' || feature.status === 'legacy';
                  return (
                    <label 
                      key={feature.id}
                      className={`flex items-start space-x-4 p-4 rounded-xl border transition-all ${
                        isBlocked ? 'opacity-50 cursor-not-allowed border-white/5 bg-white/5' :
                        isSelected ? 'border-accent-blue bg-accent-blue/10 shadow-md cursor-pointer' : 
                        'border-white/10 bg-white/5 hover:border-white/20 hover:bg-white/10 cursor-pointer'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        disabled={isBlocked}
                        onChange={() => handleToggle(feature.id)}
                        className={`form-checkbox mt-1 h-5 w-5 text-accent-blue bg-black/40 border-white/20 rounded focus:ring-accent-blue appearance-none checked:appearance-auto ${isBlocked ? 'cursor-not-allowed' : 'cursor-pointer'}`}
                      />
                      <div className="flex-1">
                        <div className="flex justify-between items-start">
                          <span className="font-bold text-white block mb-1">{feature.name}</span>
                          <div className="flex gap-2">
                            {feature.status === 'partial' && (
                              <span className="px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-widest rounded border border-amber-500/30 bg-amber-500/10 text-amber-400">
                                Partial
                              </span>
                            )}
                            {isBlocked && (
                              <span className="px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-widest rounded border border-red-500/30 bg-red-500/10 text-red-400">
                                {feature.status}
                              </span>
                            )}
                          </div>
                        </div>
                        <p className="text-xs text-gray-400 mb-2">{feature.description}</p>
                        
                        {feature.badges && feature.badges.length > 0 && (
                          <div className="flex flex-wrap gap-1.5 mt-2">
                            {feature.badges.map(badge => (
                              <span key={badge} className="px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-widest rounded border border-white/10 bg-black/30 text-slate-300">
                                {badge}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
