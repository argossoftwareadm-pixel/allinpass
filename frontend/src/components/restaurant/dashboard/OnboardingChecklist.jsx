import React, { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, Circle, ChevronDown, ChevronUp, Sparkles, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/supabaseClient';
import BusinessTemplateDialog from './BusinessTemplateDialog';

export default function OnboardingChecklist({ projectId, projectName, canManage, onNavigate }) {
  const [status, setStatus] = useState(null);
  const [collapsed, setCollapsed] = useState(false);
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

  const steps = [
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

  const doneCount = steps.filter((s) => s.done).length;
  const progress = Math.round((doneCount / steps.length) * 100);
  if (doneCount === steps.length) return null;

  const dismiss = async () => {
    await supabase.rpc('fn_project_onboarding_mark', { p_project_id: projectId, p_step: 'dismiss' });
    load();
  };

  return (
    <div className="mb-6 rounded-2xl border border-purple-200 bg-gradient-to-br from-purple-50 to-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="flex items-center gap-2 font-semibold text-purple-900"><Sparkles className="h-4 w-4" /> Primeiros passos</p>
          <p className="text-sm text-muted-foreground">{doneCount} de {steps.length} concluídos. Complete para ter seu programa rodando.</p>
        </div>
        <div className="flex items-center gap-1">
          <Button size="sm" variant="ghost" onClick={() => setCollapsed((v) => !v)} aria-label={collapsed ? 'Mostrar passos' : 'Esconder passos'}>
            {collapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
          </Button>
          {canManage ? (
            <Button size="sm" variant="ghost" onClick={dismiss} title="Não mostrar mais" aria-label="Não mostrar mais"><X className="h-4 w-4" /></Button>
          ) : null}
        </div>
      </div>
      <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-purple-100">
        <div className="h-full rounded-full bg-purple-600 transition-all" style={{ width: `${progress}%` }} />
      </div>
      {!collapsed ? (
        <ul className="mt-4 space-y-2">
          {steps.map((step) => (
            <li key={step.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-white/70 px-3 py-2">
              <div className="flex items-start gap-3">
                {step.done ? <CheckCircle2 className="mt-0.5 h-5 w-5 text-emerald-500" /> : <Circle className="mt-0.5 h-5 w-5 text-gray-300" />}
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
