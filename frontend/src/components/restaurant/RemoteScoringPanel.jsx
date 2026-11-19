import React, { useCallback, useEffect, useState } from 'react';
import { Gift, History, Loader2, Search, Wallet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from '@/components/ui/use-toast';
import { supabase } from '@/lib/supabaseClient';
import { getFunctionErrorMessage, readFunctionErrorPayload } from '@/lib/functionErrors';

const money = (cents) => (Number(cents || 0) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const dateTime = (v) => (v ? new Date(v).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—');

function parseCurrencyToCents(value) {
  const normalized = String(value || '').trim().replace(/\s/g, '').replace(/^R\$/i, '').replace(/\./g, '').replace(',', '.');
  const amount = Number(normalized);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  return Math.round(amount * 100);
}

const RPC_ERRORS = {
  daily_limit: 'Este cliente já recebeu uma visita a distância hoje. O limite é 1 por dia.',
  pass_not_found: 'Cartão não encontrado neste estabelecimento.',
  invalid_amount: 'Informe um valor válido.',
  not_allowed: 'Você não tem permissão para pontuar neste estabelecimento.',
};

const RemoteScoringPanel = ({ projectId }) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [selected, setSelected] = useState(null);
  const [reason, setReason] = useState('');
  const [amountInput, setAmountInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [pendingConfirm, setPendingConfirm] = useState(null);
  const [history, setHistory] = useState([]);

  const loadHistory = useCallback(async () => {
    if (!projectId) return;
    const { data } = await supabase.rpc('fn_remote_scoring_history', { p_project_id: projectId });
    setHistory(Array.isArray(data) ? data : []);
  }, [projectId]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  const search = async (e) => {
    e?.preventDefault();
    if (query.trim().length < 2) return;
    setSearching(true);
    const { data, error } = await supabase.rpc('fn_remote_scoring_search', { p_project_id: projectId, p_query: query.trim() });
    setSearching(false);
    if (error) {
      toast({ title: 'Erro na busca', description: error.message, variant: 'destructive' });
      return;
    }
    setResults(Array.isArray(data) ? data : []);
    setSearched(true);
    setSelected(null);
    setPendingConfirm(null);
  };

  const callScanner = async ({ passToken, amountCents, confirm, challenge }) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) throw new Error('Sessão expirada. Faça login novamente.');
    const { data, error, response } = await supabase.functions.invoke('scanner-visit', {
      body: {
        projectId,
        qrData: passToken,
        confirm: !!confirm,
        challenge: challenge || null,
        ...(amountCents ? { amount_cents: amountCents } : {}),
      },
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    if (error) {
      const payload = await readFunctionErrorPayload(error, response);
      throw new Error(getFunctionErrorMessage(payload, 'Não foi possível registrar.'));
    }
    if (data?.error) throw new Error(data.message || data.error);
    return data;
  };

  const submit = async ({ confirm = false } = {}) => {
    if (!selected) return;
    const isValue = selected.pass_type === 'value';
    const amountCents = isValue ? parseCurrencyToCents(amountInput) : null;
    if (isValue && !amountCents) {
      toast({ title: 'Informe o valor', description: 'Digite o valor da compra a creditar.', variant: 'destructive' });
      return;
    }

    setBusy(true);
    let logId = pendingConfirm?.logId || null;
    try {
      if (!logId) {
        const { data, error } = await supabase.rpc('fn_remote_scoring_authorize', {
          p_project_id: projectId,
          p_user_pass_id: selected.user_pass_id,
          p_mode: isValue ? 'value' : 'loyalty',
          p_amount_cents: amountCents,
          p_reason: reason,
        });
        if (error) {
          const key = Object.keys(RPC_ERRORS).find((k) => error.message?.includes(k));
          throw new Error(key ? RPC_ERRORS[key] : error.message);
        }
        logId = data;
      }

      const result = await callScanner({
        passToken: selected.pass_token,
        amountCents,
        confirm,
        challenge: confirm ? pendingConfirm?.challenge : null,
      });

      if (result.requires_confirmation) {
        setPendingConfirm({ logId, challenge: result.challenge, seconds: result.seconds_since_last_scan });
        return;
      }

      await supabase.rpc('fn_remote_scoring_finish', { p_log_id: logId, p_ok: true, p_detail: null });
      setPendingConfirm(null);
      toast({
        title: isValue ? 'Valor creditado' : 'Visita registrada',
        description: isValue
          ? `${money(result.amount_cents ?? amountCents)} creditados para ${selected.name || selected.email}.`
          : `Ponto lançado para ${selected.name || selected.email}. O cartão no celular atualiza em instantes.`,
      });
      setSelected(null);
      setResults([]);
      setQuery('');
      setReason('');
      setAmountInput('');
      loadHistory();
    } catch (err) {
      if (logId && !pendingConfirm) await supabase.rpc('fn_remote_scoring_finish', { p_log_id: logId, p_ok: false, p_detail: String(err?.message || err) });
      toast({ title: 'Não foi possível lançar', description: err?.message || String(err), variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  const cancelConfirm = async () => {
    if (pendingConfirm?.logId) await supabase.rpc('fn_remote_scoring_finish', { p_log_id: pendingConfirm.logId, p_ok: false, p_detail: 'cancelado' });
    setPendingConfirm(null);
  };

  return (
    <div className="rounded-2xl border border-border bg-card p-6 text-card-foreground shadow-lg shadow-slate-950/5 dark:shadow-black/20">
      <h2 className="text-xl font-bold">Pontuar sem scanner</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Quando não der para ler o QR Code (celular sem bateria, compra por telefone ou entrega), busque o cliente e lance a visita ou o valor.
        Fica registrado quem lançou. Limite: 1 visita a distância por cliente por dia.
      </p>

      <form onSubmit={search} className="mt-4 flex gap-2">
        <Input placeholder="Nome ou e-mail do cliente" value={query} onChange={(e) => { setQuery(e.target.value); setSearched(false); }} />
        <Button type="submit" variant="outline" disabled={searching || query.trim().length < 2}>
          {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
        </Button>
      </form>

      {results.length > 0 && !selected ? (
        <div className="mt-3 divide-y divide-border rounded-xl border border-border">
          {results.map((r) => (
            <button
              key={r.user_pass_id}
              type="button"
              onClick={() => setSelected(r)}
              className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-sm hover:bg-accent/60"
            >
              <span>
                <span className="font-medium">{r.name || 'Sem nome'}</span>
                <span className="block text-xs text-muted-foreground">{r.email}</span>
              </span>
              <span className="text-right text-xs text-muted-foreground">
                {r.pass_type === 'value' ? `Saldo ${money(r.balance_cents)}` : `${r.points} ponto${r.points === 1 ? '' : 's'}`}
                <span className="block">{r.install_status === 'installed' ? 'Cartão na carteira' : 'Cartão não instalado'}</span>
              </span>
            </button>
          ))}
        </div>
      ) : null}

      {searched && !searching && results.length === 0 && !selected ? (
        <p className="mt-3 text-sm text-muted-foreground">Nenhum cliente com cartão encontrado para essa busca.</p>
      ) : null}

      {selected ? (
        <div className="mt-4 space-y-3 rounded-xl border border-purple-200 bg-purple-50/60 p-4 dark:border-purple-900/50 dark:bg-purple-950/20">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="font-semibold">{selected.name || 'Sem nome'}</p>
              <p className="text-xs text-muted-foreground">{selected.email}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Última visita: {dateTime(selected.last_visit_at)}
                {selected.remote_today > 0 ? ' · já pontuado a distância hoje' : ''}
              </p>
            </div>
            <Button variant="ghost" size="sm" onClick={() => { setSelected(null); setPendingConfirm(null); }}>
              Trocar
            </Button>
          </div>

          {selected.pass_type === 'value' ? (
            <Input inputMode="decimal" placeholder="Valor a creditar (ex.: 25,90)" value={amountInput} onChange={(e) => setAmountInput(e.target.value)} />
          ) : null}
          <Input placeholder="Motivo (ex.: celular sem bateria, pedido por telefone)" value={reason} onChange={(e) => setReason(e.target.value)} />

          {pendingConfirm ? (
            <div className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
              Este cartão foi pontuado há {pendingConfirm.seconds ?? 'poucos'} segundos. Lançar de novo mesmo assim?
              <div className="mt-2 flex gap-2">
                <Button size="sm" onClick={() => submit({ confirm: true })} disabled={busy}>
                  {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null} Sim, lançar
                </Button>
                <Button size="sm" variant="outline" onClick={cancelConfirm} disabled={busy}>Cancelar</Button>
              </div>
            </div>
          ) : (
            <Button onClick={() => submit()} disabled={busy || (selected.pass_type !== 'value' && selected.remote_today > 0)}>
              {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : selected.pass_type === 'value' ? <Wallet className="mr-2 h-4 w-4" /> : <Gift className="mr-2 h-4 w-4" />}
              {selected.pass_type === 'value' ? 'Creditar valor' : 'Registrar visita'}
            </Button>
          )}
        </div>
      ) : null}

      {history.length ? (
        <div className="mt-6">
          <p className="mb-2 flex items-center gap-2 text-sm font-semibold">
            <History className="h-4 w-4" /> Lançamentos sem scanner
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-muted uppercase text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">Data</th>
                  <th className="px-3 py-2">Cliente</th>
                  <th className="px-3 py-2">Lançamento</th>
                  <th className="px-3 py-2">Motivo</th>
                  <th className="px-3 py-2">Quem lançou</th>
                </tr>
              </thead>
              <tbody>
                {history.map((h, i) => (
                  <tr key={`${h.created_at}-${i}`} className="border-b border-border">
                    <td className="px-3 py-2 whitespace-nowrap">{dateTime(h.created_at)}</td>
                    <td className="px-3 py-2">{h.customer_name || h.customer_email || '—'}</td>
                    <td className="px-3 py-2">{h.mode === 'value' ? money(h.amount_cents) : '1 visita'}</td>
                    <td className="px-3 py-2">{h.reason || '—'}</td>
                    <td className="px-3 py-2">{h.actor_email || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default RemoteScoringPanel;
