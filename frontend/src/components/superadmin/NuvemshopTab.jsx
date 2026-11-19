import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Copy,
  Link as LinkIcon,
  Loader2,
  RefreshCw,
  Save,
  Search,
  ShoppingBag,
  Store,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import { supabase } from '@/lib/supabaseClient';

const STATUS_LABELS = {
  credited: 'Creditado',
  processing: 'Processando',
  ignored_not_enabled: 'Ignorado: módulo desligado',
  ignored_no_pass: 'Ignorado: cliente sem cartão',
  ignored_no_email: 'Ignorado: pedido sem e-mail',
  ignored_not_paid: 'Ignorado: pedido não pago',
  ignored_billing_inactive: 'Ignorado: assinatura inativa',
  ignored_mode_mismatch: 'Ignorado: tipo de cartão diferente do modo',
  ignored_zero_value: 'Ignorado: cashback zero',
  ignored_store_not_connected: 'Ignorado: loja desconectada',
  ignored_store_without_project: 'Ignorado: loja sem vínculo',
  error: 'Erro',
};

const formatDateTime = (value) => {
  if (!value) return '—';
  try {
    return new Date(value).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
  } catch {
    return String(value);
  }
};

const formatCents = (cents) =>
  (Number(cents || 0) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const statusLabel = (status) => STATUS_LABELS[status] || (status?.startsWith('ignored') ? `Ignorado (${status.replace('ignored_', '')})` : status || '—');

const modeMismatch = (mode, passTypes = []) => {
  if (!passTypes.length) return null;
  const hasValue = passTypes.includes('value');
  const hasLoyalty = passTypes.some((t) => t !== 'value');
  if (mode === 'cashback' && !hasValue) return 'Este estabelecimento não tem cartão de valor/cashback. As compras serão ignoradas neste modo.';
  if (mode === 'points' && !hasLoyalty) return 'Este estabelecimento não tem cartão de fidelidade por pontos. As compras serão ignoradas neste modo.';
  return null;
};

const ProjectRow = ({ project, onSaved }) => {
  const { toast } = useToast();
  const [enabled, setEnabled] = useState(Boolean(project.enabled));
  const [mode, setMode] = useState(project.credit_mode || 'points');
  const [percent, setPercent] = useState(String((Number(project.cashback_bps ?? 500) / 100).toString().replace('.', ',')));
  const [revert, setRevert] = useState(Boolean(project.revert_on_cancel));
  const [saving, setSaving] = useState(false);
  const [linkLoading, setLinkLoading] = useState(false);
  const [installLink, setInstallLink] = useState('');

  useEffect(() => {
    setEnabled(Boolean(project.enabled));
    setMode(project.credit_mode || 'points');
    setPercent(String((Number(project.cashback_bps ?? 500) / 100).toString().replace('.', ',')));
    setRevert(Boolean(project.revert_on_cancel));
  }, [project.enabled, project.credit_mode, project.cashback_bps, project.revert_on_cancel]);

  const bps = Math.round(Number(String(percent).replace(',', '.')) * 100);
  const dirty =
    enabled !== Boolean(project.enabled) ||
    mode !== (project.credit_mode || 'points') ||
    revert !== Boolean(project.revert_on_cancel) ||
    (mode === 'cashback' && bps !== Number(project.cashback_bps ?? 500));

  const warning = modeMismatch(mode, project.pass_types || []);
  const stores = project.stores || [];

  const save = async () => {
    if (mode === 'cashback' && (!Number.isFinite(bps) || bps < 1 || bps > 10000)) {
      toast({ title: 'Percentual inválido', description: 'Informe um cashback entre 0,01% e 100%.', variant: 'destructive' });
      return;
    }
    setSaving(true);
    const { error } = await supabase.rpc('fn_superadmin_nuvemshop_save_settings', {
      p_project_id: project.id,
      p_enabled: enabled,
      p_credit_mode: mode,
      p_cashback_bps: mode === 'cashback' ? bps : Number(project.cashback_bps ?? 500),
      p_revert_on_cancel: revert,
    });
    setSaving(false);
    if (error) {
      toast({ title: 'Não foi possível salvar', description: error.message, variant: 'destructive' });
      return;
    }
    toast({ title: 'Configuração salva', description: project.name });
    onSaved?.();
  };

  const generateLink = async () => {
    setLinkLoading(true);
    const { data, error } = await supabase.rpc('fn_nuvemshop_install_link', { p_project_id: project.id });
    setLinkLoading(false);
    if (error) {
      toast({
        title: 'Não foi possível gerar o link',
        description: /nuvemshop_not_enabled/i.test(error.message) ? 'Ative e salve o módulo antes de gerar o link.' : error.message,
        variant: 'destructive',
      });
      return;
    }
    setInstallLink(data || '');
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(installLink);
      toast({ title: 'Link copiado', description: 'Envie para o lojista abrir logado na Nuvemshop.' });
    } catch {
      toast({ title: 'Copie manualmente', description: installLink });
    }
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-semibold text-slate-900">{project.name || 'Sem nome'}</p>
          <p className="text-xs text-slate-500">
            Cartões: {(project.pass_types || []).length ? project.pass_types.join(', ') : 'nenhum'} · Últimos 30 dias:{' '}
            {project.credited_30d || 0} creditados, {project.ignored_30d || 0} ignorados · Último pedido: {formatDateTime(project.last_event_at)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {stores.length ? (
            stores.map((s) => (
              <span
                key={s.store_id}
                className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
                  s.status === 'active' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'
                }`}
              >
                <Store className="h-3 w-3" /> Loja {s.store_id} · {s.status === 'active' ? 'conectada' : s.status}
              </span>
            ))
          ) : (
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">Nenhuma loja conectada</span>
          )}
        </div>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-4">
        <label className="flex items-center gap-2 text-sm">
          <Checkbox checked={enabled} onCheckedChange={(v) => setEnabled(Boolean(v))} />
          Módulo Nuvemshop ativo
        </label>

        <div className="space-y-1">
          <Label className="text-xs text-slate-500">O cartão recebe</Label>
          <Select value={mode} onValueChange={setMode}>
            <SelectTrigger className="h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="points">Fidelidade: 1 ponto por compra</SelectItem>
              <SelectItem value="cashback">Cashback: % do valor da compra</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <Label className="text-xs text-slate-500">Percentual de cashback</Label>
          <div className="flex items-center gap-1">
            <Input
              className="h-9"
              inputMode="decimal"
              value={percent}
              disabled={mode !== 'cashback'}
              onChange={(e) => setPercent(e.target.value)}
            />
            <span className="text-sm text-slate-500">%</span>
          </div>
        </div>

        <div className="space-y-1">
          <Label className="text-xs text-slate-500">Se o pedido for cancelado/devolvido</Label>
          <Select value={revert ? 'revert' : 'keep'} onValueChange={(v) => setRevert(v === 'revert')}>
            <SelectTrigger className="h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="keep">Manter pontos/valor</SelectItem>
              <SelectItem value="revert">Retirar pontos/valor</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {warning && enabled && (
        <p className="mt-3 flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {warning}
        </p>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={save} disabled={!dirty || saving}>
          {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
          Salvar
        </Button>
        <Button size="sm" variant="outline" onClick={generateLink} disabled={!project.enabled || linkLoading}>
          {linkLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <LinkIcon className="mr-2 h-4 w-4" />}
          Gerar link de conexão da loja
        </Button>
        {!project.enabled && <span className="text-xs text-slate-500">Ative e salve para gerar o link.</span>}
      </div>

      {installLink && (
        <div className="mt-3 flex items-center gap-2">
          <Input readOnly value={installLink} className="h-9 text-xs" onFocus={(e) => e.target.select()} />
          <Button size="sm" variant="outline" onClick={copyLink}>
            <Copy className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
};

const NuvemshopTab = () => {
  const { toast } = useToast();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [linkTargets, setLinkTargets] = useState({});

  const load = useCallback(async () => {
    setLoading(true);
    const { data: overview, error } = await supabase.rpc('fn_superadmin_nuvemshop_overview');
    setLoading(false);
    if (error) {
      toast({ title: 'Erro ao carregar Nuvemshop', description: error.message, variant: 'destructive' });
      return;
    }
    setData(overview || { projects: [], unlinked_stores: [], recent_events: [] });
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  const projects = data?.projects || [];
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return projects.filter((p) => {
      if (q && !(p.name || '').toLowerCase().includes(q)) return false;
      if (filter === 'enabled') return p.enabled;
      if (filter === 'connected') return (p.stores || []).some((s) => s.status === 'active');
      return true;
    });
  }, [projects, search, filter]);

  const linkStore = async (storeId) => {
    const projectId = linkTargets[storeId];
    if (!projectId) return;
    const { error } = await supabase.rpc('fn_nuvemshop_link_store', { p_store_id: storeId, p_project_id: projectId });
    if (error) {
      toast({ title: 'Não foi possível vincular', description: error.message, variant: 'destructive' });
      return;
    }
    toast({ title: 'Loja vinculada' });
    load();
  };

  const enabledCount = projects.filter((p) => p.enabled).length;
  const connectedCount = projects.filter((p) => (p.stores || []).some((s) => s.status === 'active')).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-semibold text-slate-900">
            <ShoppingBag className="h-5 w-5" /> Nuvemshop
          </h2>
          <p className="text-sm text-slate-500">
            Compras pagas na loja online creditam o cartão do cliente automaticamente (mesmo e-mail do cartão instalado).
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
          Atualizar
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border bg-white p-4">
          <p className="text-xs text-slate-500">Módulo ativo</p>
          <p className="text-2xl font-semibold">{enabledCount}</p>
        </div>
        <div className="rounded-xl border bg-white p-4">
          <p className="text-xs text-slate-500">Lojas conectadas</p>
          <p className="text-2xl font-semibold">{connectedCount}</p>
        </div>
        <div className="rounded-xl border bg-white p-4">
          <p className="text-xs text-slate-500">Lojas aguardando vínculo</p>
          <p className="text-2xl font-semibold">{(data?.unlinked_stores || []).length}</p>
        </div>
      </div>

      {(data?.unlinked_stores || []).length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
          <p className="mb-3 font-medium text-amber-900">Lojas conectadas sem estabelecimento</p>
          <div className="space-y-2">
            {data.unlinked_stores.map((s) => (
              <div key={s.store_id} className="flex flex-wrap items-center gap-2 text-sm">
                <span className="font-medium">Loja {s.store_id}</span>
                <span className="text-xs text-slate-600">instalada em {formatDateTime(s.installed_at)}</span>
                <Select
                  value={linkTargets[s.store_id] || ''}
                  onValueChange={(v) => setLinkTargets((prev) => ({ ...prev, [s.store_id]: v }))}
                >
                  <SelectTrigger className="h-8 w-64 bg-white">
                    <SelectValue placeholder="Escolha o estabelecimento" />
                  </SelectTrigger>
                  <SelectContent>
                    {projects.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name || p.id}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button size="sm" onClick={() => linkStore(s.store_id)} disabled={!linkTargets[s.store_id]}>
                  <CheckCircle2 className="mr-1 h-4 w-4" /> Vincular
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full max-w-sm">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <Input className="pl-9" placeholder="Buscar estabelecimento" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select value={filter} onValueChange={setFilter}>
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="enabled">Com módulo ativo</SelectItem>
            <SelectItem value="connected">Com loja conectada</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {loading && !data ? (
        <div className="flex justify-center py-10">
          <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.slice(0, 60).map((p) => (
            <ProjectRow key={p.id} project={p} onSaved={load} />
          ))}
          {filtered.length > 60 && (
            <p className="text-center text-xs text-slate-500">Mostrando 60 de {filtered.length}. Use a busca para encontrar outros.</p>
          )}
          {!filtered.length && <p className="py-6 text-center text-sm text-slate-500">Nenhum estabelecimento encontrado.</p>}
        </div>
      )}

      <div className="rounded-xl border bg-white">
        <p className="border-b px-4 py-3 font-medium text-slate-900">Últimos pedidos recebidos</p>
        {(data?.recent_events || []).length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs text-slate-500">
                <tr>
                  <th className="px-4 py-2">Data</th>
                  <th className="px-4 py-2">Estabelecimento</th>
                  <th className="px-4 py-2">Pedido</th>
                  <th className="px-4 py-2">Resultado</th>
                  <th className="px-4 py-2">Crédito</th>
                  <th className="px-4 py-2">Cancelamento</th>
                </tr>
              </thead>
              <tbody>
                {data.recent_events.map((e) => (
                  <tr key={`${e.store_id}-${e.order_id}`} className="border-t">
                    <td className="px-4 py-2 whitespace-nowrap">{formatDateTime(e.created_at)}</td>
                    <td className="px-4 py-2">{e.project_name || `Loja ${e.store_id}`}</td>
                    <td className="px-4 py-2">
                      #{e.order_id}
                      {e.order_total_cents ? <span className="ml-1 text-xs text-slate-500">{formatCents(e.order_total_cents)}</span> : null}
                    </td>
                    <td className="px-4 py-2">{statusLabel(e.status)}</td>
                    <td className="px-4 py-2">
                      {e.status === 'credited'
                        ? e.credit_mode === 'cashback'
                          ? `${formatCents(e.cashback_cents)} de cashback`
                          : `+${e.points_credited || 1} ponto${(e.points_credited || 1) > 1 ? 's' : ''}`
                        : '—'}
                    </td>
                    <td className="px-4 py-2 text-xs">
                      {e.reversed_at
                        ? `Estornado em ${formatDateTime(e.reversed_at)}`
                        : e.reversal_detail === 'mantido'
                          ? 'Cancelado, crédito mantido'
                          : e.reversal_detail || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="px-4 py-6 text-center text-sm text-slate-500">Nenhum pedido recebido ainda.</p>
        )}
      </div>
    </div>
  );
};

export default NuvemshopTab;
