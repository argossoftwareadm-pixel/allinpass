// supabase/functions/nuvemshop-webhook/index.ts
// Webhooks da Nuvemshop -> cartão AllinPass do comprador.
//  - order/paid: +1 ponto (modo fidelidade) ou cashback em R$ (modo cashback), conforme configurado no superadmin.
//  - order/cancelled / order/voided: retira o que foi creditado, se o estabelecimento escolheu estornar.
//  - app/uninstalled e webhooks obrigatórios da LGPD.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const USER_AGENT = "AllinPass Fidelidade (brunacottaps@gmail.com)";
const API_BASE = "https://api.nuvemshop.com.br/v1";
const CANCEL_EVENTS = new Set(["order/cancelled", "order/voided"]);

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function toHex(buf: ArrayBuffer) {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function timingSafeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

async function verifyHmac(secret: string, raw: Uint8Array, header: string | null) {
  if (!header) return false;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, raw);
  return timingSafeEqual(toHex(sig), header.trim().toLowerCase());
}

function cleanEmail(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim().toLowerCase();
  return s.includes("@") ? s : null;
}

function toCents(value: unknown): number {
  const n = Number(String(value ?? "").replace(",", "."));
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

function formatPoints(points: number) {
  return points === 1 ? "1 ponto" : `${points} pontos`;
}

function formatBRL(cents: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format((cents || 0) / 100);
}

type PassTarget = {
  pass_token?: string | null;
  google_object_id?: string | null;
  install_platform?: string | null;
  install_status?: string | null;
};

// Atualiza o cartão na Apple/Google Wallet (não bloqueante), igual ao scanner.
async function pushWalletUpdate(
  supabaseUrl: string,
  serviceKey: string,
  projectId: string,
  userPassId: string,
  target: PassTarget,
  message: string | null,
) {
  const headers = { Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json" };
  if (target.pass_token) {
    for (const fn of ["apple-push", "google-push"]) {
      try {
        const r = await fetch(`${supabaseUrl}/functions/v1/${fn}`, {
          method: "POST",
          headers,
          body: JSON.stringify({ pass_token: target.pass_token }),
        });
        console.log(`[nuvemshop-webhook] ${fn}:`, r.status);
      } catch (e) {
        console.log(`[nuvemshop-webhook] ${fn} failed (ignored):`, String(e));
      }
    }
  }
  if (message && target.google_object_id) {
    try {
      await fetch(`${supabaseUrl}/functions/v1/send-google-notification`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          projectId,
          header: "Allin Pass",
          message,
          targets: [{
            project_id: projectId,
            user_pass_id: userPassId,
            google_object_id: target.google_object_id,
            install_platform: target.install_platform ?? "google",
            install_status: target.install_status ?? "installed",
          }],
        }),
      });
    } catch (e) {
      console.log("[nuvemshop-webhook] send-google-notification failed (ignored):", String(e));
    }
  }
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ ok: true });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
  const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const CLIENT_SECRET = Deno.env.get("NUVEMSHOP_CLIENT_SECRET") ?? "";

  if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !CLIENT_SECRET) {
    console.error("[nuvemshop-webhook] missing env (NUVEMSHOP_CLIENT_SECRET?)");
    return json({ error: "not_configured" }, 503); // 5xx => a Nuvemshop tenta de novo depois
  }

  const raw = new Uint8Array(await req.arrayBuffer());
  if (!(await verifyHmac(CLIENT_SECRET, raw, req.headers.get("x-linkedstore-hmac-sha256")))) {
    console.warn("[nuvemshop-webhook] invalid signature");
    return json({ error: "invalid_signature" }, 401);
  }

  let payload: any = {};
  try {
    payload = JSON.parse(new TextDecoder().decode(raw));
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  const sb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const topic = new URL(req.url).searchParams.get("topic");
  const storeId = Number(payload?.store_id);
  const event = String(payload?.event ?? topic ?? "");

  try {
    // ---------- LGPD ----------
    if (topic === "store_redact") {
      if (Number.isFinite(storeId)) {
        await sb.from("nuvemshop_stores").update({ access_token: null, status: "uninstalled", uninstalled_at: new Date().toISOString() }).eq("store_id", storeId);
        await sb.from("nuvemshop_order_events").update({ customer_email: null }).eq("store_id", storeId);
      }
      return json({ ok: true });
    }
    if (topic === "customers_redact") {
      const email = cleanEmail(payload?.customer?.email);
      if (Number.isFinite(storeId) && email) {
        await sb.from("nuvemshop_order_events").update({ customer_email: null }).eq("store_id", storeId).eq("customer_email", email);
      }
      return json({ ok: true });
    }
    if (topic === "customers_data_request") {
      // Guardamos apenas o e-mail e o número do pedido, para controle de pontuação.
      return json({ ok: true });
    }

    if (!Number.isFinite(storeId)) return json({ error: "missing_store_id" }, 400);

    // ---------- App desinstalado ----------
    if (event === "app/uninstalled") {
      await sb.from("nuvemshop_stores").update({
        access_token: null,
        status: "uninstalled",
        uninstalled_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq("store_id", storeId);
      return json({ ok: true });
    }

    const orderId = Number(payload?.id);
    if (!Number.isFinite(orderId)) return json({ ok: true, ignored: "missing_order_id" });

    const { data: store } = await sb
      .from("nuvemshop_stores")
      .select("store_id, project_id, access_token, status")
      .eq("store_id", storeId)
      .maybeSingle();

    // ---------- Cancelamento / estorno ----------
    if (CANCEL_EVENTS.has(event)) {
      const { data: prev } = await sb
        .from("nuvemshop_order_events")
        .select("id, project_id, status, reversed_at, user_pass_id")
        .eq("store_id", storeId)
        .eq("order_id", orderId)
        .maybeSingle();
      if (!prev || prev.status !== "credited" || prev.reversed_at || !prev.project_id) {
        return json({ ok: true, ignored: "nothing_to_reverse" });
      }
      const { data: settings } = await sb.rpc("fn_nuvemshop_get_settings", { p_project_id: prev.project_id });
      if (!settings?.revert_on_cancel) {
        await sb.from("nuvemshop_order_events")
          .update({ reversal_detail: `${event}: mantido (estabelecimento não estorna)`, updated_at: new Date().toISOString() })
          .eq("id", prev.id);
        return json({ ok: true, kept: true });
      }
      const { data: rev, error: revErr } = await sb.rpc("fn_nuvemshop_reverse_event", { p_event_id: prev.id });
      if (revErr) throw revErr;
      if (rev?.ok) {
        const message = rev.mode === "cashback"
          ? `Pedido cancelado: ${formatBRL(rev.removed_cents)} de cashback removidos. Saldo: ${formatBRL(rev.balance_cents)}.`
          : `Pedido cancelado: ponto da compra removido. Você tem ${formatPoints(rev.points)}.`;
        await pushWalletUpdate(SUPABASE_URL, SERVICE_ROLE_KEY, String(prev.project_id), String(prev.user_pass_id), rev, message);
      }
      return json({ ok: true, reversed: !!rev?.ok });
    }

    if (event !== "order/paid") return json({ ok: true, ignored: event });

    // ---------- Idempotência: cada pedido credita uma vez ----------
    const { data: inserted, error: insErr } = await sb
      .from("nuvemshop_order_events")
      .insert({ store_id: storeId, order_id: orderId, event, status: "processing" })
      .select("id")
      .maybeSingle();

    let eventRowId: string | null = inserted?.id ?? null;
    if (insErr) {
      const { data: prev } = await sb
        .from("nuvemshop_order_events")
        .select("id, status")
        .eq("store_id", storeId)
        .eq("order_id", orderId)
        .maybeSingle();
      if (!prev || prev.status !== "error") return json({ ok: true, duplicate: true });
      eventRowId = prev.id;
      await sb.from("nuvemshop_order_events").update({ status: "processing", updated_at: new Date().toISOString() }).eq("id", prev.id);
    }

    const finish = async (status: string, extra: Record<string, unknown> = {}) => {
      await sb.from("nuvemshop_order_events").update({ status, ...extra, updated_at: new Date().toISOString() }).eq("id", eventRowId);
    };

    if (!store?.access_token || store.status !== "active") {
      await finish("ignored_store_not_connected");
      return json({ ok: true, ignored: "store_not_connected" });
    }
    if (!store.project_id) {
      await finish("ignored_store_without_project");
      return json({ ok: true, ignored: "store_without_project" });
    }

    const { data: settings } = await sb.rpc("fn_nuvemshop_get_settings", { p_project_id: store.project_id });
    if (!settings?.enabled) {
      await finish("ignored_not_enabled", { project_id: store.project_id });
      return json({ ok: true, ignored: "not_enabled" });
    }
    const creditMode: "points" | "cashback" = settings.credit_mode === "cashback" ? "cashback" : "points";

    const orderRes = await fetch(`${API_BASE}/${storeId}/orders/${orderId}`, {
      headers: { "Authentication": `bearer ${store.access_token}`, "User-Agent": USER_AGENT },
    });
    if (!orderRes.ok) {
      await finish("error", { project_id: store.project_id, detail: `order_fetch_${orderRes.status}` });
      return json({ error: "order_fetch_failed" }, 502);
    }
    const order = await orderRes.json();

    const email = cleanEmail(order?.contact_email) ?? cleanEmail(order?.customer?.email);
    const paymentStatus = String(order?.payment_status ?? "").toLowerCase();
    const orderTotalCents = toCents(order?.total);
    const base = { project_id: store.project_id, customer_email: email, credit_mode: creditMode, order_total_cents: orderTotalCents };

    if (paymentStatus && paymentStatus !== "paid") {
      await finish("ignored_not_paid", { ...base, detail: paymentStatus });
      return json({ ok: true, ignored: "not_paid" });
    }
    if (!email) {
      await finish("ignored_no_email", base);
      return json({ ok: true, ignored: "no_email" });
    }

    const { data: sub } = await sb
      .from("billing_subscriptions")
      .select("id")
      .eq("project_id", store.project_id)
      .in("status", ["trialing", "active", "past_due", "paused"])
      .limit(1)
      .maybeSingle();
    if (!sub) {
      await finish("ignored_billing_inactive", base);
      return json({ ok: true, ignored: "billing_inactive" });
    }

    const { data: userPassId, error: findErr } = await sb.rpc("fn_nuvemshop_find_pass", { p_project_id: store.project_id, p_email: email });
    if (findErr) throw findErr;
    if (!userPassId) {
      await finish("ignored_no_pass", base);
      return json({ ok: true, ignored: "no_pass" });
    }

    let message: string;
    let credit: any;

    if (creditMode === "cashback") {
      const cashbackCents = Math.floor((orderTotalCents * Number(settings.cashback_bps || 0)) / 10000);
      if (cashbackCents <= 0) {
        await finish("ignored_zero_value", { ...base, user_pass_id: userPassId });
        return json({ ok: true, ignored: "zero_value" });
      }
      const { data, error } = await sb.rpc("fn_nuvemshop_credit_value", {
        p_user_pass_id: userPassId,
        p_amount_cents: cashbackCents,
        p_order_ref: `${storeId}:${orderId}`,
      });
      if (error) throw error;
      credit = Array.isArray(data) ? data[0] : data;
      if (credit?.pass_type !== "value") {
        await finish("ignored_mode_mismatch", { ...base, user_pass_id: userPassId, detail: "cartão de pontos; loja em modo cashback" });
        return json({ ok: true, ignored: "mode_mismatch" });
      }
      await finish("credited", { ...base, user_pass_id: userPassId, cashback_cents: cashbackCents });
      message = `${formatBRL(cashbackCents)} de cashback pela sua compra online! Saldo: ${formatBRL(credit.balance_cents)}.`;
    } else {
      const { data, error } = await sb.rpc("fn_nuvemshop_credit_point", { p_user_pass_id: userPassId });
      if (error) throw error;
      credit = Array.isArray(data) ? data[0] : data;
      if (credit?.pass_type === "value") {
        await finish("ignored_mode_mismatch", { ...base, user_pass_id: userPassId, detail: "cartão de valor; loja em modo pontos" });
        return json({ ok: true, ignored: "mode_mismatch" });
      }
      await finish("credited", { ...base, user_pass_id: userPassId, points_after: credit?.points ?? null, points_credited: 1 });
      message = credit?.reset
        ? `Compra online registrada! Validade renovada. Você tem ${formatPoints(credit.points)}.`
        : `+1 ponto pela sua compra online! Você tem ${formatPoints(credit.points)}.`;
    }

    await pushWalletUpdate(SUPABASE_URL, SERVICE_ROLE_KEY, String(store.project_id), String(userPassId), credit, message);
    return json({ ok: true, credited: true, mode: creditMode });
  } catch (e) {
    console.error("[nuvemshop-webhook] unhandled", String((e as any)?.message ?? e));
    try {
      if (Number.isFinite(storeId) && Number.isFinite(Number(payload?.id)) && event === "order/paid") {
        await sb.from("nuvemshop_order_events")
          .update({ status: "error", detail: String((e as any)?.message ?? e).slice(0, 300), updated_at: new Date().toISOString() })
          .eq("store_id", storeId)
          .eq("order_id", Number(payload?.id));
      }
    } catch { /* ignore */ }
    return json({ error: "internal" }, 500);
  }
});
