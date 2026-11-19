import React, { useCallback, useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { listMonthlyBillingPlans, updateBillingPlan, updatePricingPromotion } from '@/lib/superadminBilling';
import { fetchPricingPromotionRaw } from '@/lib/pricingPromotion';

const PLAN_ORDER = ['free_trial', 'starter', 'pro', 'premium'];

function centsToInput(cents) {
  return (Number(cents || 0) / 100).toFixed(2).replace('.', ',');
}

function inputToCents(value) {
  const normalized = String(value ?? '').trim().replace(/\./g, '').replace(',', '.');
  const number = Number(normalized);
  return Number.isFinite(number) ? Math.round(number * 100) : NaN;
}

function planToForm(plan) {
  return {
    basePrice: centsToInput(plan.base_price_cents),
    includedPassInstalls: String(plan.included_pass_installs ?? 0),
    includedNotificationSends: String(plan.included_notification_sends ?? 0),
    overagePassInstall: centsToInput(plan.overage_pass_install_cents),
    overageNotificationSent: centsToInput(plan.overage_notification_sent_cents),
    trialDays: String(plan.trial_days ?? 0),
  };
}

function formatMoney(cents) {
  return (cents / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function PlanEditorCard({ plan, onSaved }) {
  const { toast } = useToast();
  const [form, setForm] = useState(() => planToForm(plan));
  const [saving, setSaving] = useState(false);
  const isTrial = plan.code === 'free_trial';

  useEffect(() => {
    setForm(planToForm(plan));
  }, [plan]);

  const bind = (field) => (event) => setForm((prev) => ({ ...prev, [field]: event.target.value }));

  const handleSubmit = async (event) => {
    event.preventDefault();
    const basePriceCents = isTrial ? 0 : inputToCents(form.basePrice);
    const overagePassInstallCents = inputToCents(form.overagePassInstall);
    const overageNotificationSentCents = inputToCents(form.overageNotificationSent);
    const includedPassInstalls = Number.parseInt(form.includedPassInstalls, 10);
    const includedNotificationSends = Number.parseInt(form.includedNotificationSends, 10);
    const trialDays = Number.parseInt(form.trialDays, 10);

    if (
      [basePriceCents, overagePassInstallCents, overageNotificationSentCents, includedPassInstalls, includedNotificationSends]
        .some((value) => !Number.isFinite(value) || value < 0)
      || (isTrial && (!Number.isFinite(trialDays) || trialDays < 0 || trialDays > 90))
    ) {
      toast({ title: 'Valores inválidos', description: 'Confira os números digitados.', variant: 'destructive' });
      return;
    }

    setSaving(true);
    try {
      await updateBillingPlan({
        code: plan.code,
        basePriceCents,
        includedPassInstalls,
        includedNotificationSends,
        overagePassInstallCents,
        overageNotificationSentCents,
        trialDays: isTrial ? trialDays : null,
      });
      toast({ title: 'Plano salvo', description: `${plan.name} atualizado. O site já mostra os novos valores.` });
      onSaved?.();
    } catch (error) {
      toast({ title: 'Não foi possível salvar', description: error.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 rounded-2xl border border-border bg-card p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-bold">{plan.name}</h3>
        <span className="font-mono text-xs text-muted-foreground">{plan.code}</span>
      </div>

      {isTrial ? (
        <div className="space-y-2">
          <Label htmlFor={`trial-days-${plan.code}`}>Dias de teste grátis</Label>
          <Input id={`trial-days-${plan.code}`} type="number" min="0" max="90" value={form.trialDays} onChange={bind('trialDays')} disabled={saving} />
        </div>
      ) : (
        <div className="space-y-2">
          <Label htmlFor={`price-${plan.code}`}>Preço mensal (R$)</Label>
          <Input id={`price-${plan.code}`} inputMode="decimal" value={form.basePrice} onChange={bind('basePrice')} disabled={saving} />
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor={`installs-${plan.code}`}>Instalações de passe inclusas</Label>
          <Input id={`installs-${plan.code}`} type="number" min="0" value={form.includedPassInstalls} onChange={bind('includedPassInstalls')} disabled={saving} />
        </div>
        <div className="space-y-2">
          <Label htmlFor={`notifications-${plan.code}`}>Notificações inclusas</Label>
          <Input id={`notifications-${plan.code}`} type="number" min="0" value={form.includedNotificationSends} onChange={bind('includedNotificationSends')} disabled={saving} />
        </div>
      </div>

      {!isTrial && (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor={`overage-install-${plan.code}`}>Excedente por instalação (R$)</Label>
            <Input id={`overage-install-${plan.code}`} inputMode="decimal" value={form.overagePassInstall} onChange={bind('overagePassInstall')} disabled={saving} />
          </div>
          <div className="space-y-2">
            <Label htmlFor={`overage-notification-${plan.code}`}>Excedente por notificação (R$)</Label>
            <Input id={`overage-notification-${plan.code}`} inputMode="decimal" value={form.overageNotificationSent} onChange={bind('overageNotificationSent')} disabled={saving} />
          </div>
        </div>
      )}

      <div className="flex justify-end">
        <Button type="submit" disabled={saving}>
          {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Salvar
        </Button>
      </div>
    </form>
  );
}

function PromotionEditorCard({ plans }) {
  const { toast } = useToast();
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    fetchPricingPromotionRaw()
      .then((value) => {
        if (!active) return;
        setForm({
          enabled: value?.enabled === true,
          label: value?.label || 'Promo limitada',
          discountPercent: String(value?.discount_percent ?? 50),
          audienceLabel: value?.audience_label ?? '',
          endsAt: value?.ends_at ? String(value.ends_at).slice(0, 10) : '',
        });
      })
      .catch((error) => {
        toast({ title: 'Erro ao carregar a promoção', description: error.message, variant: 'destructive' });
      });
    return () => {
      active = false;
    };
  }, [toast]);

  if (!form) {
    return (
      <div className="flex items-center gap-2 rounded-2xl border border-border bg-card p-5 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Carregando promoção...
      </div>
    );
  }

  const percent = Math.trunc(Number(form.discountPercent));
  const percentValid = Number.isFinite(percent) && percent >= 1 && percent <= 90;
  const paidPlans = plans.filter((plan) => plan.code !== 'free_trial' && plan.base_price_cents > 0);

  const bind = (field) => (event) => {
    const value = event.target.type === 'checkbox' ? event.target.checked : event.target.value;
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!percentValid) {
      toast({ title: 'Desconto inválido', description: 'Use um valor entre 1% e 90%.', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      await updatePricingPromotion({
        enabled: form.enabled,
        label: form.label,
        discountPercent: percent,
        audienceLabel: form.audienceLabel,
        endsAt: form.endsAt ? `${form.endsAt}T23:59:59-03:00` : null,
      });
      toast({
        title: form.enabled ? 'Promoção salva' : 'Promoção desligada',
        description: 'A página de planos já mostra a mudança.',
      });
    } catch (error) {
      toast({ title: 'Erro ao salvar', description: error.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 rounded-2xl border border-amber-200 bg-amber-50/40 p-5 shadow-sm dark:bg-amber-950/10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-bold">Promoção na página de planos</h3>
          <p className="text-sm text-muted-foreground">Selo e preço "De" riscado. É só visual: o cliente sempre paga o preço do plano.</p>
        </div>
        <label className="inline-flex cursor-pointer items-center gap-2 text-sm font-semibold">
          <input type="checkbox" className="h-4 w-4 accent-purple-600" checked={form.enabled} onChange={bind('enabled')} disabled={saving} />
          {form.enabled ? 'Ligada' : 'Desligada'}
        </label>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-2">
          <Label htmlFor="promo-label">Texto do selo</Label>
          <Input id="promo-label" maxLength={40} value={form.label} onChange={bind('label')} disabled={saving} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="promo-percent">Desconto exibido (%)</Label>
          <Input id="promo-percent" type="number" min="1" max="90" value={form.discountPercent} onChange={bind('discountPercent')} disabled={saving} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="promo-audience">Para quem (opcional)</Label>
          <Input id="promo-audience" maxLength={40} placeholder="100 primeiros" value={form.audienceLabel} onChange={bind('audienceLabel')} disabled={saving} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="promo-ends">Termina em (opcional)</Label>
          <Input id="promo-ends" type="date" value={form.endsAt} onChange={bind('endsAt')} disabled={saving} />
        </div>
      </div>

      {percentValid && paidPlans.length > 0 ? (
        <div className="rounded-xl bg-background/70 p-3 text-sm">
          <p className="mb-1 font-semibold">Como vai aparecer</p>
          <ul className="space-y-0.5 text-muted-foreground">
            {paidPlans.map((plan) => (
              <li key={plan.code}>
                {plan.name}: <span className="line-through">De R$ {formatMoney(Math.round(plan.base_price_cents / (1 - percent / 100)))}</span>{' '}
                por <strong className="text-foreground">R$ {formatMoney(plan.base_price_cents)}</strong>/mês
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-muted-foreground">
            O preço "De" é calculado para que o desconto anunciado seja verdadeiro. Sem data de término, fica até você desligar.
          </p>
        </div>
      ) : null}

      <div className="flex justify-end">
        <Button type="submit" disabled={saving}>
          {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Salvar promoção
        </Button>
      </div>
    </form>
  );
}

const PlansPricingTab = () => {
  const { toast } = useToast();
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadPlans = useCallback(async () => {
    setLoading(true);
    try {
      const list = [...(await listMonthlyBillingPlans())]
        .filter((plan) => plan.is_active)
        .sort((a, b) => PLAN_ORDER.indexOf(a.code) - PLAN_ORDER.indexOf(b.code));
      setPlans(list);
    } catch (error) {
      toast({ title: 'Erro ao carregar planos', description: error.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    loadPlans();
  }, [loadPlans]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-foreground">Planos e preços</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Os valores salvos aqui aparecem no site e valem para novas assinaturas e mudanças de plano. Quem já assina continua pagando o preço que contratou.
        </p>
      </div>
      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando planos...
        </div>
      ) : (
        <>
          <PromotionEditorCard plans={plans} />
          <div className="grid gap-6 lg:grid-cols-2">
            {plans.map((plan) => (
              <PlanEditorCard key={plan.code} plan={plan} onSaved={loadPlans} />
            ))}
          </div>
        </>
      )}
    </div>
  );
};

export default PlansPricingTab;
