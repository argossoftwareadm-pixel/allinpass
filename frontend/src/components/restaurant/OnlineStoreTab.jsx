import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, RefreshCw, ShoppingBag, Store } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import { supabase } from '@/lib/supabaseClient';

const money = (cents) => (Number(cents || 0) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const dateTime = (v) => (v ? new Date(v).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—');

const STATUS = {
  credited: 'Creditado',
  processing: 'Processando',
  ignored_no_pass: 'Cliente sem cartão',
  ignored_no_email: 'Pedido sem e-mail',
  ignored_not_paid: 'Pedido não pago',
  ignored_not_enabled: 'Módulo desligado',
  ignored_billing_inactive: 'Assinatura AllinPass inativa',
  ignored_mode_mismatch: 'Tipo de cartão diferente',
  ignored_zero_value: 'Cashback zerado',
  ignored_store_not_connected: 'Loja desconectada',
  ignored_store_without_project: 'Loja sem vínculo',
  error: 'Erro ao creditar',
};

const OnlineStoreTab = ({ projectId }) => {
  const { toast } = useToast();
  const [days, setDays] = useState('30');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    const { data: result, error } = await supabase.rpc('fn_project_nuvemshop_panel', { p_project_id: projectId, p_days: Number(days) });
    setLoading(false);
    if (error) {
      toast({ title: 'Não foi possível carregar a loja online', description: error.message, variant: 'destructive' });
      return;
    }
    setData(result);
  }, [projectId, days, toast]);

  useEffect(() => {
    load();
  }, [load]);

  const isCashback = data?.credit_mode === 'cashback';
  const summary = data?.summary || {};
  const orders = Array.isArray(data?.orders) ? data.orders : [];
  const connected = (data?.stores || []).some((s) => s.status === 'active');

  const cards = [
    { label: 'Pedidos creditados', value: Number(summary.orders_credited || 0).toLocaleString('pt-BR') },
    { label: 'Vendido online (creditado)', value: money(summary.sales_cents) },
    isCashback
      ? { label: 'Cashback concedido', value: money(summary.cashback_cents) }
      : { label: 'Pontos concedidos', value: Number(summary.points_credited || 0).toLocaleString('pt-BR') },
    { label: 'Pedidos não creditados', value: Number(summary.orders_ignored || 0).toLocaleString('pt-BR') },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-2xl font-bold">
            <ShoppingBag className="h-6 w-6 text-purple-600" /> Loja online
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Compras pagas na sua loja Nuvemshop creditam o cartão do cliente automaticamente, pelo mesmo e-mail do cartão.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={days} onValueChange={setDays}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">Últimos 7 dias</SelectItem>
              <SelectItem value="30">Últimos 30 dias</SelectItem>
              <SelectItem value="90">Últimos 90 dias</SelectItem>
              <SelectItem value="365">Últimos 12 meses</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Atualizar
          </Button>
        </div>
      </div>

      {loading && !data ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : data ? (
        <>
          <div className="flex flex-wrap gap-2 text-sm">
            <span className={`inline-flex items-center gap-1 rounded-full px-3 py-1 font-medium ${connected ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>
              <Store className="h-4 w-4" /> {connected ? 'Loja conectada' : 'Loja ainda não conectada'}
            </span>
            <span className="rounded-full bg-muted px-3 py-1">
              Regra: {isCashback ? `${(Number(data.cashback_bps || 0) / 100).toLocaleString('pt-BR')}% de cashback por compra` : '1 ponto por compra'}
            </span>
            <span className="rounded-full bg-muted px-3 py-1">
              Cancelamento/devolução: {data.revert_on_cancel ? 'o crédito é retirado' : 'o crédito é mantido'}
            </span>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {cards.map((c) => (
              <div key={c.label} className="rounded-2xl border border-border bg-card p-5 shadow-sm">
                <p className="text-sm text-muted-foreground">{c.label}</p>
                <p className="mt-1 text-2xl font-bold">{c.value}</p>
              </div>
            ))}
          </div>

          <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
            <p className="mb-4 font-semibold">Pedidos</p>
            {orders.length ? (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-muted text-xs uppercase text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2">Data</th>
                      <th className="px-3 py-2">Pedido</th>
                      <th className="px-3 py-2">Cliente</th>
                      <th className="px-3 py-2">Valor</th>
                      <th className="px-3 py-2">Crédito no cartão</th>
                      <th className="px-3 py-2">Situação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {orders.map((o) => {
                      const credited = o.status === 'credited';
                      const credit = !credited
                        ? '—'
                        : o.credit_mode === 'cashback'
                          ? money(o.cashback_cents)
                          : `+${o.points_credited || 1} ponto${(o.points_credited || 1) > 1 ? 's' : ''}`;
                      let situation = STATUS[o.status] || (String(o.status || '').startsWith('ignored') ? 'Não creditado' : o.status);
                      if (o.reversed_at) situation = `Estornado em ${dateTime(o.reversed_at)}`;
                      else if (o.reversal_detail === 'mantido') situation = 'Cancelado (crédito mantido)';
                      return (
                        <tr key={`${o.order_id}-${o.created_at}`} className="border-b border-border">
                          <td className="px-3 py-2 whitespace-nowrap">{dateTime(o.created_at)}</td>
                          <td className="px-3 py-2">#{o.order_id}</td>
                          <td className="px-3 py-2">{o.customer_email || '—'}</td>
                          <td className="px-3 py-2">{o.order_total_cents ? money(o.order_total_cents) : '—'}</td>
                          <td className="px-3 py-2">{credit}</td>
                          <td className="px-3 py-2">{situation}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Nenhum pedido recebido neste período.</p>
            )}
          </div>
        </>
      ) : null}
    </div>
  );
};

export default OnlineStoreTab;
