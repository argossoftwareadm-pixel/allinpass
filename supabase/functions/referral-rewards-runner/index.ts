// supabase/functions/referral-rewards-runner/index.ts
// Aplica as recompensas do programa "Indique e ganhe" na próxima cobrança pendente do Asaas
// do estabelecimento que indicou.
//  - crédito >= valor da cobrança (e sem excedente anexado): a cobrança é dada como recebida (mensalidade grátis)
//  - crédito menor: o valor da cobrança é reduzido (mínimo R$ 5,00 exigido pelo Asaas); o restante fica para a próxima
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type Admin = ReturnType<typeof createClient>;

const MIN_PAYMENT_CENTS = 500;
const MAX_DAYS_AHEAD = 35;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function asaasBase() {
  const explicit = String(Deno.env.get("ASAAS_API_BASE_URL") ?? "").trim();
  if (explicit) return explicit.replace(/\/$/, "");
  const env = String(Deno.env.get("ASAAS_ENV") ?? "sandbox").trim().toLowerCase();
  return env === "production" ? "https://api.asaas.com/v3" : "https://api-sandbox.asaas.com/v3";
}

async function asaas(apiKey: string, path: string, init: RequestInit = {}) {
  const res = await fetch(`${asaasBase()}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", "User-Agent": "AllinPass", access_token: apiKey, ...(init.headers ?? {}) },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = Array.isArray(body?.errors) ? body.errors.map((e: any) => e?.description).join("; ") : JSON.stringify(body).slice(0, 300);
    throw new Error(`asaas ${res.status}: ${msg}`);
  }
  return body;
}

const toCents = (v: unknown) => Math.max(0, Math.round(Number(v || 0) * 100));
const toValue = (c: number) => Math.max(0, Math.trunc(c)) / 100;

async function assertAuth(req: Request, serviceKey: string, sb: Admin) {
  const auth = req.headers.get("Authorization") ?? "";
  const bearer = auth.replace(/^Bearer\s+/i, "").trim();
  if (bearer && bearer === serviceKey) return;
  const header = String(req.headers.get("x-cron-secret") ?? "").trim();
  const token = bearer || header;
  const envSecrets = [Deno.env.get("CRON_SECRET"), Deno.env.get("BILLING_CRON_SECRET")].map((v) => String(v ?? "").trim()).filter(Boolean);
  if (token && envSecrets.includes(token)) return;
  if (token) {
    const { data } = await sb.rpc("verify_billing_cron_secret", { p_token: token });
    if (data === true) return;
  }
  throw new Response(JSON.stringify({ ok: false, error: "unauthorized" }), { status: 401 });
}

async function setReward(sb: Admin, id: string, patch: Record<string, unknown>) {
  await sb.from("customer_referral_rewards").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", id);
}

async function processReward(sb: Admin, apiKey: string, reward: any, dryRun: boolean) {
  const marker = `[indicacao:${String(reward.id).slice(0, 8)}]`;
  const applications: any[] = Array.isArray(reward.applications) ? reward.applications : [];

  const { data: sub } = await sb
    .from("billing_subscriptions")
    .select("id, status, gateway_provider, gateway_subscription_id, base_price_cents")
    .eq("project_id", reward.referrer_project_id)
    .in("status", ["active", "past_due"])
    .eq("gateway_provider", "asaas")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!sub?.gateway_subscription_id) {
    await setReward(sb, reward.id, { last_error: "Indicador ainda sem assinatura paga ativa; o crédito aguarda." });
    return { id: reward.id, skipped: "referrer_without_paid_subscription" };
  }

  // Regra: mensalidade grátis se o indicado paga igual ou mais; senão, desconto do valor do plano indicado.
  const cap = Math.min(Number(sub.base_price_cents || 0) || reward.referred_plan_cents, reward.referred_plan_cents);
  let rewardCents = reward.reward_cents;
  if (cap > 0 && cap !== rewardCents && reward.applied_cents === 0) {
    rewardCents = cap;
    if (!dryRun) await setReward(sb, reward.id, { reward_cents: cap, referrer_plan_cents: sub.base_price_cents });
  }
  const remaining = rewardCents - Number(reward.applied_cents || 0);
  if (remaining <= 0) {
    if (!dryRun) await setReward(sb, reward.id, { status: "applied", applied_at: new Date().toISOString(), last_error: null });
    return { id: reward.id, done: true };
  }

  const params = new URLSearchParams({ subscription: sub.gateway_subscription_id, status: "PENDING", limit: "20" });
  const list = await asaas(apiKey, `/payments?${params}`);
  const today = new Date();
  const limitDate = new Date(today.getTime() + MAX_DAYS_AHEAD * 86400000);
  const payments = (Array.isArray(list?.data) ? list.data : [])
    .filter((p: any) => p?.id && p?.dueDate && new Date(`${p.dueDate}T00:00:00Z`) <= limitDate)
    .sort((a: any, b: any) => String(a.dueDate).localeCompare(String(b.dueDate)));
  const payment = payments[0];
  if (!payment) {
    await setReward(sb, reward.id, { last_error: "Nenhuma cobrança pendente nos próximos dias; tentaremos de novo." });
    return { id: reward.id, skipped: "no_pending_payment" };
  }

  const already = applications.find((a) => a.payment_id === payment.id);
  if (already?.state === "done") return { id: reward.id, skipped: "payment_already_used" };
  if (already?.state === "pending" && String(payment.description ?? "").includes(marker)) {
    // PUT já aplicado em execução anterior; só finaliza o registro.
    already.state = "done";
    const applied = Number(reward.applied_cents || 0) + Number(already.amount_cents || 0);
    if (!dryRun) {
      await setReward(sb, reward.id, {
        applications, applied_cents: applied, last_error: null,
        status: applied >= rewardCents ? "applied" : "partially_applied",
        applied_at: applied >= rewardCents ? new Date().toISOString() : null,
      });
    }
    return { id: reward.id, finalized: payment.id };
  }

  const valueCents = toCents(payment.value);
  const { data: batch } = await sb
    .from("billing_invoice_collection_batches")
    .select("id")
    .eq("gateway_charge_id", payment.id)
    .in("status", ["pending", "open"])
    .maybeSingle();

  let mode: "received" | "reduced";
  let amount: number;
  let newValue = valueCents;
  if (remaining >= valueCents && !batch) {
    mode = "received";
    amount = valueCents;
  } else {
    mode = "reduced";
    newValue = Math.max(MIN_PAYMENT_CENTS, valueCents - remaining);
    amount = valueCents - newValue;
    if (amount <= 0) {
      await setReward(sb, reward.id, { last_error: "Cobrança já está no valor mínimo do Asaas; o crédito vai para a próxima." });
      return { id: reward.id, skipped: "payment_at_minimum" };
    }
  }

  if (dryRun) return { id: reward.id, dry_run: true, payment_id: payment.id, mode, amount_cents: amount, new_value_cents: newValue };

  const entry = { payment_id: payment.id, due_date: payment.dueDate, mode, amount_cents: amount, original_cents: valueCents, state: "pending", at: new Date().toISOString() };
  applications.push(entry);
  await setReward(sb, reward.id, { applications });

  try {
    if (mode === "received") {
      await asaas(apiKey, `/payments/${encodeURIComponent(payment.id)}/receiveInCash`, {
        method: "POST",
        body: JSON.stringify({
          paymentDate: today.toISOString().slice(0, 10),
          value: toValue(valueCents),
          notifyCustomer: false,
        }),
      });
    } else {
      const desc = `${String(payment.description ?? "Assinatura mensal AllinPass").trim()}\nCrédito por indicação: -R$ ${toValue(amount).toFixed(2)} ${marker}`;
      await asaas(apiKey, `/payments/${encodeURIComponent(payment.id)}`, {
        method: "PUT",
        body: JSON.stringify({ value: toValue(newValue), description: desc.slice(0, 500) }),
      });
    }
  } catch (e) {
    applications.pop();
    await setReward(sb, reward.id, { applications, last_error: String(e).slice(0, 300) });
    return { id: reward.id, error: String(e).slice(0, 300) };
  }

  entry.state = "done";
  const applied = Number(reward.applied_cents || 0) + amount;
  await setReward(sb, reward.id, {
    applications, applied_cents: applied, last_error: null,
    status: applied >= rewardCents ? "applied" : "partially_applied",
    applied_at: applied >= rewardCents ? new Date().toISOString() : null,
  });
  return { id: reward.id, payment_id: payment.id, mode, amount_cents: amount };
}

Deno.serve(async (req) => {
  try {
    const url = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const apiKey = Deno.env.get("ASAAS_API_KEY") ?? "";
    const sb = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    await assertAuth(req, serviceKey, sb);
    if (!apiKey) return json({ ok: false, error: "ASAAS_API_KEY ausente" }, 500);

    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    const dryRun = body.dry_run === true;

    const { data: rewards, error } = await sb
      .from("customer_referral_rewards")
      .select("*")
      .in("status", ["pending", "partially_applied"])
      .order("created_at", { ascending: true })
      .limit(25);
    if (error) throw error;

    const results = [];
    for (const reward of rewards ?? []) {
      try {
        results.push(await processReward(sb, apiKey, reward, dryRun));
      } catch (e) {
        await setReward(sb, reward.id, { last_error: String(e).slice(0, 300) });
        results.push({ id: reward.id, error: String(e).slice(0, 300) });
      }
    }
    return json({ ok: true, dry_run: dryRun, picked: rewards?.length ?? 0, results });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[referral-rewards-runner]", String(e));
    return json({ ok: false, error: "internal_error" }, 500);
  }
});
