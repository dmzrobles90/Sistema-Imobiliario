window.ZAMAR_CONFIG = {
  // Projeto Supabase compartilhado com o Gestor Loja.
  // A Plataforma Imobiliária usa tabelas próprias com prefixo imob_.
  supabaseUrl: 'https://fzfjaypxmpmcnspaznkv.supabase.co',
  supabaseAnonKey: 'sb_publishable_Ds2rYb_8trnMYZDzFoPCoQ_Vn34Jcbc',

  // Login real habilitado. O modo demonstração continua disponível só para testes.
  demoMode: false,
  allowDemo: true,

  // Meta / WhatsApp Embedded Signup (V6.7.5.4)
  // Estes IDs não são segredos. Preencha antes da publicação para habilitar o botão de conexão.
  metaAppId: '1102791845765188',
  whatsappEmbeddedConfigId: '1597152712091732',

  // Callback backend já preparado no projeto. Não coloque App Secret ou Access Token no frontend.
  whatsappOAuthCallback: 'https://fzfjaypxmpmcnspaznkv.supabase.co/functions/v1/imob-whatsapp-oauth'
};
