// Modelos prontos por tipo de negócio. Só sugerem recompensas, uma automação de retorno
// e ideias de mensagens; o cartão continua sendo criado pelo fluxo normal da aba Cartões.
export const BUSINESS_TEMPLATES = [
  {
    id: 'restaurante',
    label: 'Restaurante',
    rewards: [{ name: 'Sobremesa grátis', points: 8 }, { name: 'Prato principal grátis', points: 15 }],
    automation: { type: 'days_without_visit', quantity: 30, message: 'Faz um tempinho que você não vem! Seus pontos estão te esperando, volte essa semana.' },
    cardTip: 'Título sugerido para o cartão: "Clube {nome}". Use a foto do prato mais pedido como imagem de capa.',
    messages: [
      'O almoço de hoje está especial. Venha e ganhe seu ponto!',
      'Novo prato no cardápio: venha provar e ganhe seu ponto.',
      'Você está a poucos pontos da sua sobremesa grátis!',
    ],
  },
  {
    id: 'cafeteria',
    label: 'Cafeteria / Padaria',
    rewards: [{ name: 'Café grátis', points: 8 }, { name: 'Café + fatia de bolo grátis', points: 15 }],
    automation: { type: 'days_without_visit', quantity: 14, message: 'Sentimos sua falta! Que tal um cafezinho hoje? Seu próximo ponto está esperando.' },
    cardTip: 'Título sugerido: "Cartão do Café {nome}". Cafeterias costumam ter visitas frequentes, então recompensas com poucos pontos funcionam melhor.',
    messages: [
      'Saiu fornada nova agora! Passe aqui e ganhe seu ponto.',
      'Segunda-feira pede café. Esperamos você!',
      'Faltam poucos pontos para o seu café grátis.',
    ],
  },
  {
    id: 'bar',
    label: 'Bar / Hamburgueria',
    rewards: [{ name: 'Porção ou batata grátis', points: 8 }, { name: 'Lanche grátis', points: 12 }],
    automation: { type: 'days_without_visit', quantity: 21, message: 'Bora? Faz tempo que você não aparece. Chama a galera e garanta seu ponto!' },
    cardTip: 'Título sugerido: "Fidelidade {nome}". Uma foto do ambiente ou do lanche mais pedido chama atenção na carteira.',
    messages: [
      'Hoje tem happy hour! Venha e ganhe seu ponto.',
      'Jogo hoje? Assista com a gente.',
      'Você está quase ganhando sua porção grátis!',
    ],
  },
  {
    id: 'salao',
    label: 'Salão de beleza / Estética',
    rewards: [{ name: 'Escova grátis', points: 6 }, { name: 'Hidratação grátis', points: 10 }],
    automation: { type: 'days_without_visit', quantity: 45, message: 'Que tal renovar o visual? Faz um tempo desde sua última visita. Agende seu horário!' },
    cardTip: 'Título sugerido: "Clube da Beleza {nome}". Visitas são mais espaçadas, então recompensas com 5 a 10 pontos funcionam melhor.',
    messages: [
      'Temos horários livres esta semana. Agende o seu!',
      'Novidade no salão: venha conhecer e ganhe seu ponto.',
      'Faltam poucos pontos para sua escova grátis.',
    ],
  },
  {
    id: 'barbearia',
    label: 'Barbearia',
    rewards: [{ name: 'Corte grátis', points: 8 }, { name: 'Barba grátis', points: 5 }],
    automation: { type: 'days_without_visit', quantity: 30, message: 'Já tá na hora de dar aquele trato! Garanta seu horário e seu ponto.' },
    cardTip: 'Título sugerido: "Clube {nome}". Clientes costumam voltar a cada 3 ou 4 semanas.',
    messages: [
      'Agenda aberta para o fim de semana. Garanta seu horário!',
      'Você está a poucos cortes do seu corte grátis.',
      'Traga um amigo e ganhe seu ponto.',
    ],
  },
  {
    id: 'petshop',
    label: 'Pet shop',
    rewards: [{ name: 'Banho grátis', points: 8 }, { name: 'Petisco de brinde', points: 4 }],
    automation: { type: 'days_without_visit', quantity: 30, message: 'Seu pet está com saudade de um banho caprichado! Agende e ganhe seu ponto.' },
    cardTip: 'Título sugerido: "Clube Pet {nome}". Fotos de pets atendidos fazem sucesso como imagem do cartão.',
    messages: [
      'Horários de banho e tosa disponíveis esta semana.',
      'Chegaram novidades para o seu pet! Venha conferir.',
      'Faltam poucos pontos para o banho grátis.',
    ],
  },
  {
    id: 'loja',
    label: 'Loja / Outro',
    rewards: [{ name: 'Brinde especial', points: 10 }],
    automation: { type: 'days_without_visit', quantity: 30, message: 'Temos novidades esperando por você! Passe aqui e ganhe seu ponto.' },
    cardTip: 'Título sugerido: "Clube {nome}". Escolha uma recompensa que o cliente realmente queira e que caiba na sua margem.',
    messages: [
      'Coleção nova chegou! Venha conferir.',
      'Semana de ofertas para clientes do clube.',
      'Você está a poucos pontos do seu brinde.',
    ],
  },
];

export const templateById = (id) => BUSINESS_TEMPLATES.find((t) => t.id === id) || null;
