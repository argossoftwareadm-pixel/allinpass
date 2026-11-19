import { normalizeAffiliateRef } from '@/lib/subscriptionPlans';

// Guarda por 90 dias o código de afiliado (?promo / ?ref) e a primeira origem de marketing
// (UTM, clique pago, redes sociais/Google), enviados no início do checkout.
const AFFILIATE_REF_STORAGE_KEY = '__allinpass_affiliate_ref_v1';
const MARKETING_TOUCH_STORAGE_KEY = '__allinpass_marketing_touch_v1';
const ATTRIBUTION_TTL_MS = 90 * 24 * 60 * 60 * 1000;
const PAID_CLICK_PARAMS = ['gclid', 'gbraid', 'wbraid', 'dclid', 'msclkid'];
const PAID_MEDIUMS = new Set(['cpc', 'ppc', 'cpm', 'paid', 'paid_social', 'paidsocial', 'paid-social', 'ads', 'ad', 'display', 'retargeting']);
const GOOGLE_HOST = /^google\.[a-z.]+$/;
const SOCIAL_HOSTS = [
  /(^|\.)instagram\.com$/,
  /(^|\.)facebook\.com$/,
  /(^|\.)fb\.com$/,
  /(^|\.)linkedin\.com$/,
  /^lnkd\.in$/,
  /(^|\.)tiktok\.com$/,
  /(^|\.)youtube\.com$/,
  /^youtu\.be$/,
  /(^|\.)threads\.net$/,
  /^t\.co$/,
  /(^|\.)x\.com$/,
  /(^|\.)twitter\.com$/,
  /(^|\.)pinterest\.[a-z.]+$/,
];

function getStorage() {
  try {
    return typeof window === 'undefined' || !window.localStorage ? null : window.localStorage;
  } catch (_) {
    return null;
  }
}

function readEntry(key, now = Date.now()) {
  const storage = getStorage();
  if (!storage) return null;
  try {
    const raw = storage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const savedAt = Number(parsed?.savedAt || 0);
    if (!Number.isFinite(savedAt) || savedAt <= 0 || now - savedAt > ATTRIBUTION_TTL_MS) {
      storage.removeItem(key);
      return null;
    }
    return parsed;
  } catch (_) {
    return null;
  }
}

function writeEntry(key, value) {
  const storage = getStorage();
  if (!storage) return;
  try {
    storage.setItem(key, JSON.stringify(value));
  } catch (_) {}
}

function normalizeParam(value, max = 120) {
  return String(value || '').trim().toLowerCase().slice(0, max);
}

function externalReferrerHost(referrer, currentHost) {
  if (!referrer) return '';
  try {
    const host = new URL(referrer).hostname.toLowerCase().replace(/^www\./, '');
    const current = String(currentHost || '').toLowerCase().replace(/^www\./, '');
    if (!host || host === current || (current && host.endsWith(`.${current}`)) || (current && current.endsWith(`.${host}`))) return '';
    return host;
  } catch (_) {
    return '';
  }
}

export function captureMarketingAttribution({
  search = typeof window !== 'undefined' ? window.location.search : '',
  pathname = typeof window !== 'undefined' ? window.location.pathname : '/',
  referrer = typeof document !== 'undefined' ? document.referrer : '',
  currentHost = typeof window !== 'undefined' ? window.location.hostname : '',
  now = Date.now(),
} = {}) {
  let params;
  try {
    params = new URLSearchParams(search || '');
  } catch (_) {
    return;
  }

  const affiliateRef = normalizeAffiliateRef(params.get('promo') || params.get('ref'));
  if (affiliateRef) writeEntry(AFFILIATE_REF_STORAGE_KEY, { code: affiliateRef, savedAt: now });

  const utmSource = normalizeParam(params.get('utm_source'));
  const utmMedium = normalizeParam(params.get('utm_medium'));
  const utmCampaign = normalizeParam(params.get('utm_campaign'));
  const referrerHost = externalReferrerHost(referrer, currentHost);
  const paidClick = PAID_CLICK_PARAMS.some((key) => params.get(key)) || PAID_MEDIUMS.has(utmMedium);
  const isMarketingReferrer = referrerHost && (GOOGLE_HOST.test(referrerHost) || SOCIAL_HOSTS.some((re) => re.test(referrerHost)));

  if ((!utmSource && !utmMedium && !isMarketingReferrer) || readEntry(MARKETING_TOUCH_STORAGE_KEY, now)) return;

  writeEntry(MARKETING_TOUCH_STORAGE_KEY, {
    utm_source: utmSource || null,
    utm_medium: utmMedium || null,
    utm_campaign: utmCampaign || null,
    referrer_host: isMarketingReferrer ? referrerHost : null,
    landing_path: String(pathname || '/').slice(0, 200),
    paid_click: paidClick,
    first_seen_at: new Date(now).toISOString(),
    savedAt: now,
  });
}

export function getStoredAffiliateRef(now = Date.now()) {
  return normalizeAffiliateRef(readEntry(AFFILIATE_REF_STORAGE_KEY, now)?.code || '');
}

export function getStoredMarketingSource(now = Date.now()) {
  const entry = readEntry(MARKETING_TOUCH_STORAGE_KEY, now);
  if (!entry) return null;
  return {
    utm_source: entry.utm_source || null,
    utm_medium: entry.utm_medium || null,
    utm_campaign: entry.utm_campaign || null,
    referrer_host: entry.referrer_host || null,
    landing_path: entry.landing_path || null,
    paid_click: entry.paid_click === true,
    first_seen_at: entry.first_seen_at || null,
  };
}
