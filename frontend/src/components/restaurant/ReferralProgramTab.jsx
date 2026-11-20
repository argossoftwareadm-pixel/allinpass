import React, { useEffect, useState } from 'react';
import { Copy, Gift, Loader2, MessageCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/use-toast';
import { supabase } from '@/lib/supabaseClient';

const STATUS = {
  pending: { label: 'Aguardando sua próxima fatura', cls: 'bg-amber-100 text-amber-800' },
  partially_applied: { label: 'Parte já descontada', cls: 'bg-sky-100 text-sky-800' },
  applied: { label: 'Descontado', cls: 'bg-emerald-100 text-emerald-800' },
  canceled: { label: 'Cancelado', cls: 'bg-slate-100 text-slate-600' },
};

const money = (cents) => (Number(cents || 0) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const ReferralProgramTab = ({ projectId }) => {
  const { toast } = useToast();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!projectId) return;
    let active = true;
    setLoading(true);
    supabase.rpc('fn_my_referral_program', { p_project_id: projectId }).then(({ data: result, error }) => {
      if (!active) return;
      setLoading(false);
      if (error) {
        toast({ title: 'Não foi possível carregar sua indicação', description: error.message, variant: 'destructive' });
        return;
      }
      setData(result);
    });
    return () => {
      active = false;
    };
  }, [projectId, toast]);

  const copy = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      toast({ title: 'Copiado!' });
    } catch {
      toast({ title: 'Copie manualmente', description: text });
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!data) return null;
  const rewards = Array.isArray(data.rewards) ? data.rewards : [];
  const shareText = `Uso o AllinPass para o cartão fidelidade digital do meu negócio. Assinando por este link você ganha 10% de desconto no primeiro mês: ${data.link}`;
  const totalEarned = rewards.reduce((sum, r) => sum + Number(r.reward_cents || 0), 0);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="flex items-center gap-2 text-2xl font-bold">
          <Gift className="h-6 w-6 text-purple-600" /> Indique e ganhe
        </h2>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Quando um negócio assinar o AllinPass pelo seu link, você ganha uma mensalidade grátis. Se o plano dele for menor que o seu, você ganha
          um desconto no valor do plano dele. O crédito entra automaticamente na sua próxima fatura. E quem assina pelo seu link ganha 10% de
          desconto no primeiro mês.
        </p>
      </div>

      <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
        <p className="text-sm font-medium">Seu link de indicação</p>
        <div className="mt-2 flex gap-2">
          <Input readOnly value={data.link} onFocus={(e) => e.target.select()} />
          <Button variant="outline" onClick={() => copy(data.link)}>
            <Copy className="mr-2 h-4 w-4" /> Copiar
          </Button>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Seu código: <strong>{data.code}</strong>
        </p>
        <Button asChild className="mt-4 bg-emerald-600 hover:bg-emerald-700">
          <a href={`https://wa.me/?text=${encodeURIComponent(shareText)}`} target="_blank" rel="noreferrer">
            <MessageCircle className="mr-2 h-4 w-4" /> Enviar pelo WhatsApp
          </a>
        </Button>
      </div>

      <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="font-semibold">Suas indicações</p>
          {rewards.length ? <p className="text-sm text-muted-foreground">Total em créditos: {money(totalEarned)}</p> : null}
        </div>
        {rewards.length ? (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-muted text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-4 py-2">Negócio indicado</th>
                  <th className="px-4 py-2">Assinou em</th>
                  <th className="px-4 py-2">Crédito</th>
                  <th className="px-4 py-2">Situação</th>
                </tr>
              </thead>
              <tbody>
                {rewards.map((r) => {
                  const st = STATUS[r.status] || STATUS.pending;
                  return (
                    <tr key={r.id} className="border-b border-border">
                      <td className="px-4 py-2">{r.referred_name || '—'}</td>
                      <td className="px-4 py-2">{r.created_at ? new Date(r.created_at).toLocaleDateString('pt-BR') : '—'}</td>
                      <td className="px-4 py-2">{money(r.reward_cents)}</td>
                      <td className="px-4 py-2">
                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${st.cls}`}>{st.label}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="mt-3 text-sm text-muted-foreground">
            Nenhuma indicação ainda. Compartilhe seu link com outros negócios que podem usar um cartão fidelidade.
          </p>
        )}
      </div>
    </div>
  );
};

export default ReferralProgramTab;
