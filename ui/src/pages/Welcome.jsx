import { useEffect, useState } from 'react';
import EagleLogo from '../components/EagleLogo';

export default function Welcome({ draft }) {
  const [version, setVersion] = useState(null);
  const [detections, setDetections] = useState([]);

  useEffect(() => {
    fetch('/version')
      .then(r => r.ok ? r.json() : null)
      .then(data => setVersion(data))
      .catch(() => {});

    fetch('/api/detection')
      .then(r => r.ok ? r.json() : [])
      .then(data => setDetections(data))
      .catch(() => {});
  }, []);

  const hasKryonix = detections.some(d => d.is_kryonix);

  return (
    <div className="flex flex-col items-center justify-center h-full max-w-4xl mx-auto w-full px-4 text-center animate-fade-in-up">
      {/* Branding */}
      <div className="mb-12 flex flex-col items-center">
        <div className="mb-8 p-4 bg-white/50 dark:bg-bg-elevated/30 border border-slate-200/50 dark:border-white/5 rounded-3xl shadow-sm backdrop-blur-xl">
          <EagleLogo className="w-16 h-16 text-accent-blue" />
        </div>
        <h2 className="text-3xl md:text-4xl font-bold tracking-tight text-slate-900 dark:text-text-primary mb-3">
          Configuração do Ambiente
        </h2>
        <p className="text-base text-slate-500 dark:text-text-secondary max-w-lg font-medium">
          O Kryonix Installer guiará você pela preparação da infraestrutura. Defina a preferência visual antes de prosseguir.
        </p>
      </div>

      {/* Detections */}
      {hasKryonix && (
        <div className="mb-12 w-full max-w-lg rounded-2xl border border-accent-blue/20 bg-accent-blue/5 p-5 flex gap-4 text-left">
          <div className="mt-1"><EagleLogo className="w-5 h-5 text-accent-blue" /></div>
          <div>
            <div className="text-sm font-bold text-accent-blue mb-1">
              Infraestrutura Existente Detectada
            </div>
            <p className="text-sm text-slate-600 dark:text-text-secondary leading-relaxed">
              O nó <span className="font-mono bg-white dark:bg-bg-elevated px-1.5 py-0.5 rounded text-xs border border-slate-200 dark:border-white/10">{detections[0].hostname}</span> já opera Kryonix. 
              Para manutenções, o <strong>Modo Restore</strong> é recomendado na etapa de discos.
            </p>
          </div>
        </div>
      )}

      {/* Tema agora é fixo: Kryonix Premium Installer Theme */}

      {version && (
        <div className="mt-auto text-[10px] text-slate-400 dark:text-slate-600 font-mono">
          {version.KRYONIX_PRETTY_NAME} | {version.KRYONIX_REV?.substring(0, 8)} | {version.KRYONIX_BUILD_TIME}
        </div>
      )}
    </div>
  );
}
