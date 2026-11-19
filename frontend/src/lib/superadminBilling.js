import { supabase } from '@/lib/supabaseClient';

function friendlyMessage(error, fallback) {
  const message = String(error?.message || '').trim();
  return !message || message === 'forbidden' ? fallback : message;
}

export async function grantProjectCourtesy({ projectId, planCode, until = null }) {
  const { data, error } = await supabase.rpc('superadmin_grant_courtesy', {
    p_project_id: projectId,
    p_plan_code: planCode,
    p_until: until,
  });
  if (error) throw new Error(friendlyMessage(error, 'Não foi possível liberar o projeto.'));
  return data;
}

export async function revokeProjectCourtesy({ projectId }) {
  const { error } = await supabase.rpc('superadmin_revoke_courtesy', {
    p_project_id: projectId,
  });
  if (error) throw new Error(friendlyMessage(error, 'Não foi possível encerrar a cortesia.'));
}

export async function listMonthlyBillingPlans() {
  const { data, error } = await supabase
    .from('billing_plans')
    .select(
      'id, code, name, base_price_cents, trial_days, included_pass_installs, included_notification_sends, overage_pass_install_cents, overage_notification_sent_cents, is_active, billing_interval',
    )
    .eq('billing_interval', 'monthly')
    .order('base_price_cents', { ascending: true });
  if (error) throw new Error(friendlyMessage(error, 'Não foi possível carregar os planos.'));
  return data || [];
}

export async function updateBillingPlan({
  code,
  basePriceCents,
  includedPassInstalls,
  includedNotificationSends,
  overagePassInstallCents,
  overageNotificationSentCents,
  trialDays = null,
}) {
  const { data, error } = await supabase.rpc('superadmin_update_billing_plan', {
    p_code: code,
    p_base_price_cents: basePriceCents,
    p_included_pass_installs: includedPassInstalls,
    p_included_notification_sends: includedNotificationSends,
    p_overage_pass_install_cents: overagePassInstallCents,
    p_overage_notification_sent_cents: overageNotificationSentCents,
    p_trial_days: trialDays,
  });
  if (error) throw new Error(friendlyMessage(error, 'Não foi possível salvar o plano.'));
  return data;
}

export async function updatePricingPromotion({
  enabled,
  label,
  discountPercent,
  audienceLabel,
  endsAt = null,
}) {
  const { data, error } = await supabase.rpc('superadmin_update_pricing_promotion', {
    p_enabled: !!enabled,
    p_label: label,
    p_discount_percent: Math.trunc(Number(discountPercent)),
    p_audience_label: audienceLabel ?? '',
    p_ends_at: endsAt,
  });
  if (error) throw new Error(friendlyMessage(error, 'Não foi possível salvar a promoção.'));
  return data;
}
