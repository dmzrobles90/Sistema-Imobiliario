# Zamar Gestão Master

Projeto único e evolutivo da plataforma imobiliária multiempresa / white-label.

## Estado atual
- Modo demonstração continua disponível para testar a interface sem banco.
- Login real com Supabase já está preparado.
- O menu **Admin Master** só aparece para perfil `admin_master` no login real.
- Usuários normais da imobiliária não enxergam e não conseguem abrir o Admin Master.
- Sessão de login é restaurada automaticamente.
- SQL multi-imobiliária com RLS está em `supabase/schema.sql`.
- Bootstrap inicial da Zamar está em `supabase/bootstrap-zamar.sql`.

## Ativar o modo real
1. Crie um projeto no Supabase.
2. Execute `supabase/schema.sql` no SQL Editor.
3. Crie o primeiro usuário em Authentication > Users.
4. Execute as instruções de `supabase/bootstrap-zamar.sql` usando o UUID criado.
5. Copie a Project URL e a Publishable/Anon Key para `js/config.js`.
6. Mude `demoMode` para `false`.
7. Para retirar o botão de demonstração, mude `allowDemo` para `false`.

## Segurança
A separação das imobiliárias é feita por `imobiliaria_id` e RLS no Supabase. Esconder o botão Admin Master é apenas a parte visual; as políticas do banco também restringem o acesso.


## Conexão Supabase - 14/09/2026
- Login real habilitado no projeto Supabase compartilhado com o Gestor Loja.
- URL base configurada sem `/rest/v1/`.
- Autenticação consulta `imob_usuarios` por `auth_user_id`.
- Imobiliária do usuário é carregada de `imob_imobiliarias`.
- `admin_master` continua sem vínculo obrigatório com uma imobiliária e vê o menu Admin Master.
- `admin_imobiliaria` não vê o menu Admin Master.
- O restante dos módulos ainda usa dados locais nesta etapa; a migração CRUD para Supabase vem na próxima fase.


## Notificações reais - V3
- O sino consulta `imob_notificacoes` no Supabase.
- O contador mostra somente notificações com `lida = false`.
- Ao clicar, a notificação é marcada como lida, recebe `lida_em`, some da lista e reduz o contador imediatamente.
- O clique também navega para o módulo indicado em `modulo`.

## V4 - Proprietários no Supabase
- O módulo Proprietários usa `imob_proprietarios` em modo real.
- Cadastro, edição, exclusão e listagem são persistidos no Supabase.
- RLS continua isolando os dados por imobiliária.
- Admin Master pode escolher a imobiliária ao cadastrar um proprietário.

## V5 — Imóveis no Supabase
- CRUD de imóveis conectado à tabela `imob_imoveis`.
- Vínculo do imóvel com proprietário real (`imob_proprietarios`).
- Admin Master escolhe a imobiliária; usuários da imobiliária ficam automaticamente no próprio tenant.
- Upload de várias fotos por imóvel usando o Supabase Storage (`imob-imoveis`).
- Definição de foto principal, pré-visualização e remoção de imagens.
- Metadados das fotos salvos em `imob_imovel_fotos`.
- Finalidade, status, valores de venda/locação, condomínio, IPTU, áreas, endereço, publicação no site e destaque.


## V5.1
- Ajuste no cadastro de imóveis para usar apenas uma barra de rolagem vertical no modal.
- A página ao fundo não rola enquanto o cadastro estiver aberto.

## V5.6
- Módulo Documentos conectado ao Supabase (`imob_documentos` + bucket privado `imob-documentos`).
- Upload de PDF, imagens e Word com vínculo a imóvel, proprietário, inquilino, contrato ou geral.
- Abertura por URL assinada temporária e exclusão segura.
- Clique no card do imóvel abre uma ficha completa com abas: Resumo, Proprietário, Fotos, Documentos, Contratos, Financeiro, Vistorias e Manutenções.
- Na aba Documentos da ficha do imóvel é possível enviar um novo documento já vinculado ao imóvel.


## V5.7
- Inquilinos conectados ao Supabase (`imob_inquilinos`) com cadastro, edição, exclusão, isolamento por imobiliária e formulário completo.
- Documentos podem vincular inquilinos carregados diretamente do banco.


## V5.9
- Contrato modal centralizado, sem rolagem horizontal.
- Cobranças e Financeiro conectados às tabelas existentes do Supabase.
- Vendas, Vistorias e Manutenções conectados ao Supabase após executar `supabase/migracao-v5.9.sql`.
- Vistorias e Manutenções aparecem também na ficha completa do imóvel.


## V6.1 — Régua de cobrança + Central Financeira

- Processa a régua financeira ao entrar no sistema e pelo botão **Atualizar régua**.
- Cria alertas de cobrança próxima, vencendo hoje e em atraso nas faixas operacionais.
- Cria alertas de repasse pendente/atrasado.
- Exibe prioridades de cobrança e resumo operacional.
- Exibe repasses pendentes e permite confirmar o pagamento ao proprietário.
- Corrige os KPIs financeiros para separar recebimento, receita da imobiliária e repasse.
- Requer executar `supabase/migracao-v6.1-regua-central-financeira.sql` após a V6.0.
