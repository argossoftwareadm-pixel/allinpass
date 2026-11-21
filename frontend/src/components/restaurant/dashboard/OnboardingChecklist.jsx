import React, { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, Circle, Maximize2, Minimize2, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/supabaseClient';
import BusinessTemplateDialog from './BusinessTemplateDialog';

export default function OnboardingChecklist({ projectId, projectName, canManage, onNavigate }) {
  const [status, setStatus] = useState(null);
  const minimizedKey = `allinpass_onboarding_min_${projectId}`;
  const [collapsed, setCollapsedState] = useState(() => {
    try { return localStorage.getItem(minimizedKey) === '1'; } catch (_) { return false; }
  });
  const setCollapsed = (next) => {
    setCollapsedState(next);
    try { localStorage.setItem(minimizedKey, next ? '1' : '0'); } catch (_) {}
  };
  const [templateOpen, setTemplateOpen] = useState(false);

  const load = useCallback(async () => {
    if (!projectId) return;
    const { data, error } = await supabase.rpc('fn_project_onboarding_status', { p_project_id: projectId });
    if (!error) setStatus(data);
  }, [projectId]);

  useEffect(() => {
    load();
    const onFocus = () => load();
    window.addEventListener('focus', onFocus);
    window.addEventListener('allinpass:onboarding-refresh', onFocus);
    return () => {
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('allinpass:onboarding-refresh', onFocus);
    };
  }, [load]);

  if (!status || status.dismissed_at) return null;

  const manual = new Set(Array.isArray(status.manual_done) ? status.manual_done : []);
  const rawSteps = [
    {
      id: 'template',
      label: 'Escolher um modelo para o seu tipo de negócio',
      helper: 'Cria recompensas e um lembrete de retorno prontos.',
      done: Boolean(status.template_applied_at) || (status.rewards > 0 && status.automations > 0),
      action: canManage ? { label: 'Ver modelos', run: () => setTemplateOpen(true) } : null,
    },
    {
      id: 'card',
      label: 'Criar o cartão fidelidade',
      helper: 'Logo, cores e imagem do seu negócio na carteira do cliente.',
      done: status.passes > 0,
      action: { label: 'Ir para Cartões', run: () => onNavigate('wallet') },
    },
    {
      id: 'reward',
      label: 'Cadastrar uma recompensa',
      helper: 'É o motivo para o cliente voltar.',
      done: status.rewards > 0,
      action: { label: 'Ir para Recompensas', run: () => onNavigate('rewards', 'rewards') },
    },
    {
      id: 'materials',
      label: 'Baixar o material de balcão com o QR code',
      helper: 'Display, adesivo e story prontos com a sua logo.',
      done: Boolean(status.materials_at),
      action: { label: 'Abrir Materiais', run: () => onNavigate('materiais') },
    },
    {
      id: 'first_customer',
      label: 'Primeiro cliente com o cartão instalado',
      helper: 'Peça para alguém da equipe testar primeiro.',
      done: status.customers > 0,
      action: { label: 'Abrir Materiais', run: () => onNavigate('materiais') },
    },
    {
      id: 'first_visit',
      label: 'Registrar o primeiro ponto no scanner',
      helper: 'Leia o QR do cartão do cliente na aba Scanner.',
      done: status.visits > 0,
      action: { label: 'Ir para Scanner', run: () => onNavigate('scanner') },
    },
    {
      id: 'ten_customers',
      label: '10 clientes no programa',
      helper: `${Math.min(status.customers, 10)} de 10 até agora.`,
      done: status.customers >= 10,
      action: null,
    },
  ];

  const steps = rawSteps.map((step) => ({ ...step, autoDone: step.done, done: step.done || manual.has(step.id) }));
  const doneCount = steps.filter((s) => s.done).length;
  const progress = Math.round((doneCount / steps.length) * 100);
  if (doneCount === steps.length) return null;

  const toggleManual = async (step) => {
    if (!canManage || step.autoDone) return;
    const checking = !manual.has(step.id);
    const nextManual = checking ? [...manual, step.id] : [...manual].filter((id) => id !== step.id);
    setStatus((prev) => ({ ...prev, manual_done: nextManual }));
    const { error } = await supabase.rpc('fn_project_onboarding_mark', {
      p_project_id: projectId,
      p_step: checking ? 'check' : 'uncheck',
      p_value: step.id,
    });
    if (error) load();
  };

  if (collapsed) {
    return (
      <button
        type="button"
        onClick={() => setCollapsed(false)}
        title="Mostrar primeiros passos"
        className="mb-6 flex w-full flex-wrap items-center gap-3 rounded-2xl border border-purple-200 bg-purple-50 px-4 py-2 dark:border-purple-500/30 dark:bg-purple-950/50 dark:hover:border-purple-400/60 text-left shadow-sm transition hover:border-purple-300"
      >
        <span className="flex items-center gap-2 text-sm font-semibold text-purple-900 dark:text-purple-100"><Sparkles className="h-4 w-4" /> Primeiros passos</span>
        <span className="flex items-center gap-1">
          {steps.map((step) => (step.done
            ? <CheckCircle2 key={step.id} className="h-4 w-4 text-emerald-500" />
            : <Circle key={step.id} className="h-4 w-4 text-purple-200 dark:text-purple-700 dark:text-purple-300" />))}
        </span>
        <span className="text-sm font-semibold text-purple-900 dark:text-purple-100">{doneCount}/{steps.length}</span>
        <Maximize2 className="ml-auto h-4 w-4 text-purple-700 dark:text-purple-300" />
      </button>
    );
  }

  return (
    <div className="mb-6 rounded-2xl border border-purple-200 bg-gradient-to-br from-purple-50 to-white p-5 dark:border-purple-500/30 dark:from-purple-950/50 dark:to-card shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="flex items-center gap-2 font-semibold text-purple-900 dark:text-purple-100"><Sparkles className="h-4 w-4" /> Primeiros passos</p>
          <p className="text-sm text-muted-foreground">{doneCount} de {steps.length} concluídos. Complete para ter seu programa rodando.</p>
        </div>
        <Button size="sm" variant="outline" className="border-purple-300 bg-white/70 text-purple-800 hover:bg-purple-100 dark:border-purple-500/50 dark:bg-transparent dark:text-purple-100 dark:hover:bg-purple-900/50" onClick={() => setCollapsed(true)} title="Minimizar" aria-label="Minimizar primeiros passos">
          <Minimize2 className="mr-1 h-4 w-4" /> Minimizar
        </Button>
      </div>
      <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-purple-100 dark:bg-purple-900/60">
        <div className="h-full rounded-full bg-purple-600 transition-all" style={{ width: `${progress}%` }} />
      </div>
      {canManage ? <p className="mt-2 text-xs text-muted-foreground">Já fez algum passo por fora? Clique no círculo para marcar como feito.</p> : null}
      {!collapsed ? (
        <ul className="mt-4 space-y-2">
          {steps.map((step) => (
            <li key={step.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-white/70 px-3 py-2 dark:bg-white/5">
              <div className="flex items-start gap-3">
                <button
                  type="button"
                  onClick={() => toggleManual(step)}
                  disabled={!canManage || step.autoDone}
                  title={step.autoDone ? 'Concluído automaticamente' : step.done ? 'Desmarcar' : 'Marcar como feito'}
                  aria-label={step.done ? `Desmarcar: ${step.label}` : `Marcar como feito: ${step.label}`}
                  className="mt-0.5 rounded-full transition enabled:hover:scale-110 disabled:cursor-default"
                >
                  {step.done ? <CheckCircle2 className="h-5 w-5 text-emerald-500" /> : <Circle className="h-5 w-5 text-gray-300 hover:text-emerald-400 dark:text-gray-600" />}
                </button>
                <div>
                  <p className={`text-sm font-medium ${step.done ? 'text-muted-foreground line-through' : ''}`}>{step.label}</p>
                  {!step.done ? <p className="text-xs text-muted-foreground">{step.helper}</p> : null}
                </div>
              </div>
              {!step.done && step.action ? (
                <Button size="sm" variant="outline" onClick={step.action.run}>{step.action.label}</Button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}

      <BusinessTemplateDialog
        open={templateOpen}
        onOpenChange={(v) => { setTemplateOpen(v); if (!v) load(); }}
        projectId={projectId}
        projectName={projectName}
        initialType={status.business_type}
        onApplied={load}
      />
    </div>
  );
}
