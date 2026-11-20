import React from 'react';

export const money = (cents) => (Number(cents || 0) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
export const pct = (v) => (v === null || v === undefined ? '—' : `${Number(v).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`);
export const num = (v) => (v === null || v === undefined ? '—' : Number(v).toLocaleString('pt-BR', { maximumFractionDigits: 1 }));
const dateBR = (v) => (v ? new Date(v).toLocaleDateString('pt-BR') : '—');

export function StatGrid({ items }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {items.map((item) => (
        <div key={item.label} className="rounded-2xl border border-border bg-card p-5 text-card-foreground shadow-sm">
          <p className="text-sm text-muted-foreground">{item.label}</p>
          <p className="mt-1 text-2xl font-bold">{item.value}</p>
          {item.helper ? <p className="mt-1 text-xs text-muted-foreground">{item.helper}</p> : null}
        </div>
      ))}
    </div>
  );
}

export function Panel({ title, subtitle, children, actions }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-6 text-card-foreground shadow-sm">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="font-semibold">{title}</h3>
          {subtitle ? <p className="text-xs text-muted-foreground">{subtitle}</p> : null}
        </div>
        {actions}
      </div>
      {children}
    </div>
  );
}

export function SimpleTable({ columns, rows, empty }) {
  if (!rows?.length) return <p className="text-sm text-muted-foreground">{empty}</p>;
  return (
    <div className="max-h-96 overflow-auto">
      <table className="w-full text-left text-sm">
        <thead className="sticky top-0 bg-muted text-xs uppercase text-muted-foreground">
          <tr>
            {columns.map((c) => (
              <th key={c.key} className="px-3 py-2">{c.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={row.id || row.user_pass_id || i} className="border-b border-border">
              {columns.map((c) => (
                <td key={c.key} className="px-3 py-2">{c.render ? c.render(row) : row[c.key] ?? '—'}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function downloadCsv(filename, columns, rows) {
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines = [columns.map((c) => esc(c.label)).join(';')].concat(
    rows.map((r) => columns.map((c) => esc(c.csv ? c.csv(r) : r[c.key])).join(';')),
  );
  const blob = new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function AtRiskPanel({ data }) {
  const rows = data?.at_risk || [];
  const columns = [
    { key: 'name', label: 'Cliente', render: (r) => r.name || '—' },
    { key: 'email', label: 'E-mail' },
    { key: 'n', label: 'Visitas' },
    { key: 'avg_gap_days', label: 'Costuma voltar a cada', render: (r) => `${num(r.avg_gap_days)} dias`, csv: (r) => r.avg_gap_days },
    { key: 'last_at', label: 'Última visita', render: (r) => dateBR(r.last_at), csv: (r) => dateBR(r.last_at) },
    { key: 'days_since', label: 'Sumido há', render: (r) => `${r.days_since} dias`, csv: (r) => r.days_since },
  ];
  return (
    <Panel
      title={`Clientes em risco (${rows.length})`}
      subtitle="Clientes com 3 ou mais visitas que estão sem aparecer há mais que o dobro do intervalo normal deles. Ótimo público para uma notificação de “sentimos sua falta”."
      actions={rows.length ? (
        <button type="button" className="text-xs font-medium text-primary underline" onClick={() => downloadCsv('clientes-em-risco.csv', columns, rows)}>
          Baixar lista
        </button>
      ) : null}
    >
      <SimpleTable columns={columns} rows={rows} empty="Nenhum cliente em risco agora." />
    </Panel>
  );
}

export function NearRewardPanel({ data }) {
  const rows = data?.near || [];
  const columns = [
    { key: 'name', label: 'Cliente', render: (r) => r.name || '—' },
    { key: 'email', label: 'E-mail' },
    { key: 'points', label: 'Pontos' },
    { key: 'missing', label: 'Faltam', render: (r) => `${r.missing} ponto${r.missing > 1 ? 's' : ''}`, csv: (r) => r.missing },
    { key: 'reward_name', label: 'Próxima recompensa' },
  ];
  return (
    <Panel
      title={`Clientes perto da recompensa (${rows.length})`}
      subtitle="Faltam 1 ou 2 pontos para a primeira recompensa. Um lembrete agora costuma trazer o cliente de volta."
      actions={rows.length ? (
        <button type="button" className="text-xs font-medium text-primary underline" onClick={() => downloadCsv('clientes-perto-da-recompensa.csv', columns, rows)}>
          Baixar lista
        </button>
      ) : null}
    >
      <SimpleTable columns={columns} rows={rows} empty="Nenhum cliente a 1 ou 2 pontos da recompensa agora." />
    </Panel>
  );
}

const AUTOMATION_LABELS = {
  expiring_soon: 'Cartão perto de vencer',
  days_without_visit: 'Dias sem visita',
  birthday: 'Aniversário',
};

export function CampaignsPanel({ data }) {
  const campaigns = data?.campaigns || [];
  const automations = data?.automations || [];
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Panel title="Resultado por campanha" subtitle="Envios no período e clientes que visitaram em até 7 dias depois.">
        <SimpleTable
          columns={[
            { key: 'title', label: 'Campanha' },
            { key: 'sent_at', label: 'Enviada em', render: (r) => dateBR(r.sent_at) },
            { key: 'sent', label: 'Envios' },
            { key: 'rate', label: 'Retorno', render: (r) => `${pct(r.rate)} (${r.returned})` },
          ]}
          rows={campaigns}
          empty="Nenhuma campanha enviada no período."
        />
      </Panel>
      <Panel title="Resultado por automação" subtitle="Disparos automáticos no período e retorno em até 7 dias.">
        <SimpleTable
          columns={[
            { key: 'type', label: 'Automação', render: (r) => AUTOMATION_LABELS[r.type] || r.type },
            { key: 'title', label: 'Mensagem' },
            { key: 'sent', label: 'Disparos' },
            { key: 'rate', label: 'Retorno', render: (r) => `${pct(r.rate)} (${r.returned})` },
          ]}
          rows={automations}
          empty="Nenhuma automação disparada no período."
        />
      </Panel>
    </div>
  );
}

const DOW = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

export function bestTimeData(engagement) {
  const byDow = DOW.map((name, dow) => {
    const row = (engagement?.by_weekday || []).find((r) => r.dow === dow);
    return { name: name.slice(0, 3), 'Retorno (%)': row ? Number(row.rate) : 0, envios: row?.sent || 0 };
  });
  const byHour = Array.from({ length: 24 }, (_, hour) => {
    const row = (engagement?.by_hour || []).find((r) => r.hour === hour);
    return { name: `${String(hour).padStart(2, '0')}h`, 'Retorno (%)': row ? Number(row.rate) : 0, envios: row?.sent || 0 };
  });
  const pick = (rows, label) => {
    const valid = rows.filter((r) => r.envios >= 5);
    if (!valid.length) return null;
    const best = valid.reduce((a, b) => (b['Retorno (%)'] > a['Retorno (%)'] ? b : a));
    return best['Retorno (%)'] > 0 ? `${label(best)} (${pct(best['Retorno (%)'])} de retorno em 48h)` : null;
  };
  return {
    byDow,
    byHour,
    bestDow: pick(byDow, (r) => DOW[byDow.indexOf(r)]),
    bestHour: pick(byHour, (r) => r.name),
  };
}
