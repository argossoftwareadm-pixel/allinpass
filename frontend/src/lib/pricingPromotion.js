import { supabase } from '@/lib/supabaseClient';

export function normalizePricingPromotion(value) {
  if (!value || typeof value !== 'object') return null;
  const discountPercent = Math.trunc(Number(value.discount_percent));
  if (!Number.isFinite(discountPercent) || discountPercent < 1 || discountPercent > 90) return null;
  const endsAt = value.ends_at ? new Date(value.ends_at) : null;
  const expired = endsAt && !Number.isNaN(endsAt.getTime()) && endsAt.getTime() <= Date.now();
  return {
    enabled: value.enabled === true && !expired,
    label: String(value.label || 'Promo limitada'),
    discountPercent,
    discountLabel: `${discountPercent}% OFF`,
    audienceLabel: String(value.audience_label || '').trim(),
    originalPriceMultiplier: 1 / (1 - discountPercent / 100),
    endsAt: endsAt && !Number.isNaN(endsAt.getTime()) ? endsAt.toISOString() : null,
  };
}

export async function fetchPricingPromotionRaw() {
  const { data, error } = await supabase
    .from('site_settings')
    .select('value, updated_at')
    .eq('key', 'pricing_promotion')
    .maybeSingle();
  if (error) throw error;
  return data?.value ?? null;
}

export async function loadPricingPromotion() {
  try {
    return normalizePricingPromotion(await fetchPricingPromotionRaw());
  } catch (error) {
    console.error('pricing promotion load failed', error);
    return null;
  }
}
