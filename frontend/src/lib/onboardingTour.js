// Tutorial guiado do painel do estabelecimento.
export const ONBOARDING_TOUR_VERSION = 'v1';
const TOUR_STORAGE_PREFIX = '__allinpass_tour_done_';
const TOUR_MAX_ACCOUNT_AGE_DAYS = 30;

function tourStorageKey(userId) {
  return `${TOUR_STORAGE_PREFIX}${ONBOARDING_TOUR_VERSION}_${userId || 'anon'}`;
}

export function hasCompletedOnboardingTour(user) {
  if (!user || user.user_metadata?.[`onboarding_tour_${ONBOARDING_TOUR_VERSION}_done`]) return true;
  try {
    return !!window.localStorage.getItem(tourStorageKey(user.id));
  } catch (_) {
    return false;
  }
}

export function markOnboardingTourDoneLocally(user) {
  try {
    window.localStorage.setItem(tourStorageKey(user?.id), new Date().toISOString());
  } catch (_) {}
}

export function isRecentAccount(user) {
  const createdAt = user?.created_at ? new Date(user.created_at).getTime() : NaN;
  return Number.isFinite(createdAt) ? Date.now() - createdAt <= TOUR_MAX_ACCOUNT_AGE_DAYS * 24 * 60 * 60 * 1000 : false;
}

function menuTarget(label, isMobile) {
  return isMobile
    ? { selector: 'button[aria-label="Abrir navegacao"]' }
    : { selector: `aside button[title="${label}"]` };
}

function menuStep({ id, label, title, body, isMobile }) {
  return {
    id,
    eyebrow: isMobile ? `No menu ☰ › ${label}` : 'Menu',
    title,
    body,
    target: menuTarget(label, isMobile),
  };
}

export function buildOnboardingTourSteps({ firstName, isMobile, onOpenWallet, resolveTarget }) {
  const cardEditorOpen = () => !!resolveTarget({ tag: 'h1', text: 'Novo cartão', within: 'main' });
  return [
    {
      id: 'welcome',
      title: firstName ? `Bem-vindo(a), ${firstName}!` : 'Bem-vindo(a) à AllinPass!',
      body: 'Em 2 minutos você conhece o painel e já cria o seu primeiro cartão de fidelidade, aquele que o cliente salva na carteira do celular.',
      nextLabel: 'Começar',
      secondaryLabel: 'Agora não',
    },
    menuStep({ id: 'nav-wallet', label: 'Cartões', title: 'Cartões', body: 'É aqui que você cria e edita o cartão digital: nome, regra de pontos, cores e logo. Ele funciona na Apple Wallet e no Google Wallet.', isMobile }),
    menuStep({ id: 'nav-rewards', label: 'Recompensas', title: 'Recompensas', body: 'Defina o prêmio que o cliente ganha. Por exemplo: a cada 10 visitas, 1 café grátis.', isMobile }),
    menuStep({ id: 'nav-scanner', label: 'Scanner', title: 'Scanner', body: 'No balcão, leia o QR do cartão do cliente com a câmera do celular ou do computador para registrar a visita e dar os pontos.', isMobile }),
    menuStep({ id: 'nav-notifications', label: 'Notificações', title: 'Notificações', body: 'Envie promoções que aparecem na tela de bloqueio do celular de quem tem o seu cartão. Dá para deixar mensagens automáticas também.', isMobile }),
    menuStep({ id: 'nav-customers', label: 'Clientes', title: 'Clientes', body: 'Veja quem tem o seu cartão, quantos pontos cada um tem e quando foi a última visita.', isMobile }),
    menuStep({ id: 'nav-kpis', label: 'KPIs', title: 'Resultados', body: 'Acompanhe quantos clientes instalaram o cartão, as visitas e os prêmios resgatados.', isMobile }),
    {
      id: 'support',
      eyebrow: 'Ajuda',
      title: 'Fale com a gente',
      body: 'Ficou com alguma dúvida? Este botão abre o nosso WhatsApp de suporte.',
      target: { selector: 'a[aria-label="Abrir chat de suporte no WhatsApp"]' },
    },
    menuStep({ id: 'nav-tutorial', label: 'Tutorial', title: 'Rever o tutorial', body: 'Quando quiser ver estas dicas de novo, é só clicar em Tutorial.', isMobile }),
    {
      id: 'start-card',
      title: 'Agora, o seu primeiro cartão',
      body: 'Vamos abrir a área de Cartões e montar o cartão juntos. Você pode salvar como rascunho e terminar depois.',
      nextLabel: 'Criar meu cartão',
      secondaryLabel: 'Fazer depois',
      onNext: () => onOpenWallet?.(),
    },
    {
      id: 'new-card',
      eyebrow: 'Cartões',
      title: 'Clique em “Novo cartão”',
      body: 'Este botão abre o editor do cartão.',
      target: { tag: 'button', text: 'Novo cartão', within: 'main' },
      waitMs: 5000,
      nextLabel: 'Abrir editor',
      hideBack: true,
      onNext: ({ target }) => {
        if (target && !cardEditorOpen()) target.click();
      },
      advanceWhen: cardEditorOpen,
    },
    {
      id: 'editor-info',
      eyebrow: 'Passo 1 de 4',
      title: 'Informações básicas',
      body: 'Dê um nome ao cartão e preencha os textos e a validade. É o que o cliente vai ler no cartão.',
      target: { tag: 'h2', text: 'Informações básicas', within: 'main', closest: 'section' },
      hideBack: true,
    },
    {
      id: 'editor-location',
      eyebrow: 'Passo 2 de 4 · opcional',
      title: 'Localização',
      body: 'Cadastre o endereço da loja: quando o cliente passar por perto, o celular mostra o cartão na tela.',
      target: { tag: 'h2', text: 'Localização', within: 'main', closest: 'section' },
    },
    {
      id: 'editor-appearance',
      eyebrow: 'Passo 3 de 4',
      title: 'Aparência',
      body: 'Escolha as cores e envie o logo e as imagens para Apple Wallet e Google Wallet. Use as cores da sua marca.',
      target: { tag: 'h2', text: 'Aparência', within: 'main', closest: 'section' },
    },
    {
      id: 'editor-preview',
      eyebrow: 'Ao vivo',
      title: 'Pré-visualização',
      body: 'Aqui você vê como o cartão vai ficar no celular enquanto preenche.',
      target: { tag: 'p', text: 'Pré-visualização', within: 'main', up: 1 },
    },
    {
      id: 'editor-draft',
      eyebrow: 'Sem pressa',
      title: 'Salvar rascunho',
      body: 'Ainda não terminou? Salve o rascunho e continue depois.',
      target: { tag: 'button', text: 'Salvar rascunho', within: 'main' },
    },
    {
      id: 'editor-generate',
      eyebrow: 'Passo 4 de 4',
      title: 'Gerar link único',
      body: 'Quando estiver tudo certo, gere o link do cartão. Ele vira um QR code que o cliente aponta a câmera para salvar o cartão.',
      target: { tag: 'button', text: 'Gerar link único', within: 'main' },
    },
    {
      id: 'done',
      title: 'Depois de gerar o link',
      body: 'Em Cartões, passe o mouse (ou toque) sobre o cartão para “Copiar link” ou “Baixar QR”. Coloque o QR no balcão, no Instagram e no WhatsApp, e crie o prêmio em Recompensas.',
      hint: 'Dica: os 10 primeiros clientes com o cartão já mostram resultado nos seus KPIs.',
      nextLabel: 'Entendi',
      hideBack: true,
    },
  ];
}
