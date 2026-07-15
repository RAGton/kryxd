import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Layout from './components/Layout.jsx';
import FooterFixed from './components/FooterFixed.jsx';
import Welcome from './pages/Welcome.jsx';
import Eula from './pages/Eula.jsx';
import Timezone from './pages/Timezone.jsx';
import Network from './pages/Network.jsx';
import Source from './pages/Source.jsx';
import RemoteAccess from './pages/RemoteAccess.jsx';
import HostSelection from './pages/HostSelection.jsx';
import MachineProfile from './pages/MachineProfile.jsx';
import SystemFeatures from './pages/SystemFeatures.jsx';
import UserFeatures from './pages/UserFeatures.jsx';
import Disks from './pages/Disks.jsx';
import Users from './pages/Users.jsx';
import Summary from './pages/Summary.jsx';
import Install from './pages/Install.jsx';
import { validateStep } from './utils/installPlan.js';
import { installerApi, getInstallerApiErrorMessage } from './utils/installerApi.js';
import {
  createInstallPlanDraft,
  extractUiTransientState,
  INITIAL_INSTALL_PLAN_DRAFT,
  INITIAL_UI_TRANSIENT_STATE,
  mergeWizardState,
  readStoredWizardState,
  splitWizardPatch,
  writeStoredWizardState,
} from './state/wizardState.js';

// Converte máscara IPv4 dotted-decimal em prefix length (/N).
// Default 24 quando a máscara é inválida — alinhado com o catálogo de
// opções da página Network ("/24" como primeiro valor).
function netmaskToPrefix(netmask) {
  const normalized = (netmask || '').trim();
  if (!normalized) return 24;
  const parts = normalized.split('.');
  if (parts.length !== 4) return 24;
  let bits = 0;
  let seenZero = false;
  for (const part of parts) {
    const octet = Number(part);
    if (!Number.isInteger(octet) || octet < 0 || octet > 255) return 24;
    for (let bit = 7; bit >= 0; bit -= 1) {
      const current = (octet >> bit) & 1;
      if (current === 1) {
        if (seenZero) return 24;
        bits += 1;
      } else {
        seenZero = true;
      }
    }
  }
  return bits;
}

const STEPS = [
  { id: 'welcome' },
  { id: 'eula' },
  { id: 'source' },
  { id: 'timezone' },
  { id: 'network' },
  { id: 'hostSelection' },
  { id: 'profile' },
  { id: 'systemFeatures' },
  { id: 'userFeatures' },
  { id: 'disks' },
  { id: 'users' },
  { id: 'summary' },
  { id: 'install' },
];

const PHASES = [
  { id: 'prep', steps: ['welcome', 'eula', 'source'] },
  { id: 'localization', steps: ['timezone'] },
  { id: 'network', steps: ['network', 'hostSelection'] },
  { id: 'system', steps: ['profile', 'systemFeatures', 'userFeatures'] },
  { id: 'storage', steps: ['disks'] },
  { id: 'users', steps: ['users'] },
  { id: 'summary', steps: ['summary', 'install'] }
];

function getInitialWizardState() {
  const stored = readStoredWizardState();

  return {
    stepIndex: Math.max(0, Math.min(stored?.stepIndex ?? 0, STEPS.length - 1)),
    draft: stored?.draft ?? createInstallPlanDraft(INITIAL_INSTALL_PLAN_DRAFT),
    uiState: stored?.uiState ?? extractUiTransientState(INITIAL_UI_TRANSIENT_STATE),
  };
}

export default function WizardInstaller() {
  const { t, i18n } = useTranslation();
  const initialState = useMemo(() => getInitialWizardState(), []);
  const [stepIndex, setStepIndex] = useState(initialState.stepIndex);
  const [wizardState, setWizardState] = useState({
    draft: initialState.draft,
    uiState: initialState.uiState,
  });

  const draft = wizardState.draft;
  const uiState = wizardState.uiState;
  const wizard = useMemo(() => mergeWizardState(draft, uiState), [draft, uiState]);
  const step = STEPS[stepIndex];
  const eulaLocked = step.id === 'eula';
  const progressValue = STEPS.length > 1
    ? Math.round((stepIndex / (STEPS.length - 1)) * 100)
    : 100;

  const currentValidation = useMemo(
    () => validateStep(step.id, draft, uiState),
    [draft, step.id, uiState],
  );

  const footerIssues = currentValidation.blockingIssues.length > 0
    ? currentValidation.blockingIssues
    : currentValidation.warnings;
  const canGoNext = currentValidation.blockingIssues.length === 0;

  useEffect(() => {
    writeStoredWizardState({ stepIndex, draft, uiState });
    if (draft.uiLanguage && i18n.language !== draft.uiLanguage) {
      i18n.changeLanguage(draft.uiLanguage);
    }
  }, [draft, stepIndex, uiState, i18n]);

  const updateWizard = useCallback((patchOrUpdater) => {
    setWizardState((previous) => {
      const previousView = mergeWizardState(previous.draft, previous.uiState);
      const nextPatch = typeof patchOrUpdater === 'function'
        ? patchOrUpdater(previousView)
        : patchOrUpdater;

      const { draftPatch, uiPatch } = splitWizardPatch(nextPatch);

      return {
        draft: Object.keys(draftPatch).length > 0
          ? createInstallPlanDraft({ ...previous.draft, ...draftPatch })
          : previous.draft,
        uiState: Object.keys(uiPatch).length > 0
          ? extractUiTransientState({ ...previous.uiState, ...uiPatch })
          : previous.uiState,
      };
    });
  }, []);

  const goNext = useCallback(
    () => setStepIndex((previous) => Math.min(STEPS.length - 1, previous + 1)),
    [],
  );

  const advanceWizardSafely = useCallback(() => {
    goNext();
    return Promise.resolve();
  }, [goNext]);

  const goBack = useCallback(
    () => setStepIndex((previous) => Math.max(0, previous - 1)),
    [],
  );

  // Força transição automática para a tela de instalação APENAS quando
  // a instalação real está em andamento (installRunning = true).
  // O dry-run não deve forçar nem travar a navegação permanentemente.
  useEffect(() => {
    if (uiState.installRunning) {
      setStepIndex(STEPS.length - 1);
    }
  }, [uiState.installRunning]);

  // Navegação por teclado (Gate 6 — keyboard-only). Atalhos de "Próximo":
  // Enter (fora de campos), Alt+N, Alt+→, Ctrl+Enter. "Voltar": Alt+B, Alt+←, Alt+Backspace.
  // Esc é no-op: nunca sai do kiosk nem fecha o Chromium.
  useEffect(() => {
    const onKeyDown = (event) => {
      if (uiState.installRunning) {
        event.preventDefault();
        return;
      }
      // Rede sendo aplicada: bloqueia TODA navegação por teclado. Sem este gate
      // o handler chama advanceWizardSafely() direto (fora do lock do footer),
      // permitindo Enter/Alt+N repetidos dispararem handleNetworkNext concorrentes
      // e corromperem o wizardState (netApplyBusy era write-only).
      if (uiState.netApplyBusy) {
        event.preventDefault();
        return;
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        return;
      }
      // F1 (Ajuda) / F2 (Logs): reservados — impede a ajuda nativa do Chromium.
      // (overlays de ajuda/logs entram numa próxima iteração da Fase 0.2)
      if (event.key === 'F1' || event.key === 'F2') {
        event.preventDefault();
        return;
      }

      const tag = event.target?.tagName;
      const isTyping =
        tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || event.target?.isContentEditable;

      const k = event.key;
      const explicitNext =
        (event.altKey && (k === 'n' || k === 'N' || k === 'ArrowRight')) ||
        (event.ctrlKey && k === 'Enter');
      const bareEnterNext = k === 'Enter' && !isTyping && !event.altKey && !event.ctrlKey;
      const wantBack =
        event.altKey && (k === 'b' || k === 'B' || k === 'ArrowLeft' || k === 'Backspace');

      // EULA: Enter "pelado" NÃO avança (evita aceite acidental); só atalho explícito
      // e somente após o aceite (canGoNext). O Space no checkbox continua nativo.
      if (step.id === 'eula') {
        if (k === 'Enter' && !isTyping) event.preventDefault();
        if (explicitNext && canGoNext) {
          event.preventDefault();
          void advanceWizardSafely();
        }
        return;
      }

      if (wantBack) {
        event.preventDefault();
        goBack();
        return;
      }
      if ((explicitNext || bareEnterNext) && canGoNext) {
        event.preventDefault();
        void advanceWizardSafely();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [advanceWizardSafely, canGoNext, step.id, goBack, uiState.installRunning, uiState.netApplyBusy]);

  // Foco inicial previsível: ao trocar de etapa, foca o primeiro elemento
  // interativo da página (EULA → checkbox, Disks → primeiro card, Users → 1º campo).
  const pageRef = useRef(null);
  useEffect(() => {
    const root = pageRef.current;
    if (!root) return;
    const sel =
      'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [role="button"]:not([aria-disabled="true"]), [tabindex]:not([tabindex="-1"])';
    const el = root.querySelector(sel);
    if (el && typeof el.focus === 'function') {
      // requestAnimationFrame: garante que a etapa já montou antes de focar
      requestAnimationFrame(() => el.focus());
    }
  }, [stepIndex]);

  const phasesWithState = useMemo(() => {
    return PHASES.map((phase, pIndex) => {
      // Find the index of the first step in this phase
      const firstStepIndex = STEPS.findIndex(s => s.id === phase.steps[0]);
      // Find the index of the last step in this phase
      const lastStepIndex = STEPS.findIndex(s => s.id === phase.steps[phase.steps.length - 1]);
      
      let status = 'upcoming';
      if (stepIndex > lastStepIndex) status = 'done';
      else if (stepIndex >= firstStepIndex && stepIndex <= lastStepIndex) status = 'current';

      return {
        ...phase,
        title: t(`nav.${phase.id}`),
        status,
        targetStepIndex: firstStepIndex,
      };
    });
  }, [stepIndex]);

  const pageProps = {
    draft,
    uiState,
    wizard,
    onChange: updateWizard,
    validation: currentValidation,
  };

  const currentPage = (() => {
    switch (step.id) {
      case 'welcome':
        return <Welcome {...pageProps} />;
      case 'eula':
        return <Eula {...pageProps} />;
      case 'source':
        return <Source {...pageProps} />;
      case 'timezone':
        return <Timezone {...pageProps} />;
      case 'network':
        return <Network {...pageProps} />;
      case 'remoteAccess':
        return <RemoteAccess {...pageProps} />;
      case 'hostSelection':
        return <HostSelection {...pageProps} />;
      case 'profile':
        return <MachineProfile {...pageProps} />;
      case 'systemFeatures':
        return <SystemFeatures {...pageProps} />;
      case 'userFeatures':
        return <UserFeatures {...pageProps} />;
      case 'disks':
        return <Disks {...pageProps} />;
      case 'users':
        return <Users {...pageProps} />;
      case 'summary':
        return <Summary {...pageProps} />;
      case 'install':
        return <Install {...pageProps} />;
      default:
        return null;
    }
  })();

  // O tema dark agora é fixo pelo index.html e Tailwind config.

  return (
    <Layout
      title={t(`steps.${step.id}.title`)}
      subtitle={t(`steps.${step.id}.subtitle`)}
      stepLabel={t('nav.step', { current: stepIndex + 1, total: STEPS.length })}
      phases={phasesWithState}
      currentStepIndex={stepIndex}
      navigationHint={uiState.installRunning ? t('nav.blockedNavigation') : uiState.netApplyBusy ? t('nav.applyingNetwork') : eulaLocked ? t('nav.eulaLocked') : 'Alt + ← / Alt + →'}
      onStepJump={(index) => {
        if (uiState.installRunning) return;
        if (uiState.netApplyBusy) return;
        if (step.id === 'eula') return;
        if (index <= stepIndex) {
          setStepIndex(index);
          return;
        }
        if (index === stepIndex + 1 && canGoNext) {
          void advanceWizardSafely();
        }
      }}
      footer={(
        <FooterFixed
          progressLabel={`${t(`steps.${step.id}.title`)} • ${progressValue}%`}
          progressValue={progressValue}
          issues={footerIssues}
          canBack={stepIndex > 0 && !uiState.installRunning && !uiState.netApplyBusy}
          canNext={step.id === 'install' ? false : canGoNext && !uiState.installRunning && !uiState.netApplyBusy}
          onBack={() => setStepIndex((previous) => Math.max(0, previous - 1))}
          onNext={advanceWizardSafely}
          hintText={
            uiState.installRunning
              ? t('nav.installRunningHint')
              : uiState.netApplyBusy
                ? t('nav.networkApplyingHint')
              : step.id === 'eula'
                ? t('nav.eulaHint')
                : t('nav.readyHint')
          }
          nextLabel={step.id === 'summary' ? t('nav.toInstall') : step.id === 'install' ? t('nav.install') : t('nav.next')}
        />
      )}
    >
      <div className="wizard-page animate-fade-in w-full h-full flex flex-col min-h-0" key={step.id} ref={pageRef}>
        {currentPage}
      </div>
    </Layout>
  );
}
