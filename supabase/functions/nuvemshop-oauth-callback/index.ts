// supabase/functions/nuvemshop-oauth-callback/index.ts
// Recebe a autorização da loja Nuvemshop (OAuth), guarda o token e registra os webhooks.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const APP_ID = "53173";
const USER_AGENT = "AllinPass Fidelidade (brunacottaps@gmail.com)";
const API_BASE = "https://api.nuvemshop.com.br/v1";

// O Supabase não exibe HTML vindo de funções: redireciona para o site do AllinPass com o resultado.
function html(_title: string, _message: string, status = 200) {
  const result = status >= 400 ? "erro" : (_message.includes("Nossa equipe") ? "pendente" : "conectado");
  return new Response(null, {
    status: 302,
    headers: { Location: `https://allinpass.com.br/?nuvemshop=${result}`, "Cache-Control": "no-store" },
  });
}

async function nsFetch(path: string, token: string, init: RequestInit = {}) {
  return await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      "Authentication": `bearer ${token}`,
      "User-Agent": USER_AGENT,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
}

Deno.serve(async (req) => {
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
  const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const CLIENT_SECRET = Deno.env.get("NUVEMSHOP_CLIENT_SECRET") ?? "";

  if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !CLIENT_SECRET) {
    console.error("[nuvemshop-oauth-callback] missing env (NUVEMSHOP_CLIENT_SECRET?)");
    return html("Integração indisponível", "A integração com a Nuvemshop ainda não foi configurada. Fale com o suporte AllinPass.", 500);
  }

  const sb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    const url = new URL(req.url);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");

    if (!code) {
      return html("Link inválido", "Não recebemos a autorização da Nuvemshop. Tente instalar o app novamente.", 400);
    }

    // Projeto vinculado pelo link de instalação (state). Sem state, a loja fica pendente de vínculo.
    let projectId: string | null = null;
    if (state) {
      const { data: st } = await sb
        .from("nuvemshop_install_states")
        .select("state, project_id, created_at, used_at")
        .eq("state", state)
        .maybeSingle();
      const ageMs = st ? Date.now() - new Date(st.created_at).getTime() : Infinity;
      if (st && ageMs < 30 * 24 * 3600 * 1000) {
        projectId = st.project_id;
      }
    }

    // Troca o code pelo token
    const tokenRes = await fetch("https://www.nuvemshop.com.br/apps/authorize/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: APP_ID,
        client_secret: CLIENT_SECRET,
        grant_type: "authorization_code",
        code,
      }),
    });
    const tokenJson = await tokenRes.json().catch(() => ({}));
    const accessToken = tokenJson?.access_token;
    const storeId = Number(tokenJson?.user_id);

    if (!tokenRes.ok || !accessToken || !Number.isFinite(storeId)) {
      console.error("[nuvemshop-oauth-callback] token exchange failed", tokenRes.status, tokenJson?.error ?? tokenJson?.error_description);
      return html("Não foi possível concluir", "A Nuvemshop não confirmou a autorização (o código pode ter expirado). Tente instalar o app novamente.", 400);
    }

    // Mantém vínculo anterior se a loja reinstalar sem state
    const { data: existing } = await sb
      .from("nuvemshop_stores")
      .select("project_id")
      .eq("store_id", storeId)
      .maybeSingle();

    const finalProjectId = projectId ?? existing?.project_id ?? null;

    // Registra webhooks (evita duplicar)
    const webhookUrl = `${SUPABASE_URL}/functions/v1/nuvemshop-webhook`;
    const wanted = ["order/paid", "order/cancelled", "order/voided", "app/uninstalled"];
    const registered: Record<string, unknown> = {};
    try {
      const listRes = await nsFetch(`/${storeId}/webhooks`, accessToken);
      const list = listRes.ok ? await listRes.json() : [];
      for (const event of wanted) {
        const found = Array.isArray(list) ? list.find((w: any) => w?.event === event && w?.url === webhookUrl) : null;
        if (found) {
          registered[event] = found.id;
          continue;
        }
        const r = await nsFetch(`/${storeId}/webhooks`, accessToken, {
          method: "POST",
          body: JSON.stringify({ event, url: webhookUrl }),
        });
        const j = await r.json().catch(() => ({}));
        registered[event] = r.ok ? j?.id ?? true : { error: r.status, detail: j?.description ?? j?.message ?? null };
      }
    } catch (e) {
      console.error("[nuvemshop-oauth-callback] webhook registration failed", String(e));
    }

    const { error: upErr } = await sb.from("nuvemshop_stores").upsert({
      store_id: storeId,
      project_id: finalProjectId,
      access_token: accessToken,
      scope: tokenJson?.scope ?? null,
      status: "active",
      webhooks: registered,
      uninstalled_at: null,
      updated_at: new Date().toISOString(),
    }, { onConflict: "store_id" });

    if (upErr) {
      console.error("[nuvemshop-oauth-callback] store upsert failed", upErr.message);
      return html("Não foi possível concluir", "Tivemos um problema ao salvar a conexão. Tente novamente em alguns minutos.", 500);
    }

    if (state && projectId) {
      await sb.from("nuvemshop_install_states")
        .update({ used_at: new Date().toISOString(), store_id: storeId })
        .eq("state", state);
    }

    if (!finalProjectId) {
      return html(
        "Loja conectada!",
        "Sua loja Nuvemshop foi conectada ao AllinPass. Nossa equipe vai concluir o vínculo com o seu programa de fidelidade e avisar você.",
      );
    }

    return html(
      "Loja conectada!",
      "Pronto! A partir de agora, cada pedido pago na sua loja Nuvemshop soma 1 ponto no cartão de fidelidade do cliente, automaticamente.",
    );
  } catch (e) {
    console.error("[nuvemshop-oauth-callback] unhandled", String(e));
    return html("Não foi possível concluir", "Ocorreu um erro inesperado. Tente novamente em alguns minutos.", 500);
  }
});
