import React from 'react';
import { FEATURE_CATALOG } from '../data/featureCatalog.js';

export default function UserFeatures({ wizard, onChange }) {
  const userFeatures = FEATURE_CATALOG.filter(f => f.level === 'user');
  const domains = [...new Set(userFeatures.map(f => f.domain))];

  const handleToggle = (featureId) => {
    const selected = new Set(wizard.selectedFeatures || []);
    if (selected.has(featureId)) {
      selected.delete(featureId);
    } else {
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
                  return (
                    <label 
                      key={feature.id}
                      className={`flex items-start space-x-4 p-4 rounded-xl border cursor-pointer transition-all ${
                        isSelected ? 'border-accent-blue bg-accent-blue/10 shadow-md' : 'border-white/10 bg-white/5 hover:border-white/20 hover:bg-white/10'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => handleToggle(feature.id)}
                        className="form-checkbox mt-1 h-5 w-5 text-accent-blue bg-black/40 border-white/20 rounded focus:ring-accent-blue appearance-none checked:appearance-auto cursor-pointer"
                      />
                      <div className="flex-1">
                        <div className="flex justify-between items-start">
                          <span className="font-bold text-white block mb-1">{feature.name}</span>
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
