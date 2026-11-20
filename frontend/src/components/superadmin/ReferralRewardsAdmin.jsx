import React, { useEffect, useState } from 'react';
import { Gift, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/supabaseClient';

const STATUS = {
  pending: 'Aguardando fatura',
  partially_applied: 'Parcialmente descontado',
  applied: 'Descontado',
  canceled: 'Cancelado',
};

const money = (cents) => (Number(cents || 0) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const ReferralRewardsAdmin = () => {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc('fn_superadmin_referral_rewards');
    setLoading(false);
    setRows(error ? [] : Array.isArray(data) ? data : []);
  };

  useEffect(() => {
    load();
  }, []);

  return (
    <div className="mt-8 rounded-2xl border border-border bg-card p-6 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="flex items-center gap-2 text-lg font-bold">
            <Gift className="h-5 w-5 text-purple-600" /> Indicações entre clientes
          </h3>
          <p className="text-sm text-muted-foreground">
            Todo estabelecimento tem um link próprio. Quando o indicado vira assinante pago, o indicador ganha crédito na próxima fatura
            (mensalidade grátis, ou o valor do plano indicado se for menor). Quem é indicado ganha 10% no primeiro mês.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Atualizar
        </Button>
      </div>
      {rows.length ? (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-muted text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Data</th>
                <th className="px-3 py-2">Quem indicou</th>
                <th className="px-3 py-2">Indicado</th>
                <th className="px-3 py-2">Crédito</th>
                <th className="px-3 py-2">Descontado</th>
                <th className="px-3 py-2">Situação</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-border align-top">
                  <td className="px-3 py-2 whitespace-nowrap">{new Date(r.created_at).toLocaleDateString('pt-BR')}</td>
                  <td className="px-3 py-2">{r.referrer || '—'} <span className="text-xs text-muted-foreground">({r.code})</span></td>
                  <td className="px-3 py-2">{r.referred || '—'}</td>
                  <td className="px-3 py-2">{money(r.reward_cents)}</td>
                  <td className="px-3 py-2">{money(r.applied_cents)}</td>
                  <td className="px-3 py-2">
                    {STATUS[r.status] || r.status}
                    {r.last_error && r.status !== 'applied' ? <p className="text-xs text-amber-700">{r.last_error}</p> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="mt-4 text-sm text-muted-foreground">Nenhuma indicação convertida ainda.</p>
      )}
    </div>
  );
};

export default ReferralRewardsAdmin;
