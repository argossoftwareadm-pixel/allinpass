import React, { useEffect, useMemo, useRef, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { toPng } from 'html-to-image';
import { Download, Loader2, Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { supabase } from '@/lib/supabaseClient';

const FORMATS = [
  { id: 'balcao', label: 'Display de balcão', hint: 'Imprima em 10x15 cm ou A5 e coloque no caixa.', width: 1200, height: 1800 },
  { id: 'adesivo', label: 'Adesivo / cartão de mesa', hint: 'Quadrado, para mesas, vitrine ou porta.', width: 1500, height: 1500 },
  { id: 'story', label: 'Story do Instagram', hint: 'Para divulgar o programa nas redes.', width: 1080, height: 1920 },
];

const money = (cents) => (Number(cents || 0) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

function pickLogo(design) {
  const images = design?.images || {};
  return images.appleLogo || images.googleLogo || images.logo || images.icon || '';
}

function rewardLine(reward) {
  if (reward.reward_type === 'value') return { left: `Gastou ${money(reward.value_required_cents)}`, right: reward.name };
  return { left: `${reward.points_required} ${reward.points_required === 1 ? 'ponto' : 'pontos'}`, right: reward.name };
}

function Poster({ format, pass, rewards }) {
  const bg = pass?.design?.colors?.background || '#7046EA';
  const fg = pass?.design?.colors?.text || '#ffffff';
  const logo = pickLogo(pass?.design);
  const url = pass?.qr_url || '';
  const isSquare = format.id === 'adesivo';
  const scale = format.width / 1200;
  const s = (v) => Math.round(v * scale);
  const list = rewards.slice(0, isSquare ? 2 : 3);

  return (
    <div
      style={{
        width: format.width,
        height: format.height,
        background: bg,
        color: fg,
        fontFamily: 'Inter, system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: s(isSquare ? 80 : 100),
        boxSizing: 'border-box',
        textAlign: 'center',
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: s(24) }}>
        {logo ? (
          <img src={logo} alt="" crossOrigin="anonymous" style={{ maxHeight: s(isSquare ? 170 : 240), maxWidth: s(760), objectFit: 'contain' }} />
        ) : (
          <div style={{ fontSize: s(64), fontWeight: 800 }}>{pass?.title}</div>
        )}
        <div style={{ fontSize: s(isSquare ? 64 : 78), fontWeight: 800, lineHeight: 1.1 }}>Cartão fidelidade</div>
        {!isSquare ? <div style={{ fontSize: s(38), opacity: 0.9 }}>Junte pontos a cada visita e ganhe recompensas</div> : null}
      </div>

      {list.length && !isSquare ? (
        <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: s(16) }}>
          {list.map((r) => {
            const line = rewardLine(r);
            return (
              <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: s(20), border: `${s(3)}px solid ${fg}`, borderRadius: s(28), padding: `${s(22)}px ${s(32)}px`, fontSize: s(38) }}>
                <span style={{ fontWeight: 800 }}>{line.left}</span>
                <span style={{ textAlign: 'right' }}>{line.right}</span>
              </div>
            );
          })}
        </div>
      ) : null}

      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: s(24) }}>
        <div style={{ background: '#ffffff', padding: s(32), borderRadius: s(36) }}>
          <QRCodeSVG value={url || 'https://allinpass.com.br'} size={s(isSquare ? 400 : 520)} level="M" />
        </div>
        <div style={{ fontSize: s(40), fontWeight: 700 }}>Aponte a câmera e salve na sua carteira</div>
        <div style={{ fontSize: s(30), opacity: 0.85 }}>Apple ou Google · sem baixar aplicativo</div>
        {isSquare && list.length ? (
          <div style={{ fontSize: s(32), fontWeight: 700 }}>{list.map((r) => `${rewardLine(r).left}: ${r.name}`).join('  ·  ')}</div>
        ) : null}
      </div>

      <div style={{ fontSize: s(26), opacity: 0.8, marginTop: s(20) }}>
        Programa de fidelidade feito com <strong>AllinPass</strong> · allinpass.com.br
      </div>
    </div>
  );
}

export default function MaterialsTab({ projectId }) {
  const { toast } = useToast();
  const [passes, setPasses] = useState([]);
  const [rewards, setRewards] = useState([]);
  const [passId, setPassId] = useState(null);
  const [formatId, setFormatId] = useState('balcao');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(null);
  const exportRef = useRef(null);
  const previewBoxRef = useRef(null);
  const [previewWidth, setPreviewWidth] = useState(360);

  useEffect(() => {
    if (!projectId) return;
    let active = true;
    (async () => {
      setLoading(true);
      const [{ data: p }, { data: r }] = await Promise.all([
        supabase.from('passes').select('id, title, type, design, qr_url, status').eq('project_id', projectId).is('deleted_at', null).order('created_at'),
        supabase.from('rewards').select('id, name, reward_type, points_required, value_required_cents, status').eq('project_id', projectId).eq('status', 'active'),
      ]);
      if (!active) return;
      const list = (p || []).filter((x) => x.qr_url);
      setPasses(list);
      setPassId((prev) => prev || list[0]?.id || null);
      const sorted = (r || []).slice().sort((a, b) => (a.points_required || 0) - (b.points_required || 0));
      setRewards(sorted);
      setLoading(false);
    })();
    return () => { active = false; };
  }, [projectId]);

  useEffect(() => {
    const el = previewBoxRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const obs = new ResizeObserver(([entry]) => setPreviewWidth(Math.min(420, entry.contentRect.width)));
    obs.observe(el);
    return () => obs.disconnect();
  }, [loading]);

  const pass = useMemo(() => passes.find((p) => p.id === passId) || null, [passes, passId]);
  const format = FORMATS.find((f) => f.id === formatId) || FORMATS[0];
  const passRewards = useMemo(() => {
    if (!pass) return [];
    return rewards.filter((r) => (pass.type === 'value' ? r.reward_type === 'value' : r.reward_type !== 'value'));
  }, [pass, rewards]);
  const scale = previewWidth / format.width;

  const markDone = () => {
    supabase.rpc('fn_project_onboarding_mark', { p_project_id: projectId, p_step: 'materials' })
      .then(() => window.dispatchEvent(new Event('allinpass:onboarding-refresh')));
  };

  async function renderPng() {
    const node = exportRef.current;
    if (!node) throw new Error('Material indisponível');
    return toPng(node, { pixelRatio: 1, cacheBust: true, width: format.width, height: format.height });
  }

  async function handleDownload() {
    setBusy('download');
    try {
      const dataUrl = await renderPng();
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = `${(pass?.title || 'cartao').replace(/[^\w-]+/g, '-').toLowerCase()}-${format.id}.png`;
      a.click();
      markDone();
    } catch (err) {
      toast({ variant: 'destructive', title: 'Não foi possível gerar a imagem', description: err?.message || 'Tente novamente.' });
    } finally {
      setBusy(null);
    }
  }

  async function handlePrint() {
    setBusy('print');
    try {
      const dataUrl = await renderPng();
      const iframe = document.createElement('iframe');
      iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0';
      document.body.appendChild(iframe);
      const doc = iframe.contentDocument;
      doc.open();
      doc.write(`<html><head><title>Material AllinPass</title><style>@page{margin:10mm}html,body{margin:0;height:100%}body{display:flex;align-items:center;justify-content:center}img{max-width:100%;max-height:100vh}</style></head><body><img src="${dataUrl}"></body></html>`);
      doc.close();
      const img = doc.querySelector('img');
      const go = () => {
        iframe.contentWindow.focus();
        iframe.contentWindow.print();
        setTimeout(() => iframe.remove(), 1500);
      };
      if (img.complete) go(); else img.onload = go;
      markDone();
    } catch (err) {
      toast({ variant: 'destructive', title: 'Não foi possível imprimir', description: err?.message || 'Tente novamente.' });
    } finally {
      setBusy(null);
    }
  }

  if (loading) {
    return <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Carregando materiais...</div>;
  }

  if (!passes.length) {
    return (
      <div className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground">
        Crie o seu cartão na aba Cartões primeiro. Os materiais usam a logo, as cores e o QR code do cartão.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold">Materiais de divulgação</h2>
        <p className="text-sm text-muted-foreground">Prontos com a logo, as cores e as recompensas do seu cartão. O QR code leva o cliente direto para salvar o cartão.</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,420px)]">
        <div className="space-y-5">
          {passes.length > 1 ? (
            <div>
              <p className="mb-2 text-sm font-semibold">Cartão</p>
              <div className="flex flex-wrap gap-2">
                {passes.map((p) => (
                  <Button key={p.id} size="sm" variant={p.id === passId ? 'default' : 'outline'} onClick={() => setPassId(p.id)}>{p.title || 'Cartão'}</Button>
                ))}
              </div>
            </div>
          ) : null}

          <div>
            <p className="mb-2 text-sm font-semibold">Formato</p>
            <div className="grid gap-2 sm:grid-cols-3">
              {FORMATS.map((f) => (
                <button key={f.id} type="button" onClick={() => setFormatId(f.id)} className={`rounded-xl border p-3 text-left text-sm transition ${f.id === formatId ? 'border-purple-500 bg-purple-50 ring-2 ring-purple-200' : 'border-border hover:border-purple-300'}`}>
                  <p className="font-semibold">{f.label}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{f.hint}</p>
                </button>
              ))}
            </div>
          </div>

          {!passRewards.length ? (
            <p className="rounded-lg bg-amber-50 p-3 text-xs text-amber-900">Cadastre uma recompensa ativa para ela aparecer no material. Clientes voltam mais quando sabem o que vão ganhar.</p>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <Button onClick={handleDownload} disabled={!!busy}>
              {busy === 'download' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
              Baixar imagem
            </Button>
            <Button variant="outline" onClick={handlePrint} disabled={!!busy || format.id === 'story'}>
              {busy === 'print' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Printer className="mr-2 h-4 w-4" />}
              Imprimir ou salvar em PDF
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">Dica: antes de imprimir, teste o QR com a câmera do seu celular.</p>
        </div>

        <div ref={previewBoxRef} className="w-full">
          <div className="overflow-hidden rounded-xl border border-border shadow-sm" style={{ width: previewWidth, height: format.height * scale }}>
            <div style={{ transform: `scale(${scale})`, transformOrigin: 'top left', width: format.width, height: format.height }}>
              <Poster format={format} pass={pass} rewards={passRewards} />
            </div>
          </div>
        </div>
      </div>

      <div aria-hidden style={{ position: 'fixed', left: -100000, top: 0, pointerEvents: 'none' }}>
        <div ref={exportRef}>
          <Poster format={format} pass={pass} rewards={passRewards} />
        </div>
      </div>
    </div>
  );
}
