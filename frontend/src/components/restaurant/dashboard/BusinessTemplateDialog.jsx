import React, { useMemo, useState } from 'react';
import { Check, Copy, Loader2, Sparkles } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { supabase } from '@/lib/supabaseClient';
import { BUSINESS_TEMPLATES, templateById } from '@/lib/businessTemplates';

export default function BusinessTemplateDialog({ open, onOpenChange, projectId, projectName, initialType, onApplied }) {
  const { toast } = useToast();
  const [selected, setSelected] = useState(initialType || null);
  const [applying, setApplying] = useState(false);
  const [result, setResult] = useState(null);
  const template = useMemo(() => templateById(selected), [selected]);

  const close = (next) => {
    if (!next) setResult(null);
    onOpenChange(next);
  };

  async function applyTemplate() {
    if (!template || !projectId) return;
    setApplying(true);
    const summary = { rewardsCreated: [], rewardsSkipped: [], automation: null };
    try {
      const { data: existingRewards, error: rewardsErr } = await supabase
        .from('rewards')
        .select('id, name')
        .eq('project_id', projectId);
      if (rewardsErr) throw rewardsErr;
      const existingNames = new Set((existingRewards || []).map((r) => String(r.name || '').trim().toLowerCase()));

      for (const reward of template.rewards) {
        if (existingNames.has(reward.name.toLowerCase())) {
          summary.rewardsSkipped.push(reward.name);
          continue;
        }
        const { error } = await supabase.from('rewards').insert({
          project_id: projectId,
          name: reward.name,
          reward_type: 'loyalty',
          points_required: reward.points,
          value_required_cents: null,
          currency: 'BRL',
          status: 'active',
        });
        if (error) throw error;
        summary.rewardsCreated.push(`${reward.name} (${reward.points} pontos)`);
      }

      const { data: existingAutomations } = await supabase
        .from('automations')
        .select('id, type, status')
        .eq('project_id', projectId)
        .eq('type', template.automation.type);
      if (!existingAutomations?.length) {
        const { data, error } = await supabase.functions.invoke('create-automation', {
          body: { project_id: projectId, ...template.automation, status: 'on' },
        });
        if (error || !data?.success) throw new Error(data?.error || error?.message || 'Falha ao criar a automação.');
        summary.automation = `Lembrete automático após ${template.automation.quantity} dias sem visita`;
      }

      await supabase.rpc('fn_project_onboarding_mark', { p_project_id: projectId, p_step: 'template', p_value: template.id });
      setResult(summary);
      onApplied?.();
    } catch (err) {
      toast({ variant: 'destructive', title: 'Não foi possível aplicar o modelo', description: err?.message || 'Tente novamente.' });
    } finally {
      setApplying(false);
    }
  }

  const copy = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      toast({ title: 'Mensagem copiada' });
    } catch (_) {}
  };

  const name = projectName || 'seu negócio';

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Sparkles className="h-5 w-5 text-purple-600" /> Modelo pronto para o seu negócio</DialogTitle>
          <DialogDescription>
            Escolha o tipo de negócio e a gente cria as recompensas e o lembrete de retorno sugeridos. Você pode editar ou desativar tudo depois.
          </DialogDescription>
        </DialogHeader>

        {result ? (
          <div className="space-y-4">
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
              <p className="font-semibold">Modelo aplicado!</p>
              <ul className="mt-2 list-disc space-y-1 pl-5">
                {result.rewardsCreated.map((r) => <li key={r}>Recompensa criada: {r}</li>)}
                {result.rewardsSkipped.map((r) => <li key={r}>Recompensa "{r}" já existia, mantivemos a sua</li>)}
                {result.automation ? <li>{result.automation}</li> : <li>Você já tinha um lembrete de retorno, mantivemos o seu</li>}
              </ul>
            </div>
            {template ? (
              <div className="space-y-3">
                <p className="text-sm font-semibold">Ideias de mensagens para enviar em Notificações</p>
                {template.messages.map((m) => (
                  <div key={m} className="flex items-center justify-between gap-3 rounded-lg border border-border p-3 text-sm">
                    <span>{m}</span>
                    <Button size="sm" variant="ghost" onClick={() => copy(m)}><Copy className="h-4 w-4" /></Button>
                  </div>
                ))}
                <p className="rounded-lg bg-muted p-3 text-xs text-muted-foreground">{template.cardTip.replace('{nome}', name)}</p>
              </div>
            ) : null}
            <DialogFooter><Button onClick={() => close(false)}>Fechar</Button></DialogFooter>
          </div>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {BUSINESS_TEMPLATES.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setSelected(t.id)}
                  className={`rounded-xl border p-4 text-left transition ${selected === t.id ? 'border-purple-500 bg-purple-50 ring-2 ring-purple-200' : 'border-border hover:border-purple-300'}`}
                >
                  <p className="flex items-center justify-between font-semibold">
                    {t.label}
                    {selected === t.id ? <Check className="h-4 w-4 text-purple-600" /> : null}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">{t.rewards.map((r) => `${r.name} (${r.points} pts)`).join(' · ')}</p>
                </button>
              ))}
            </div>

            {template ? (
              <div className="rounded-xl border border-border p-4 text-sm">
                <p className="font-semibold">O que será criado</p>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">
                  {template.rewards.map((r) => <li key={r.name}>Recompensa: {r.name} com {r.points} pontos</li>)}
                  <li>Lembrete automático para quem ficar {template.automation.quantity} dias sem visitar: "{template.automation.message}"</li>
                </ul>
                <p className="mt-3 text-xs text-muted-foreground">O cartão em si você cria na aba Cartões. {template.cardTip.replace('{nome}', name)}</p>
              </div>
            ) : null}

            <DialogFooter>
              <Button variant="outline" onClick={() => close(false)}>Cancelar</Button>
              <Button disabled={!template || applying} onClick={applyTemplate}>
                {applying ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Aplicar modelo
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
