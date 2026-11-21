import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '@/lib/supabaseClient';
import { Gift, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { motion } from 'framer-motion';

const FALLBACK_CLAIM_TITLE = 'Resgate seu Cartão de Benefícios';
const UNAVAILABLE_STATUSES = new Set([404, 410]);

export default function WalletClaimCard() {
  const { c } = useParams();
  const { toast } = useToast();
  const [claimTitle, setClaimTitle] = useState(FALLBACK_CLAIM_TITLE);
  const [previewMessage, setPreviewMessage] = useState('');
  const [isClaimUnavailable, setIsClaimUnavailable] = useState(false);
  const [branding, setBranding] = useState(null);
  const [brandingLoaded, setBrandingLoaded] = useState(false);

  useEffect(() => {
    let active = true;
    setBranding(null);
    setBrandingLoaded(false);
    if (!c) { setBrandingLoaded(true); return undefined; }
    const timer = setTimeout(() => active && setBrandingLoaded(true), 2500);
    supabase.rpc('fn_public_claim_branding', { p_code: c }).then(({ data, error }) => {
      if (!active) return;
      if (!error && data) setBranding(data);
      setBrandingLoaded(true);
    }, () => active && setBrandingLoaded(true));
    return () => { active = false; clearTimeout(timer); };
  }, [c]);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    const loadClaimPreview = async () => {
      setClaimTitle(FALLBACK_CLAIM_TITLE);
      setPreviewMessage('');
      setIsClaimUnavailable(false);

      if (!c) {
        setIsClaimUnavailable(true);
        setPreviewMessage('Código do passe não encontrado.');
        return;
      }

      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      if (!supabaseUrl) {
        setPreviewMessage('Não foi possível carregar os dados do passe agora.');
        return;
      }

      try {
        const url = `${supabaseUrl}/functions/v1/claim-preview?c=${encodeURIComponent(c)}`;
        const response = await fetch(url, {
          method: 'GET',
          headers: { Accept: 'application/json' },
          signal: controller.signal,
        });

        const json = await response.json().catch(() => ({}));
        if (cancelled) return;

        if (response.ok) {
          const nextTitle = String(json?.claim_title || '').trim();
          setClaimTitle(nextTitle || FALLBACK_CLAIM_TITLE);
          setPreviewMessage('');
          setIsClaimUnavailable(false);
          return;
        }

        if (UNAVAILABLE_STATUSES.has(response.status)) {
          setIsClaimUnavailable(true);
          setPreviewMessage(json?.message || 'Este link de carteira não está mais disponível.');
          return;
        }

        if (response.status === 429) {
          setPreviewMessage('Muitas tentativas. Tente novamente em instantes.');
          return;
        }

        setPreviewMessage('Não foi possível carregar os dados do passe agora.');
      } catch (error) {
        if (cancelled || error?.name === 'AbortError') return;
        setPreviewMessage('Não foi possível carregar os dados do passe agora.');
      }
    };

    loadClaimPreview();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [c]);

  const handleLogin = async () => {
    if (!c) {
      toast({
        title: 'Link inválido',
        description: 'Código do passe não encontrado.',
        variant: 'destructive',
      });
      return;
    }

    if (isClaimUnavailable) {
      toast({
        title: 'Link indisponível',
        description: previewMessage || 'Este link de carteira não está mais disponível.',
        variant: 'destructive',
      });
      return;
    }

    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/claim/callback?c=${encodeURIComponent(c)}`,
        scopes: 'openid profile email',
      },
    });

    if (error) {
      console.error('Erro no login Google:', error);
      toast({
        title: 'Erro no Login',
        description: 'Não foi possível iniciar o processo de login com o Google.',
        variant: 'destructive',
      });
    }
  };

  const brandBg = /^#[0-9a-f]{6}$/i.test(branding?.background || '') ? branding.background : null;
  const brandFg = /^#[0-9a-f]{6}$/i.test(branding?.text || '') ? branding.text : '#ffffff';
  const rewardsList = Array.isArray(branding?.rewards) ? branding.rewards : [];
  const money = (cents) => (Number(cents || 0) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  const googleButton = (
    <Button
      size="lg"
      className="relative mt-7 h-16 w-full rounded-full border border-black/5 bg-white text-lg font-semibold text-slate-900 shadow-[0_16px_40px_rgba(0,0,0,0.25)] transition-all hover:-translate-y-0.5 hover:bg-white hover:shadow-[0_20px_50px_rgba(0,0,0,0.3)]"
      onClick={handleLogin}
      disabled={isClaimUnavailable}
    >
      <span className="mr-3 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white">
        <img
          src="https://upload.wikimedia.org/wikipedia/commons/c/c1/Google_%22G%22_logo.svg"
          alt="Google"
          className="h-5 w-5"
        />
      </span>
      <span>{isClaimUnavailable ? 'Link indisponível' : 'Salvar meu cartão'}</span>
    </Button>
  );

  const allinpassSeal = (
    <a
      href="https://allinpass.com.br/?utm_source=pagina_resgate&utm_medium=selo"
      target="_blank"
      rel="noopener noreferrer"
      className="mt-6 flex items-center justify-center gap-1.5 text-xs text-slate-500 transition hover:text-slate-700"
    >
      Programa de fidelidade feito com <strong className="font-semibold text-[#7046EA]">AllinPass</strong>
    </a>
  );

  if (!brandingLoaded) {
    return <div className="min-h-screen w-full bg-[#f6f6f8]" />;
  }

  if (brandBg) {
    return (
      <div className="relative min-h-screen w-full overflow-hidden px-4 py-8 sm:px-6" style={{ background: `linear-gradient(180deg, ${brandBg}22 0%, #f6f6f8 55%)` }}>
        <div className="relative mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-md flex-col items-center justify-center">
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55 }}
            className="relative w-full overflow-hidden rounded-[2rem] shadow-[0_30px_80px_rgba(0,0,0,0.25)]"
            style={{ background: brandBg, color: brandFg }}
          >
            {branding?.hero ? (
              <img src={branding.hero} alt="" className="aspect-[3/1] w-full object-cover" />
            ) : null}
            <div className="px-6 pb-7 pt-7 sm:px-8">
              {branding?.logo ? (
                <div className={`mx-auto flex w-fit items-center justify-center rounded-2xl bg-white p-2 shadow-lg ${branding?.hero ? '-mt-16' : ''}`}>
                  <img src={branding.logo} alt={branding?.project_name || ''} className="h-20 max-w-[180px] object-contain" />
                </div>
              ) : null}

              <div className="mt-5 space-y-2 text-center">
                <p className="text-sm font-medium opacity-80">{branding?.project_name}</p>
                <h1 className="text-3xl font-bold leading-tight tracking-tight">{claimTitle}</h1>
                <p className="mx-auto max-w-xs text-sm leading-relaxed opacity-90">
                  {branding?.pass_type === 'value'
                    ? 'Acumule saldo a cada compra e troque por recompensas.'
                    : 'Ganhe pontos a cada visita e troque por recompensas.'}
                </p>
                {previewMessage ? <p className="mx-auto max-w-xs text-xs leading-relaxed opacity-75">{previewMessage}</p> : null}
              </div>

              {rewardsList.length ? (
                <div className="mt-6 space-y-2">
                  {rewardsList.map((r) => (
                    <div
                      key={`${r.name}-${r.points ?? r.value_cents}`}
                      className="flex items-center justify-between gap-3 rounded-2xl px-4 py-3 text-sm"
                      style={{ border: `1.5px solid ${brandFg}55`, background: `${brandFg}12` }}
                    >
                      <span className="font-bold">{r.type === 'value' ? money(r.value_cents) : `${r.points} ${r.points === 1 ? 'ponto' : 'pontos'}`}</span>
                      <span className="text-right">{r.name}</span>
                    </div>
                  ))}
                </div>
              ) : null}

              {googleButton}
              <p className="mt-3 text-center text-xs opacity-80">O cartão vai para a carteira do seu celular (Apple ou Google). Não precisa baixar aplicativo.</p>
            </div>
          </motion.div>
          {allinpassSeal}
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-[#eef1ff] px-4 py-8 sm:px-6">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-24 left-1/2 h-72 w-72 -translate-x-1/2 rounded-full bg-violet-400/35 blur-3xl" />
        <div className="absolute bottom-12 right-6 h-56 w-56 rounded-full bg-indigo-400/30 blur-3xl" />
        <div className="absolute bottom-14 left-8 h-44 w-44 rounded-full bg-fuchsia-300/25 blur-3xl" />
      </div>

      <div className="relative mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-md items-center justify-center">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55 }}
          className="relative w-full overflow-hidden rounded-[2rem] border border-white/20 bg-gradient-to-b from-violet-700 via-violet-800 to-indigo-900 px-6 pb-7 pt-8 text-white shadow-[0_30px_80px_rgba(54,22,131,0.45)] sm:px-8"
        >
          <div className="pointer-events-none absolute -top-16 left-1/2 h-36 w-36 -translate-x-1/2 rounded-full bg-amber-300/30 blur-3xl" />
          <div className="pointer-events-none absolute right-[-36px] top-24 h-44 w-44 rounded-full bg-violet-400/20 blur-3xl" />

          <div className="relative mx-auto flex h-20 w-20 items-center justify-center rounded-3xl bg-gradient-to-b from-violet-500/75 to-violet-700/60 shadow-[0_20px_60px_rgba(254,211,104,0.4)]">
            <Gift className="h-10 w-10 text-amber-200" />
          </div>

          <div className="relative mt-6 space-y-3 text-center">
            <h1 className="text-3xl font-bold leading-tight tracking-tight sm:text-[2.1rem]">{claimTitle}</h1>
            <p className="mx-auto max-w-xs text-sm leading-relaxed text-violet-100/90 sm:text-base">
              Receba ofertas, participe de promoções e ganhe benefícios exclusivos.
            </p>
            {previewMessage ? (
              <p className="mx-auto max-w-xs text-xs leading-relaxed text-violet-100/75">
                {previewMessage}
              </p>
            ) : null}
          </div>

          <div className="relative mt-6 flex items-center justify-center gap-2 text-sm text-violet-100/85">
            <Sparkles className="h-4 w-4 text-amber-200" />
            <span>Ativação rápida e sem burocracia</span>
          </div>

          <Button
            size="lg"
            className="relative mt-7 h-16 w-full rounded-full border border-white/20 bg-gradient-to-r from-[#4f5dff] via-[#4a68ff] to-[#3768ff] text-lg font-semibold text-white shadow-[0_16px_40px_rgba(36,71,255,0.45)] transition-all hover:-translate-y-0.5 hover:brightness-110 hover:shadow-[0_20px_50px_rgba(36,71,255,0.55)]"
            onClick={handleLogin}
            disabled={isClaimUnavailable}
          >
            <span className="mr-3 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white shadow-sm">
              <img
                src="https://upload.wikimedia.org/wikipedia/commons/c/c1/Google_%22G%22_logo.svg"
                alt="Google"
                className="h-5 w-5"
              />
            </span>
            <span>{isClaimUnavailable ? 'Link indisponível' : 'Entrar e começar'}</span>
          </Button>

          <p className="mt-4 text-center text-sm text-violet-100/90">Leva menos de 5 segundos</p>
        </motion.div>
        <div className="absolute bottom-0 left-0 right-0">{allinpassSeal}</div>
      </div>
    </div>
  );
}
