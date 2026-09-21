
const uiIcon=(name,cls='')=>`<svg class="ui-icon ${cls}" aria-hidden="true"><use href="#i-${name}"></use></svg>`;
// Plataforma Imobiliaria V6.5 - Central de Comunicacao
const cfg = window.ZAMAR_CONFIG || {};
const $ = (s)=>document.querySelector(s);
const $$ = (s)=>[...document.querySelectorAll(s)];
const brl = v => Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const fallbackPhoto='https://images.unsplash.com/photo-1564013799919-ab600027ffc6?auto=format&fit=crop&w=900&q=80';
const save=(k,v)=>localStorage.setItem('plataforma_imobiliaria_'+k,JSON.stringify(v));
const load=(k,seed)=>JSON.parse(localStorage.getItem('plataforma_imobiliaria_'+k)||'null')||seed;

let imoveis=load('imoveis',[
 {id:1,codigo:'Z001',titulo:'Apartamento - Tatuapé',finalidade:'Venda',status:'Disponível',bairro:'Tatuapé',cidade:'São Paulo',valor:450000,quartos:2,banheiros:2,vagas:1,area:68,foto:'https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?auto=format&fit=crop&w=900&q=80'},
 {id:2,codigo:'Z002',titulo:'Casa - Vila Matilde',finalidade:'Locação',status:'Alugado',bairro:'Vila Matilde',cidade:'São Paulo',valor:3200,quartos:3,banheiros:3,vagas:2,area:140,foto:'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=900&q=80'}
]);
let props=load('props',[{id:1,nome:'Mariana Santos',documento:'123.***.***-**',telefone:'(11) 99999-1001',email:'mariana@email.com'},{id:2,nome:'Ricardo Lima',documento:'456.***.***-**',telefone:'(11) 99999-1002',email:'ricardo@email.com'}]);
let db={
 inquilinos:load('inquilinos',[{id:11,nome:'João Silva',documento:'111.***.***-**',telefone:'(11) 98888-1111',email:'joao@email.com',status:'Em dia'}]),
 contratos:load('contratos',[{id:21,codigo:'LOC-001',imovel:'Apartamento - Tatuapé',inquilino:'João Silva',valor:2500,vencimento:'10',status:'Ativo'}]),
 cobrancas:load('cobrancas',[{id:31,descricao:'Aluguel LOC-001',inquilino:'João Silva',valor:2500,vencimento:'2026-10-10',status:'Pendente'}]),
 financeiro:load('financeiro',[{id:41,data:'2026-09-10',descricao:'Recebimento aluguel LOC-001',tipo:'Recebimento',valor:2500,status:'Recebido'}]),
 vendas:load('vendas',[{id:51,cliente:'Ana Souza',imovel:'Apartamento - Tatuapé',etapa:'Proposta',valor:450000,comissao:5}]),
 vistorias:load('vistorias',[{id:61,data:'2026-09-16',imovel:'Casa - Vila Matilde',tipo:'Entrada',responsavel:'Carlos',status:'Agendada'}]),
 manutencoes:load('manutencoes',[{id:71,chamado:'MAN-001',imovel:'Casa - Vila Matilde',descricao:'Reparo elétrico',status:'Aberto',valor:350}]),
 documentos:load('documentos',[{id:81,nome:'Contrato LOC-001.pdf',categoria:'Contrato',vinculo:'João Silva',data:'2026-09-10',status:'Validado'}]),
 imobiliarias:load('imobiliarias',[{id:91,nome:'Zamar Imóveis',creci:'047529-J',plano:'Piloto',cor:'#ffe600',status:'Ativa'}])
};
let configuracoes=load('config',{nome:'Zamar Imóveis',slogan:'SEU SONHO TEM NOME, ZAMAR IMÓVEIS',cor1:'#ffe600',cor2:'#111111',creci:'047529-J',banco:'Não configurada'});

function persistAll(){save('imoveis',imoveis);save('props',props);Object.entries(db).forEach(([k,v])=>save(k,v));save('config',configuracoes)}

let supabaseClient=null;
let currentUser=null;
let currentProfile=null;
let currentImobiliaria=null;
let notificacoes=[];
let imovelFotosExistentes=[];
let imovelFotosNovas=[];
let imovelFotosRemover=[];
let imovelFotoPrincipalKey=null;
let documentoSelecionado=null;
let imovelDetalheAtual=null;
let imovelDetalheDados={documentos:[],contratos:[],financeiro:[]};
let paymentGateway=null;
const isRealMode=()=>!cfg.demoMode && !!cfg.supabaseUrl && !!cfg.supabaseAnonKey;

function humanRole(role){
 const map={admin_master:'Admin Master',admin_imobiliaria:'Dono',dono:'Dono',socio:'Sócio',administrativo:'Administrativo',corretor:'Corretor',financeiro:'Financeiro',atendimento:'Atendimento',proprietario:'Proprietário',inquilino:'Inquilino'};
 return map[role]||'Usuário';
}
function initials(name='Usuário'){return name.split(/\s+/).filter(Boolean).slice(0,2).map(x=>x[0]).join('').toUpperCase()||'US'}
function isTenantOwner(){return ['admin_imobiliaria','dono'].includes(currentProfile?.perfil);}
function applyAccessControl(){
 const master=currentProfile?.perfil==='admin_master';
 $$('.tenant-nav,.tenant-owner-nav').forEach(el=>el.style.display=master?'none':'');
 $$('.master-nav').forEach(el=>el.style.display=master?'':'none');
 const usersBtn=$('#usuariosNav'); if(usersBtn)usersBtn.style.display=(!master&&isTenantOwner())?'':'none';
 const autoBtn=$('#automacoesNav'); if(autoBtn)autoBtn.style.display=(!master&&isTenantOwner())?'':'none';
 if(master){
   go('adminmaster');
   const search=$('#globalSearch'); if(search){search.value='';search.placeholder='Buscar imobiliária...';search.style.visibility='hidden';}
 }else{
   const search=$('#globalSearch'); if(search){search.placeholder='Buscar imóvel, cliente, contrato...';search.style.visibility='visible';}
   if($$('.master-page').some(x=>x.classList.contains('active')))go('dashboard');
 }
}
function applyUserUI(){
 const name=currentProfile?.nome || currentUser?.email || 'Carlos Zamar';
 $('#userName').textContent=name;
 $('#userRole').textContent=cfg.demoMode?'Demonstração':humanRole(currentProfile?.perfil);
 $('#userAvatar').textContent=initials(name); const g=$('#dashboardGreeting');if(g)g.textContent='Olá, '+String(name).split(/\s+/)[0]+'!';
}
function applyPlatformBrand(){
 document.documentElement.style.setProperty('--yellow','#4F46E5');
 document.documentElement.style.setProperty('--black','#111827');
 document.documentElement.style.setProperty('--app-bg','#F4F6F8');
 document.documentElement.style.setProperty('--sidebar-text','#FFFFFF');
 document.body.style.fontFamily='Inter, Arial, sans-serif';
 const logo=$('#tenantLogo'), mark=$('#platformMark'), text=$('#tenantBrandText');
 if(logo){logo.hidden=true;logo.removeAttribute('src');} if(mark)mark.hidden=false; if(text)text.textContent='Plataforma Imobiliária';
 const foot=document.querySelector('.sidebar-foot');if(foot)foot.innerHTML='Plataforma Imobiliária<br><small>Administração</small>';
 const hero=$('#dashboard .hero strong');if(hero)hero.textContent='Plataforma Imobiliária';
 const heroP=$('#dashboard .hero p');if(heroP)heroP.textContent='Visão geral da plataforma e das imobiliárias clientes.';
}
function applyTenantBrand(){
 if(currentProfile?.perfil==='admin_master' || !currentImobiliaria){applyPlatformBrand();return;}
 const imob=currentImobiliaria;
 const primary=imob.cor_primaria || '#4F46E5';
 const secondary=imob.cor_secundaria || '#111827';
 document.documentElement.style.setProperty('--yellow', primary);
 document.documentElement.style.setProperty('--black', secondary);
 document.documentElement.style.setProperty('--app-bg', imob.cor_fundo || '#F4F6F8');
 document.documentElement.style.setProperty('--sidebar-text', imob.cor_texto_sidebar || '#FFFFFF');
 document.body.style.fontFamily=`${imob.fonte || 'Inter'}, Arial, sans-serif`;
 const logo=$('#tenantLogo'),mark=$('#platformMark'),text=$('#tenantBrandText');
 if(mark)mark.hidden=true; if(imob.logo_url && logo){logo.src=imob.logo_url;logo.hidden=false;}else{if(logo)logo.hidden=true;}
 if(text)text.textContent=imob.slogan || imob.nome_fantasia || imob.nome || 'Imobiliária';
 const hero=$('#dashboard .hero strong'); if(hero) hero.textContent=imob.slogan ? '“'+imob.slogan+'”' : (imob.nome_fantasia||imob.nome||'Imobiliária');
 const heroP=$('#dashboard .hero p'); if(heroP) heroP.textContent='Aqui está o resumo da '+(imob.nome_fantasia || imob.nome || 'imobiliária')+'.';
 const foot=document.querySelector('.sidebar-foot'); if(foot) foot.innerHTML=`${escapeHtml(imob.nome_fantasia || imob.nome || 'Imobiliária')}<br><small>${imob.creci ? 'CRECI '+escapeHtml(imob.creci) : 'Painel da Imobiliária'}</small>`;
}

async function loadSessionContext(){
 if(!supabaseClient) return;
 const {data:{user}}=await supabaseClient.auth.getUser();
 if(!user) return;
 currentUser=user;
 const {data:profile,error}=await supabaseClient.from('imob_usuarios').select('*').eq('auth_user_id',user.id).single();
 if(error) throw new Error('Seu usuário existe, mas ainda não possui um perfil de acesso configurado.');
 if(!profile.ativo) throw new Error('Este usuário está desativado.');
 currentProfile=profile;
 if(profile.imobiliaria_id){
   const {data:imob}=await supabaseClient.from('imob_imobiliarias').select('*').eq('id',profile.imobiliaria_id).single();
   currentImobiliaria=imob||null;
 }
}
function notificationIcon(n){
 const byModule={cobrancas:'⚠️',contratos:'📝',vistorias:'📸',documentos:'📄',financeiro:'💰',imoveis:'🏠',manutencoes:'🛠️',vendas:'🤝'};
 const byType={sucesso:'✅',atencao:'⚠️',erro:'⛔',info:'🔔'};
 return byModule[n.modulo] || byType[n.tipo] || '🔔';
}
function escapeHtml(value=''){
 return String(value).replace(/[&<>'"]/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]));
}
function renderNotifications(){
 const count=$('#notifCount');
 const list=$('#notifList');
 const pendentes=notificacoes.filter(n=>!n.lida);
 if(count){
   count.textContent=String(pendentes.length);
   count.hidden=pendentes.length===0;
 }
 if(!list) return;
 if(!pendentes.length){
   list.innerHTML='<li class="notif-empty">Você não tem notificações pendentes.</li>';
   return;
 }
 list.innerHTML=pendentes.map(n=>`<li><button type="button" class="notif-item" data-notif-id="${n.id}" data-notif-page="${n.modulo||'dashboard'}"><span>${notificationIcon(n)}</span><span><strong>${escapeHtml(n.titulo||'Notificação')}</strong><small>${escapeHtml(n.mensagem||('Abrir '+(n.modulo||'dashboard')))}</small></span><b>›</b></button></li>`).join('');
 list.querySelectorAll('[data-notif-id]').forEach(btn=>btn.addEventListener('click',()=>openNotification(btn.dataset.notifId,btn.dataset.notifPage)));
}
async function loadNotifications(){
 if(!isRealMode() || !supabaseClient || !currentProfile){
   notificacoes=[]; renderNotifications(); return;
 }
 const {data,error}=await supabaseClient
   .from('imob_notificacoes')
   .select('id,imobiliaria_id,usuario_id,titulo,mensagem,tipo,modulo,referencia_id,lida,lida_em,criada_em')
   .eq('lida',false)
   .order('criada_em',{ascending:false});
 if(error){
   console.warn('Não foi possível carregar notificações:',error);
   notificacoes=[]; renderNotifications(); return;
 }
 notificacoes=data||[];
 renderNotifications();
}
async function openNotification(id,page){
 const notif=notificacoes.find(n=>String(n.id)===String(id));
 if(!notif) return;
 notif.lida=true;
 notif.lida_em=new Date().toISOString();
 renderNotifications();
 $('#notifDialog')?.close();
 const target=page||notif.modulo||'dashboard';
 go(target);
 requestAnimationFrame(()=>document.getElementById(target)?.scrollIntoView({behavior:'smooth',block:'start'}));
 if(!isRealMode() || !supabaseClient) return;
 const {error}=await supabaseClient
   .from('imob_notificacoes')
   .update({lida:true,lida_em:notif.lida_em})
   .eq('id',notif.id);
 if(error){
   notif.lida=false; notif.lida_em=null; renderNotifications();
   console.warn('Não foi possível marcar a notificação como lida:',error);
 }
}
function showApp(){
 $('#loginView').classList.add('hidden'); $('#appView').classList.remove('hidden');
 applyUserUI(); applyTenantBrand(); applyAccessControl(); renderAll();
 loadNotifications(); loadEquipe(); if(isTenantOwner()){loadAutomacoes().catch(console.warn);loadComunicacoes().catch(console.warn);}
}
async function loadRealImobiliarias(){
 if(!isRealMode() || !supabaseClient || !currentProfile) return;
 if(currentProfile.perfil==='admin_master'){
   const {data,error}=await supabaseClient.from('imob_imobiliarias').select('*,plano:imob_planos(nome)').order('nome');
   if(error) throw error;
   db.imobiliarias=(data||[]).map(x=>({...x,nome:x.nome_fantasia||x.nome,creci:x.creci||'',plano_nome:x.plano?.nome||'',plano:x.plano?.nome||'',cor:x.cor_primaria||'#4F46E5',status_label:x.status==='ativo'?'Ativa':(x.status==='suspenso'?'Suspensa':'Inativa')}));
   const owners=await supabaseClient.from('imob_usuarios').select('id,imobiliaria_id,nome,email,telefone,perfil,ativo').in('perfil',['admin_imobiliaria','dono']);
   if(!owners.error){db.imobiliarias.forEach(i=>{const o=(owners.data||[]).find(u=>String(u.imobiliaria_id)===String(i.id)&&u.ativo!==false);if(o){i.dono_id=o.id;i.dono_nome=o.nome;i.dono_email=o.email;i.dono_telefone=o.telefone;}});}
 } else if(currentImobiliaria){
   db.imobiliarias=[{id:currentImobiliaria.id,nome:currentImobiliaria.nome_fantasia||currentImobiliaria.nome,creci:currentImobiliaria.creci||'',plano:'',cor:currentImobiliaria.cor_primaria||'#F5C400',status:currentImobiliaria.status==='ativo'?'Ativa':'Inativa'}];
 }
}
async function loadRealProprietarios(){
 if(!isRealMode() || !supabaseClient || !currentProfile) return;
 const {data,error}=await supabaseClient
   .from('imob_proprietarios')
   .select('id,imobiliaria_id,nome,tipo_pessoa,cpf_cnpj,rg_ie,email,telefone,whatsapp,cep,endereco,numero,complemento,bairro,cidade,estado,banco,agencia,conta,tipo_conta,chave_pix,observacoes,ativo,criado_em')
   .order('nome',{ascending:true});
 if(error) throw error;
 props=data||[];
}

async function loadRealInquilinos(){
 if(!isRealMode() || !supabaseClient || !currentProfile) return;
 const {data,error}=await supabaseClient
   .from('imob_inquilinos')
   .select('id,imobiliaria_id,nome,tipo_pessoa,cpf_cnpj,rg_ie,data_nascimento,email,telefone,whatsapp,profissao,empresa,renda_mensal,cep,endereco,numero,complemento,bairro,cidade,estado,contato_emergencia_nome,contato_emergencia_telefone,observacoes,ativo,criado_em')
   .order('nome',{ascending:true});
 if(error) throw error;
 db.inquilinos=(data||[]).map(x=>({...x,documento:x.cpf_cnpj,status:x.ativo?'Ativo':'Inativo'}));
}

const contratoStatusLabel=v=>({rascunho:'Rascunho',ativo:'Ativo',encerrado:'Encerrado',cancelado:'Cancelado'}[v]||v||'-');
async function loadRealContratos(){
 if(!isRealMode() || !supabaseClient || !currentProfile) return;
 const {data,error}=await supabaseClient
   .from('imob_contratos')
   .select('id,imobiliaria_id,imovel_id,proprietario_id,inquilino_id,codigo,status,data_inicio,data_fim,dia_vencimento,valor_aluguel,primeira_parcela_imobiliaria,taxa_administracao_tipo,taxa_administracao_valor,prazo_repasse_dias,multa_atraso_percentual,juros_atraso_percentual_mes,reajuste_indice,reajuste_periodicidade_meses,garantia_tipo,garantia_valor,observacoes,ativo,criado_em,atualizado_em')
   .order('criado_em',{ascending:false});
 if(error) throw error;
 db.contratos=(data||[]).map(x=>{
   const im=imoveis.find(i=>String(i.id)===String(x.imovel_id));
   const iq=db.inquilinos.find(i=>String(i.id)===String(x.inquilino_id));
   return {...x,imovel:im?.titulo||im?.codigo||'Imóvel',inquilino:iq?.nome||'Inquilino',valor:Number(x.valor_aluguel||0),vencimento:x.dia_vencimento,status:contratoStatusLabel(x.status)};
 });
}

const finalidadeLabel=v=>({venda:'Venda',locacao:'Locação',venda_locacao:'Venda e Locação'}[v]||v||'-');
const statusLabel=v=>({disponivel:'Disponível',reservado:'Reservado',alugado:'Alugado',vendido:'Vendido',inativo:'Inativo'}[v]||v||'-');
async function loadRealImoveis(){
 if(!isRealMode() || !supabaseClient || !currentProfile) return;
 const {data,error}=await supabaseClient
   .from('imob_imoveis')
   .select('id,imobiliaria_id,proprietario_id,codigo,titulo,finalidade,tipo_imovel,status,valor_venda,valor_locacao,valor_condominio,valor_iptu,dormitorios,suites,banheiros,vagas,area_util,area_total,cep,endereco,numero,complemento,bairro,cidade,estado,descricao,caracteristicas,destaque,publicado_site,ativo,criado_em')
   .order('criado_em',{ascending:false});
 if(error) throw error;
 const ids=(data||[]).map(x=>x.id);
 let fotos=[];
 if(ids.length){
   const fr=await supabaseClient.from('imob_imovel_fotos').select('id,imovel_id,url,principal,ordem').in('imovel_id',ids).order('ordem',{ascending:true});
   if(fr.error) console.warn('Fotos não carregadas:',fr.error); else fotos=fr.data||[];
 }
 imoveis=(data||[]).map(x=>{
   const fotosImovel=fotos.filter(f=>f.imovel_id===x.id);
   const foto=fotosImovel.find(f=>f.principal)?.url || fotosImovel[0]?.url || '';
   return {...x,finalidade:finalidadeLabel(x.finalidade),status:statusLabel(x.status),quartos:x.dormitorios||0,area:x.area_util||x.area_total||0,valor:x.finalidade==='locacao' ? x.valor_locacao : (x.valor_venda||x.valor_locacao||0),foto,fotos:fotosImovel};
 });
}
async function loadRealDocumentos(){
 if(!isRealMode() || !supabaseClient || !currentProfile) return;
 const {data,error}=await supabaseClient.from('imob_documentos').select('*').eq('ativo',true).order('criado_em',{ascending:false});
 if(error) throw error;
 db.documentos=(data||[]).map(x=>({...x,nome:x.nome_arquivo,data:x.criado_em,status:'Privado'}));
}

const cobrancaStatusLabel=v=>({pendente:'Pendente',pago:'Pago',vencido:'Vencido',cancelado:'Cancelado',parcial:'Parcial'}[v]||v||'-');
const financeiroStatusLabel=v=>({pendente:'Pendente',pago:'Pago',cancelado:'Cancelado'}[v]||v||'-');
const financeiroTipoLabel=v=>({receita_imobiliaria:'Receita imobiliária',repasse_proprietario:'Repasse proprietário',despesa:'Despesa',ajuste:'Ajuste',estorno:'Estorno'}[v]||v||'-');
const dateOnly=v=>{if(!v)return null;const raw=String(v).slice(0,10);const [y,m,d]=raw.split('-').map(Number);return y&&m&&d?new Date(y,m-1,d):null;};
const isCurrentMonth=v=>{const d=dateOnly(v);if(!d)return false;const n=new Date();return d.getFullYear()===n.getFullYear()&&d.getMonth()===n.getMonth();};
const daysFromToday=v=>{const d=dateOnly(v);if(!d)return null;const n=new Date();const t=new Date(n.getFullYear(),n.getMonth(),n.getDate());return Math.round((d-t)/86400000);};
async function processarReguaFinanceira(){
 if(!isRealMode()||!supabaseClient||!currentProfile)return null;
 const {data,error}=await supabaseClient.rpc('imob_processar_regua_financeira');
 if(error)throw error;
 return data;
}
const vendaEtapaLabel=v=>({lead:'Lead',visita:'Visita',proposta:'Proposta',fechamento:'Fechamento',concluida:'Concluída',cancelada:'Cancelada'}[v]||v||'-');
const vistoriaTipoLabel=v=>({entrada:'Entrada',saida:'Saída',periodica:'Periódica'}[v]||v||'-');
const vistoriaStatusLabel=v=>({agendada:'Agendada',em_andamento:'Em andamento',concluida:'Concluída',cancelada:'Cancelada'}[v]||v||'-');
const manutencaoStatusLabel=v=>({aberto:'Aberto',aguardando_proprietario:'Aguardando proprietário',em_execucao:'Em execução',concluido:'Concluído',cancelado:'Cancelado'}[v]||v||'-');
const manutencaoPrioridadeLabel=v=>({baixa:'Baixa',media:'Média',alta:'Alta',urgente:'Urgente'}[v]||v||'-');
function contratoById(id){return db.contratos.find(c=>String(c.id)===String(id));}
function imovelById(id){return imoveis.find(i=>String(i.id)===String(id));}
function inquilinoById(id){return db.inquilinos.find(i=>String(i.id)===String(id));}
function proprietarioById(id){return props.find(p=>String(p.id)===String(id));}
async function loadRealCobrancas(){
 if(!isRealMode()||!supabaseClient||!currentProfile)return;
 const {data,error}=await supabaseClient.from('imob_cobrancas').select('*').order('data_vencimento',{ascending:false});
 if(error)throw error;
 db.cobrancas=(data||[]).map(x=>{const c=contratoById(x.contrato_id),inq=inquilinoById(c?.inquilino_id);return {...x,status_raw:x.status,descricao:`Aluguel ${c?.codigo||''}`.trim()||'Cobrança',inquilino:inq?.nome||'Inquilino',valor:Number(x.valor_total||x.valor_base||0),vencimento:formatDateBR(x.data_vencimento),status:cobrancaStatusLabel(x.status)};});
}
async function loadPaymentGateway(){
 if(!isRealMode()||!supabaseClient||!currentProfile?.imobiliaria_id){paymentGateway=null;return;}
 const {data,error}=await supabaseClient.from('imob_gateway_pagamentos').select('*').eq('imobiliaria_id',currentProfile.imobiliaria_id).maybeSingle();
 if(error){console.warn('Gateway de pagamentos ainda não instalado:',error);paymentGateway=null;return;} paymentGateway=data||null;
}
async function loadRealFinanceiro(){
 if(!isRealMode()||!supabaseClient||!currentProfile)return;
 const {data,error}=await supabaseClient.from('imob_financeiro').select('*').order('data_lancamento',{ascending:false});
 if(error)throw error;
 db.financeiro=(data||[]).map(x=>{const prop=proprietarioById(x.proprietario_id);return {...x,tipo_raw:x.tipo,status_raw:x.status,proprietario_nome:prop?.nome||'Proprietário',data:formatDateBR(x.data_lancamento),tipo:financeiroTipoLabel(x.tipo),valor:Number(x.valor||0),status:financeiroStatusLabel(x.status)};});
}
async function loadRealVendas(){
 if(!isRealMode()||!supabaseClient||!currentProfile)return;
 const {data,error}=await supabaseClient.from('imob_vendas').select('*').order('criado_em',{ascending:false});
 if(error)throw error;
 db.vendas=(data||[]).map(x=>{const im=imovelById(x.imovel_id);return {...x,etapa_raw:x.etapa,cliente:x.cliente_nome,imovel:im?.titulo||im?.codigo||'Imóvel',etapa:vendaEtapaLabel(x.etapa),valor:Number(x.valor_negociacao||0),comissao:Number(x.comissao_percentual||0)};});
}
async function loadRealVistorias(){
 if(!isRealMode()||!supabaseClient||!currentProfile)return;
 const {data,error}=await supabaseClient.from('imob_vistorias').select('*').order('data_vistoria',{ascending:false});
 if(error)throw error;
 db.vistorias=(data||[]).map(x=>{const im=imovelById(x.imovel_id);return {...x,tipo_raw:x.tipo,status_raw:x.status,data:formatDateBR(x.data_vistoria),imovel:im?.titulo||im?.codigo||'Imóvel',tipo:vistoriaTipoLabel(x.tipo),status:vistoriaStatusLabel(x.status)};});
}
async function loadRealManutencoes(){
 if(!isRealMode()||!supabaseClient||!currentProfile)return;
 const {data,error}=await supabaseClient.from('imob_manutencoes').select('*').order('criado_em',{ascending:false});
 if(error)throw error;
 db.manutencoes=(data||[]).map(x=>{const im=imovelById(x.imovel_id);return {...x,status_raw:x.status,prioridade_raw:x.prioridade,chamado:x.codigo||'MAN',imovel:im?.titulo||im?.codigo||'Imóvel',status:manutencaoStatusLabel(x.status),valor:Number(x.valor_final??x.valor_estimado??0),prioridade:manutencaoPrioridadeLabel(x.prioridade)};});
}
async function loadRealOperacao(){
 await loadRealCobrancas();await loadPaymentGateway();
 await loadRealFinanceiro();
 await loadRealVendas();
 await loadRealVistorias();
 await loadRealManutencoes();
}
async function enterAuthenticatedApp(){
 await loadSessionContext();
 await Promise.all([loadRealImobiliarias(),loadRealProprietarios(),loadRealInquilinos(),loadRealImoveis(),loadRealDocumentos()]);
 await loadRealContratos();
 try{ await processarReguaFinanceira(); }catch(err){ console.warn('Régua financeira ainda não instalada ou indisponível:',err); }
 try{ await loadRealOperacao(); }catch(err){ console.warn('Módulos operacionais ainda não disponíveis no banco:',err); }
 showApp();
}

if(!cfg.allowDemo){ const d=$('#demoBtn'); if(d)d.style.display='none'; }
$('#demoBtn').onclick=()=>{ currentProfile={perfil:'admin_master',nome:'Carlos Zamar',ativo:true}; showApp(); };
$('#loginForm').addEventListener('submit',async e=>{
 e.preventDefault(); $('#loginMsg').textContent='';
 if(cfg.demoMode||!cfg.supabaseUrl||!cfg.supabaseAnonKey){
   $('#loginMsg').textContent='Supabase ainda não configurado. Use o modo demonstração.'; return;
 }
 try{
   supabaseClient ||= window.supabase.createClient(cfg.supabaseUrl,cfg.supabaseAnonKey);
   const {error}=await supabaseClient.auth.signInWithPassword({email:$('#email').value,password:$('#password').value});
   if(error) throw error;
   await enterAuthenticatedApp();
 }catch(err){ $('#loginMsg').textContent=err.message||'Não foi possível entrar.'; }
});
$('#logoutBtn').onclick=async()=>{
 if(isRealMode() && supabaseClient) await supabaseClient.auth.signOut();
 currentUser=currentProfile=currentImobiliaria=null; notificacoes=[]; renderNotifications();
 $('#appView').classList.add('hidden'); $('#loginView').classList.remove('hidden');
 $('#password').value='';
};
function go(page){
 const master=currentProfile?.perfil==='admin_master';
 const masterPages=['adminmaster','masterimobiliarias','masterplanos','configuracoes'];
 if(master && !masterPages.includes(page)) page='adminmaster';
 if(!master && masterPages.includes(page)) page='dashboard';
 if((page==='usuarios'||page==='automacoes') && !isTenantOwner()) page='dashboard';
 if(page==='automacoes' && isTenantOwner()){loadAutomacoes();loadComunicacoes();}
 $$('.page').forEach(x=>x.classList.toggle('active',x.id===page));
 $$('#nav button').forEach(x=>x.classList.toggle('active',x.dataset.page===page));
}
$$('#nav button').forEach(b=>b.onclick=()=>go(b.dataset.page));$$('[data-go]').forEach(b=>b.onclick=()=>go(b.dataset.go));

// Se o projeto já estiver em modo real e houver sessão válida, restaura automaticamente.
(async()=>{
 if(!isRealMode()) return;
 try{
   supabaseClient=window.supabase.createClient(cfg.supabaseUrl,cfg.supabaseAnonKey);
   const {data:{session}}=await supabaseClient.auth.getSession();
   if(session) await enterAuthenticatedApp();
 }catch(err){ console.warn(err); }
})();


// V6.2.7 - Cards inteligentes + filtros rápidos
const smartState={};
const smartCfg={
 imoveis:{data:()=>imoveis,status:x=>String(x.status||'').toLowerCase(),date:x=>x.criado_em,cards:[['all','Total'],['disponível','Disponíveis'],['alugado','Alugados'],['vendido','Vendidos'],['reservado','Reservados'],['publicado','Publicados']]},
 proprietarios:{data:()=>props,status:x=>x.ativo===false?'inativo':'ativo',date:x=>x.criado_em,cards:[['all','Total'],['ativo','Ativos'],['inativo','Inativos']]},
 inquilinos:{data:()=>db.inquilinos,status:x=>String(x.status_raw||x.status||'').toLowerCase(),date:x=>x.criado_em,cards:[['all','Total'],['ativo','Ativos'],['em dia','Em dia'],['pendente','Pendentes'],['inativo','Inativos']]},
 contratos:{data:()=>db.contratos,status:x=>String(x.status_raw||x.status||'').toLowerCase(),date:x=>x.data_fim||x.criado_em,cards:[['all','Total'],['ativo','Ativos'],['rascunho','Rascunhos'],['encerrado','Encerrados'],['cancelado','Cancelados']]},
 cobrancas:{data:()=>db.cobrancas,status:x=>String(x.status_raw||x.status||'').toLowerCase(),date:x=>x.data_vencimento,cards:[['all','Total'],['pendente','Pendentes'],['vencido','Vencidas'],['pago','Pagas'],['parcial','Parciais'],['cancelado','Canceladas']]},
 financeiro:{data:()=>db.financeiro,status:x=>String(x.status_raw||x.status||'').toLowerCase(),date:x=>x.data_vencimento||x.data_lancamento,cards:[['all','Total'],['pendente','Pendentes'],['pago','Pagos'],['receita_imobiliaria','Receita imobiliária'],['repasse_proprietario','Repasses'],['despesa','Despesas']]},
 vendas:{data:()=>db.vendas,status:x=>String(x.etapa_raw||x.etapa||'').toLowerCase(),date:x=>x.data_proxima_acao||x.criado_em,cards:[['all','Total'],['lead','Lead'],['visita','Visita'],['proposta','Proposta'],['fechamento','Fechamento'],['concluida','Concluída'],['cancelada','Cancelada']]},
 vistorias:{data:()=>db.vistorias,status:x=>String(x.status_raw||x.status||'').toLowerCase(),date:x=>x.data_vistoria,cards:[['all','Total'],['agendada','Agendadas'],['em_andamento','Em andamento'],['concluida','Concluídas'],['cancelada','Canceladas']]},
 manutencoes:{data:()=>db.manutencoes,status:x=>String(x.status_raw||x.status||'').toLowerCase(),date:x=>x.data_abertura||x.criado_em,cards:[['all','Total'],['aberto','Abertas'],['aguardando_proprietario','Aguardando'],['em_execucao','Em execução'],['concluido','Concluídas'],['cancelado','Canceladas']]},
 documentos:{data:()=>db.documentos||[],status:x=>{const d=x.data_validade?new Date(x.data_validade+'T12:00:00'):null;if(!d)return 'sem validade';const n=new Date();n.setHours(0,0,0,0);return d<n?'vencido':((d-n)/86400000<=30?'vencendo':'válido')},date:x=>x.data_validade||x.criado_em,cards:[['all','Total'],['válido','Válidos'],['vencendo','Vencendo'],['vencido','Vencidos'],['sem validade','Sem validade']]}
};
function smartInitState(m){return smartState[m]||(smartState[m]={status:'all',period:'all',from:'',to:''})}
function smartDateOk(m,x){const st=smartInitState(m),cfg=smartCfg[m];if(st.period==='all')return true;const raw=cfg.date(x);if(!raw)return false;const d=new Date(String(raw).length===10?raw+'T12:00:00':raw);if(Number.isNaN(d.getTime()))return false;d.setHours(0,0,0,0);const now=new Date();now.setHours(0,0,0,0);if(st.period==='today')return d.getTime()===now.getTime();if(st.period==='custom'){if(!st.from||!st.to)return true;const a=new Date(st.from+'T00:00:00'),b=new Date(st.to+'T23:59:59');return d>=a&&d<=b}const days=Number(st.period);const end=new Date(now);end.setDate(end.getDate()+days);return d>=now&&d<=end}
function smartStatusOk(m,x,key){if(key==='all')return true;if(m==='imoveis'&&key==='publicado')return !!x.publicado_site;const cfg=smartCfg[m],v=cfg.status(x);if(m==='financeiro'&&['receita_imobiliaria','repasse_proprietario','despesa'].includes(key))return String(x.tipo_raw||'')===key;return v===key||v.includes(key)}
function smartFiltered(m,ignoreStatus=false){const cfg=smartCfg[m],st=smartInitState(m);return cfg.data().filter(x=>smartDateOk(m,x)&&(ignoreStatus||smartStatusOk(m,x,st.status)))}
function renderSmart(m){const cfg=smartCfg[m],box=document.getElementById(m+'SmartCards');if(!cfg||!box)return;const st=smartInitState(m);const base=cfg.data().filter(x=>smartDateOk(m,x));box.innerHTML=cfg.cards.map(([k,l])=>`<button class="smart-card ${st.status===k?'active':''}" data-smart-status="${k}"><b>${base.filter(x=>smartStatusOk(m,x,k)).length}</b><small>${l}</small></button>`).join('');box.querySelectorAll('[data-smart-status]').forEach(b=>b.onclick=()=>{st.status=b.dataset.smartStatus;renderAll();});const root=box.closest('[data-smart-module]');if(root){root.querySelectorAll('[data-period]').forEach(b=>b.classList.toggle('active',st.period===b.dataset.period));const custom=root.querySelector('.smart-custom');custom?.classList.toggle('hidden',st.period!=='custom')}}
function bindSmartFilters(){document.querySelectorAll('[data-smart-module]').forEach(root=>{const m=root.dataset.smartModule,st=smartInitState(m);root.querySelectorAll('[data-period]').forEach(b=>b.onclick=()=>{st.period=b.dataset.period;root.querySelector('.smart-custom')?.classList.toggle('hidden',st.period!=='custom');renderAll();});root.querySelector('[data-apply-custom]')?.addEventListener('click',()=>{st.from=root.querySelector('[data-date-from]').value;st.to=root.querySelector('[data-date-to]').value;st.period='custom';renderAll();});});}

const actionBtns=(type,id)=>`<div class="actions"><button class="mini edit" data-edit="${type}" data-id="${id}">Editar</button><button class="mini danger" data-delete="${type}" data-id="${id}">Excluir</button></div>`;
function propertyPrice(i){
 if(i.finalidade==='Venda e Locação') return `${brl(i.valor_venda)} <small>venda</small><br>${brl(i.valor_locacao)}<small>/mês</small>`;
 if(i.finalidade==='Locação') return `${brl(i.valor_locacao ?? i.valor)}<small>/mês</small>`;
 return brl(i.valor_venda ?? i.valor);
}
function card(i){const imob=db.imobiliarias.find(x=>String(x.id)===String(i.imobiliaria_id));return `<article class="property property-clickable" data-view-imovel="${i.id}" title="Clique para abrir a ficha completa do imóvel"><div class="photo" style="background-image:url('${escapeHtml(i.foto||fallbackPhoto)}')"><span class="badge">${escapeHtml(i.finalidade)}</span>${i.publicado_site?'<span class="site-badge">🌐 Publicado</span>':''}</div><div class="body"><h4>${escapeHtml(i.titulo)}</h4>${currentProfile?.perfil==='admin_master'&&imob?`<small class="muted">${escapeHtml(imob.nome)}</small>`:''}<div class="meta"><span>🛏 ${i.quartos||0}</span><span>🛁 ${i.banheiros||0}</span><span>🚗 ${i.vagas||0}</span><span>📐 ${i.area||0}m²</span></div><div class="price">${propertyPrice(i)}</div><small>${escapeHtml(i.bairro||'')} · ${escapeHtml(i.cidade||'')}</small>${actionBtns('imoveis',i.id)}</div></article>`}
function renderImoveis(){let q=($('#searchImovel')?.value||'').toLowerCase(),f=$('#filterFinalidade')?.value||'',s=$('#filterStatus')?.value||'';let data=smartFiltered('imoveis').filter(i=>(!q||`${i.titulo} ${i.bairro} ${i.codigo}`.toLowerCase().includes(q))&&(!f||i.finalidade===f)&&(!s||i.status===s));$('#imoveisGrid').innerHTML=data.map(card).join('')||'<div class="empty">Nenhum imóvel encontrado.</div>';$('#featured').innerHTML=imoveis.filter(i=>i.destaque).slice(0,4).map(card).join('')||imoveis.slice(0,4).map(card).join('');}
function renderProps(){
 const table=$('#propTable'); if(!table) return;
 table.innerHTML=smartFiltered('proprietarios').map(p=>{
   const imob=db.imobiliarias.find(i=>String(i.id)===String(p.imobiliaria_id));
   const nomeImob=currentProfile?.perfil==='admin_master' && imob ? `<small class="muted">${escapeHtml(imob.nome)}</small>` : '';
   return `<tr><td><strong>${escapeHtml(p.nome||'')}</strong>${nomeImob}</td><td>${escapeHtml(p.cpf_cnpj||p.documento||'-')}</td><td>${escapeHtml(p.telefone||'-')}</td><td>${escapeHtml(p.email||'-')}</td><td>${imoveis.filter(i=>String(i.proprietario_id)===String(p.id)).length}</td><td>${actionBtns('props',p.id)}</td></tr>`;
 }).join('') || '<tr><td colspan="6" class="muted">Nenhum proprietário cadastrado.</td></tr>';
}
function statusClass(v){return /ativo|em dia|recebido|validado|conclu|pago|disponível|ativa/i.test(v||'')?'ok':'warn'}
function rows(id,html){const el=$(id);if(el)el.innerHTML=html||'<tr><td colspan="8" class="muted">Nenhum registro.</td></tr>'}
function renderOthers(){
 rows('#inquilinosTable',smartFiltered('inquilinos').map(x=>`<tr><td>${x.nome}</td><td>${x.documento||'-'}</td><td>${x.telefone||'-'}</td><td>${x.email||'-'}</td><td><span class="status ${statusClass(x.status)}">${x.status||'-'}</span></td><td>${actionBtns('inquilinos',x.id)}</td></tr>`).join(''));
 rows('#contratosTable',smartFiltered('contratos').map(x=>`<tr><td>${x.codigo}</td><td>${x.imovel}</td><td>${x.inquilino}</td><td>${brl(x.valor)}</td><td>Dia ${x.vencimento}</td><td><span class="status ${statusClass(x.status)}">${x.status}</span></td><td>${actionBtns('contratos',x.id)}</td></tr>`).join(''));
 rows('#cobrancasTable',smartFiltered('cobrancas').map(x=>{const meio=x.meio_pagamento||x.forma_pagamento||'-';const hasPix=!!x.pix_copia_cola,hasBol=!!x.boleto_linha_digitavel;return `<tr><td>${x.descricao}</td><td>${x.inquilino}</td><td>${brl(x.valor)}</td><td>${x.vencimento||'-'}</td><td><small>${escapeHtml(meio)}</small>${hasPix?'<br><span class="status ok">PIX</span>':''}${hasBol?'<br><span class="status">Boleto</span>':''}</td><td><span class="status ${statusClass(x.status)}">${x.status}</span></td><td><div class="actions">${x.status_raw!=='pago'&&x.status_raw!=='cancelado'?`<button class="mini pay-action" data-baixa-cobranca="${x.id}">${uiIcon('banknote')}<span>Registrar pagamento</span></button>`:''}<button class="mini icon-action" data-payment-detail="${x.id}" title="Detalhes" aria-label="Detalhes">${uiIcon('eye')}</button><button class="mini icon-action" data-edit="cobrancas" data-id="${x.id}" title="Editar" aria-label="Editar">${uiIcon('pencil')}</button><button class="mini icon-action danger" data-delete="cobrancas" data-id="${x.id}" title="Excluir" aria-label="Excluir">${uiIcon('trash')}</button></div></td></tr>`}).join(''));
 rows('#financeiroTable',smartFiltered('financeiro').map(x=>`<tr><td>${x.data||'-'}</td><td>${x.descricao}</td><td>${x.tipo}</td><td>${brl(x.valor)}</td><td><span class="status ${statusClass(x.status)}">${x.status}</span></td><td>${actionBtns('financeiro',x.id)}</td></tr>`).join(''));
 rows('#vendasTable',smartFiltered('vendas').map(x=>`<tr><td>${x.cliente}</td><td>${x.imovel}</td><td>${x.etapa}</td><td>${brl(x.valor)}</td><td>${x.comissao}%</td><td>${actionBtns('vendas',x.id)}</td></tr>`).join(''));
 rows('#vistoriasTable',smartFiltered('vistorias').map(x=>`<tr><td>${x.data}</td><td>${x.imovel}</td><td>${x.tipo}</td><td>${x.responsavel}</td><td><span class="status ${statusClass(x.status)}">${x.status}</span></td><td>${actionBtns('vistorias',x.id)}</td></tr>`).join(''));
 rows('#manutencoesTable',smartFiltered('manutencoes').map(x=>`<tr><td>${x.chamado}</td><td>${x.imovel}</td><td>${x.descricao}</td><td><span class="status ${statusClass(x.status)}">${x.status}</span></td><td>${brl(x.valor)}</td><td>${actionBtns('manutencoes',x.id)}</td></tr>`).join(''));
 renderDocumentosTable();
 rows('#imobiliariasTable',db.imobiliarias.map(x=>`<tr><td><strong>${escapeHtml(x.nome)}</strong><small class="table-sub">${escapeHtml(x.creci||'Sem CRECI')}</small></td><td>${escapeHtml(x.dono_nome||'Não definido')}<small class="table-sub">${escapeHtml(x.dono_email||'')}</small></td><td>${escapeHtml(x.plano_nome||x.plano||'Sem plano')}</td><td><span class="status ${statusClass(x.status_label||x.status)}">${escapeHtml(x.status_label||x.status||'-')}</span></td><td><div class="actions"><button class="mini edit" data-admin-agency="${x.id}">⚙ Administrar</button><button class="mini edit" data-customize-agency="${x.id}">🎨 Personalizar</button></div></td></tr>`).join('')); const mt=$('#masterTotalImob'),ma=$('#masterAtivas'),mi=$('#masterInativas');if(mt)mt.textContent=db.imobiliarias.length;if(ma)ma.textContent=db.imobiliarias.filter(x=>x.status==='ativo'||x.status==='Ativa').length;if(mi)mi.textContent=db.imobiliarias.filter(x=>x.status!=='ativo'&&x.status!=='Ativa').length; const ms=$('#masterAgencySummary');if(ms)ms.innerHTML=db.imobiliarias.filter(x=>x.status==='ativo'||x.status==='Ativa').map(x=>`<div class="master-summary-row"><div><strong>${escapeHtml(x.nome)}</strong><small>${escapeHtml(x.creci||'Sem CRECI')}</small></div><span>${escapeHtml(x.plano_nome||x.plano||'Sem plano')}</span></div>`).join('')||'<div class="muted">Nenhuma imobiliária ativa.</div>';
}

function formatDateBR(v){if(!v)return '-';const d=new Date(String(v).length===10?v+'T12:00:00':v);return Number.isNaN(d.getTime())?escapeHtml(v):d.toLocaleDateString('pt-BR')}
function nomeVinculoDocumento(x){
 if(x.tipo_vinculo==='imovel'){const r=imoveis.find(i=>String(i.id)===String(x.imovel_id));return r?`${r.codigo||''} ${r.titulo}`.trim():'Imóvel';}
 if(x.tipo_vinculo==='proprietario'){const r=props.find(i=>String(i.id)===String(x.proprietario_id));return r?.nome||'Proprietário';}
 if(x.tipo_vinculo==='inquilino') return x._vinculo_nome||'Inquilino';
 if(x.tipo_vinculo==='contrato') return x._vinculo_nome||'Contrato';
 if(x.tipo_vinculo==='financeiro') return x._vinculo_nome||'Financeiro';
 if(x.tipo_vinculo==='vistoria') return x._vinculo_nome||'Vistoria';
 if(x.tipo_vinculo==='manutencao') return x._vinculo_nome||'Manutenção';
 return 'Geral';
}
function renderDocumentosTable(){
 const el=$('#documentosTable'); if(!el)return;
 el.innerHTML=smartFiltered('documentos').map(x=>`<tr><td><strong>${escapeHtml(x.nome_arquivo||x.nome||'Documento')}</strong><small class="muted doc-type">${escapeHtml(x.mime_type||'')}</small></td><td>${escapeHtml(x.categoria||'-')}</td><td>${escapeHtml(nomeVinculoDocumento(x))}</td><td>${formatDateBR(x.data_validade)}</td><td>${formatDateBR(x.criado_em||x.data)}</td><td><div class="actions"><button class="mini edit" data-doc-open="${x.id}">Abrir</button><button class="mini danger" data-doc-delete="${x.id}">Excluir</button></div></td></tr>`).join('')||'<tr><td colspan="6" class="muted">Nenhum documento enviado.</td></tr>';
 bindDocumentActions();
}
async function openDocumentoArquivo(id){
 const doc=(db.documentos||[]).find(x=>String(x.id)===String(id)); if(!doc)return;
 if(!isRealMode()||!supabaseClient){alert('A abertura segura de documentos está disponível no modo conectado ao Supabase.');return;}
 const win=window.open('','_blank');
 const {data,error}=await supabaseClient.storage.from('imob-documentos').createSignedUrl(doc.caminho_storage,120);
 if(error||!data?.signedUrl){if(win)win.close();alert('Não foi possível abrir o documento: '+(error?.message||'erro desconhecido'));return;}
 if(win){win.opener=null;win.location=data.signedUrl;}else window.location.href=data.signedUrl;
}
async function deleteDocumento(id){
 const doc=(db.documentos||[]).find(x=>String(x.id)===String(id)); if(!doc||!confirm(`Excluir o documento "${doc.nome_arquivo||doc.nome}"?`))return;
 if(isRealMode()&&supabaseClient){
   try{
     const del=await supabaseClient.from('imob_documentos').delete().eq('id',doc.id); if(del.error)throw del.error;
     const sr=await supabaseClient.storage.from('imob-documentos').remove([doc.caminho_storage]); if(sr.error)console.warn('Registro removido, mas arquivo não foi removido do Storage:',sr.error);
     await loadRealDocumentos(); renderAll(); if(imovelDetalheAtual) await refreshImovelDetalhe();
   }catch(err){alert('Não foi possível excluir o documento: '+(err.message||err));}
   return;
 }
 db.documentos=db.documentos.filter(x=>String(x.id)!==String(id));persistAll();renderAll();
}
function bindDocumentActions(){
 $$('[data-doc-open]').forEach(b=>b.onclick=e=>{e.stopPropagation();openDocumentoArquivo(b.dataset.docOpen)});
 $$('[data-doc-delete]').forEach(b=>b.onclick=e=>{e.stopPropagation();deleteDocumento(b.dataset.docDelete)});
}
function renderFinancialOperations(){
 const hoje=new Date();
 const cobrancasAbertas=db.cobrancas.filter(x=>['pendente','vencido','parcial'].includes(x.status_raw));
 const venceHoje=cobrancasAbertas.filter(x=>daysFromToday(x.data_vencimento)===0);
 const proximas=cobrancasAbertas.filter(x=>{const d=daysFromToday(x.data_vencimento);return d!==null&&d>0&&d<=5;});
 const atrasadas=cobrancasAbertas.filter(x=>{const d=daysFromToday(x.data_vencimento);return x.status_raw==='vencido'||(d!==null&&d<0);});
 const atrasoValor=atrasadas.reduce((a,x)=>a+Number(x.valor_total||x.valor||0),0);
 if($('#cobVenceHoje'))$('#cobVenceHoje').textContent=venceHoje.length;
 if($('#cobProximos'))$('#cobProximos').textContent=proximas.length;
 if($('#cobAtrasados'))$('#cobAtrasados').textContent=atrasadas.length;
 if($('#cobAtrasadoValor'))$('#cobAtrasadoValor').textContent=brl(atrasoValor);
 const priorities=[...atrasadas,...venceHoje,...proximas].sort((a,b)=>(dateOnly(a.data_vencimento)?.getTime()||0)-(dateOnly(b.data_vencimento)?.getTime()||0)).slice(0,8);
 const badge=$('#cobPriorityBadge');if(badge)badge.textContent=`${cobrancasAbertas.length} cobrança${cobrancasAbertas.length===1?'':'s'} em aberto`;
 const list=$('#cobrancaPriorityList');
 if(list)list.innerHTML=priorities.length?priorities.map(x=>{const d=daysFromToday(x.data_vencimento);const label=d===0?'Vence hoje':d<0?`${Math.abs(d)} dia${Math.abs(d)===1?'':'s'} em atraso`:`Vence em ${d} dia${d===1?'':'s'}`;return `<div class="ops-item"><span class="ops-icon">${d<0?'⚠️':d===0?'⏰':'📅'}</span><div><strong>${escapeHtml(x.descricao||'Cobrança')}</strong><small>${escapeHtml(x.inquilino||'Inquilino')} · ${label}</small></div><div class="ops-value"><b>${brl(x.valor_total||x.valor)}</b><small>${formatDateBR(x.data_vencimento)}</small></div></div>`}).join(''):'<div class="ops-empty">Nenhuma cobrança prioritária. A carteira está em dia.</div>';

 const repasses=db.financeiro.filter(x=>x.tipo_raw==='repasse_proprietario'&&x.status_raw==='pendente');
 const repasseTotal=repasses.reduce((a,x)=>a+Number(x.valor||0),0);
 if($('#repassePendenteTotal'))$('#repassePendenteTotal').textContent=brl(repasseTotal);
 const rt=$('#repassesTable');if(rt)rt.innerHTML=repasses.length?repasses.map(x=>`<tr><td class="repasse-owner"><strong>${escapeHtml(x.proprietario_nome||'Proprietário')}</strong><small>${escapeHtml(x.descricao||'Repasse')}</small></td><td>${formatDateBR(x.competencia)}</td><td>${brl(x.valor)}</td><td>${formatDateBR(x.data_prevista_repasse||x.data_vencimento)}</td><td><button class="mini edit" data-pagar-repasse="${x.id}">Confirmar repasse</button></td></tr>`).join(''):'<tr><td colspan="5" class="muted">Nenhum repasse pendente.</td></tr>';
 const recebidoMes=db.cobrancas.filter(x=>x.status_raw==='pago'&&isCurrentMonth(x.data_pagamento)).reduce((a,x)=>a+Number(x.valor_pago||x.valor_total||x.valor||0),0);
 const receitaMes=db.financeiro.filter(x=>x.tipo_raw==='receita_imobiliaria'&&x.status_raw==='pago'&&isCurrentMonth(x.data_pagamento||x.data_lancamento)).reduce((a,x)=>a+Number(x.valor||0),0);
 const aReceber=cobrancasAbertas.reduce((a,x)=>a+Number(x.valor_total||x.valor||0),0);
 const repassesAtrasados=repasses.filter(x=>{const d=daysFromToday(x.data_prevista_repasse||x.data_vencimento);return d!==null&&d<0;});
 const vencidoValor=atrasadas.reduce((a,x)=>a+Number(x.valor_total||x.valor||0),0);
 if($('#payAReceber'))$('#payAReceber').textContent=brl(aReceber);if($('#payRecebido'))$('#payRecebido').textContent=brl(recebidoMes);if($('#payVencido'))$('#payVencido').textContent=brl(vencidoValor);if($('#payRepasses'))$('#payRepasses').textContent=brl(repasseTotal);
 const gs=$('#paymentGatewayStatus');if(gs){const ok=paymentGateway?.ativo&&paymentGateway?.status==='conectado';gs.textContent=ok?`${paymentGateway.provider||'Gateway'} conectado`:'Gateway não configurado';gs.className='status '+(ok?'ok':'warn');}
 const pn=$('#paymentProviderNote');if(pn&&paymentGateway?.provider&&paymentGateway.provider!=='manual')pn.textContent=`Provedor configurado: ${paymentGateway.provider}. As credenciais permanecem no backend e isoladas por imobiliária.`;
 const sum=$('#financeOpsSummary');if(sum)sum.innerHTML=[
   ['Recebido no mês',brl(recebidoMes)],['Receita da imobiliária',brl(receitaMes)],['A receber',brl(aReceber)],['Repasses pendentes',`${repasses.length} · ${brl(repasseTotal)}`],['Repasses atrasados',String(repassesAtrasados.length)]
 ].map(([l,v])=>`<div class="finance-summary-row"><span>${l}</span><strong>${v}</strong></div>`).join('');
 return {recebidoMes,receitaMes,aReceber,repasseTotal,atrasadas:atrasadas.length};
}
function renderKPIs(){
 $('#kpiImoveis').textContent=imoveis.length;$('#kpiAlugados').textContent=imoveis.filter(i=>i.status==='Alugado').length;$('#kpiVendas').textContent=db.vendas.length;
 const fin=renderFinancialOperations();
 $('#kpiAtrasos').textContent=fin.atrasadas;
 $('#kpiRecebido').textContent=brl(fin.recebidoMes);$('#kpiRepasse').textContent=brl(fin.repasseTotal);
 $('#kpiContratosAtivos').textContent=db.contratos.filter(x=>/ativo/i.test(x.status||'')).length;$('#kpiContratosVencer').textContent=0;$('#kpiContratosAtraso').textContent=db.contratos.filter(x=>/atras/i.test(x.status||'')).length;
 $('#finRecebido').textContent=brl(fin.recebidoMes);$('#finRepasse').textContent=brl(fin.repasseTotal);$('#finReceita').textContent=brl(fin.receitaMes);$('#finPendente').textContent=brl(fin.aReceber);
}
let customAgency=null;
function renderConfig(){
 const page=$('#configuracoes'); if(page) page.style.display=(currentProfile?.perfil==='admin_master'||cfg.demoMode)?'':'none';
 const sel=$('#cfgImobiliaria'); if(!sel)return;
 sel.innerHTML='<option value="">Selecione a imobiliária</option>'+db.imobiliarias.map(i=>`<option value="${i.id}">${escapeHtml(i.nome)}</option>`).join('');
 if(customAgency){sel.value=String(customAgency.id);fillCustomizer(customAgency);}
}
function fillCustomizer(imob){
 customAgency=imob||null;if(!imob)return;
 $('#cfgNome').value=imob.nome_fantasia||imob.nome||'';$('#cfgSlogan').value=imob.slogan||'';$('#cfgCor1').value=imob.cor_primaria||'#4F46E5';$('#cfgCor2').value=imob.cor_secundaria||'#111827';$('#cfgFundo').value=imob.cor_fundo||'#F4F6F8';$('#cfgTextoSidebar').value=imob.cor_texto_sidebar||'#FFFFFF';$('#cfgFonte').value=imob.fonte||'Inter';$('#cfgCreci').value=imob.creci||'';$('#cfgStatus').value=imob.status||'ativo';updateCustomizerPreview();
}
function updateCustomizerPreview(){const imob=customAgency||{};$('#cfgPreviewNome').textContent=$('#cfgNome').value||'Imobiliária';$('#cfgPreviewSlogan').textContent=$('#cfgSlogan').value||'Identidade do cliente';const p=$('#cfgPreviewLogo');p.style.background=$('#cfgCor1').value||'#4F46E5';p.style.color=$('#cfgTextoSidebar').value||'#fff';p.style.fontFamily=$('#cfgFonte').value||'Inter';if(imob.logo_url)p.innerHTML=`<img src="${escapeHtml(imob.logo_url)}" alt="Logo">`;else p.textContent=initials($('#cfgNome').value||'IM');}


let planos=[];let equipe=[];
const accessModules=['imoveis','proprietarios','inquilinos','contratos','cobrancas','financeiro','vendas','vistorias','manutencoes','documentos','relatorios'];
async function loadMasterPlanos(){
 if(!isRealMode()||!supabaseClient||currentProfile?.perfil!=='admin_master')return;
 const {data,error}=await supabaseClient.from('imob_planos').select('*').order('ordem'); if(error){console.warn(error);return;} planos=data||[];
 const pc=$('#masterPlanosCount');if(pc)pc.textContent=planos.length;
 const grid=$('#planosGrid');if(grid)grid.innerHTML=planos.map(p=>`<article class="plan-card"><span class="status ${p.ativo?'ok':'warn'}">${p.ativo?'Ativo':'Inativo'}</span><h3>${escapeHtml(p.nome)}</h3><b>${brl(p.valor_mensal)}<small>/mês</small></b><p>${escapeHtml(p.descricao||'')}</p><div class="plan-meta"><small>Implantação: <strong>${brl(p.valor_implantacao||0)}</strong></small><small>Usuários: <strong>${p.limite_usuarios||'Ilimitado'}</strong></small><small>Módulos: <strong>${(p.modulos||[]).length}</strong></small></div><div class="actions"><button class="mini edit" data-edit-plan="${p.id}">Editar plano</button></div></article>`).join('')||'<div class="empty">Nenhum plano cadastrado.</div>';
}
async function loadEquipe(){
 if(!isRealMode()||!supabaseClient||!currentProfile||currentProfile.perfil==='admin_master')return;
 const {data,error}=await supabaseClient.from('imob_usuarios').select('id,nome,email,perfil,ativo,imobiliaria_id').eq('imobiliaria_id',currentProfile.imobiliaria_id).order('nome'); if(error){console.warn(error);return;} equipe=data||[];renderEquipe();
}
function renderEquipe(){const el=$('#usuariosTable');if(!el)return;el.innerHTML=equipe.map(u=>`<tr><td><strong>${escapeHtml(u.nome||'-')}</strong></td><td>${escapeHtml(u.email||'-')}</td><td>${escapeHtml(humanRole(u.perfil))}</td><td><span class="status ${u.ativo?'ok':'warn'}">${u.ativo?'Ativo':'Inativo'}</span></td><td>${u.perfil==='admin_imobiliaria'||u.perfil==='dono'?'<strong>Dono · acesso total</strong>':'Permissões individuais'}</td></tr>`).join('')||'<tr><td colspan="5" class="muted">Nenhum usuário cadastrado.</td></tr>';}
function defaultPermissions(profile){const all={};accessModules.forEach(m=>all[m]={visualizar:false,cadastrar:false,editar:false,excluir:false});const set=(mods,ops=['visualizar'])=>mods.forEach(m=>ops.forEach(o=>all[m][o]=true));if(profile==='socio')set(accessModules,['visualizar','cadastrar','editar']);if(profile==='administrativo')set(['imoveis','proprietarios','inquilinos','contratos','cobrancas','vistorias','manutencoes','documentos'],['visualizar','cadastrar','editar']);if(profile==='corretor')set(['imoveis','proprietarios','vendas','vistorias','documentos'],['visualizar','cadastrar','editar']);if(profile==='financeiro')set(['contratos','cobrancas','financeiro','documentos'],['visualizar','cadastrar','editar']);if(profile==='atendimento')set(['imoveis','proprietarios','inquilinos','contratos','vistorias','manutencoes','documentos'],['visualizar']);return all;}
function renderPermissionGrid(profile){const grid=$('#permissoesGrid');if(!grid)return;const defs=defaultPermissions(profile);grid.innerHTML=`<div class="perm-head"><b>Módulo</b><b>Ver</b><b>Criar</b><b>Editar</b><b>Excluir</b></div>`+accessModules.map(m=>`<div class="perm-row"><span>${m[0].toUpperCase()+m.slice(1)}</span>${['visualizar','cadastrar','editar','excluir'].map(op=>`<input type="checkbox" data-perm-module="${m}" data-perm-op="${op}" ${defs[m][op]?'checked':''}>`).join('')}</div>`).join('');}
function openUsuarioDialog(){if(!isTenantOwner()){alert('Somente o Dono pode administrar usuários e acessos.');return;}const f=$('#usuarioForm');f.reset();renderPermissionGrid('socio');$('#usuarioDialog').showModal();}

function renderPlanoModules(selected=[]){const el=$('#planoModulosGrid');if(!el)return;const set=new Set(selected||[]);el.innerHTML=accessModules.map(m=>`<label><input type="checkbox" value="${m}" ${set.has(m)?'checked':''}> <span>${m[0].toUpperCase()+m.slice(1)}</span></label>`).join('');}
function openPlanoDialog(id=null){if(currentProfile?.perfil!=='admin_master')return;const f=$('#planoForm');f.reset();const p=id?planos.find(x=>String(x.id)===String(id)):null;$('#planoDialogTitle').textContent=p?'Editar plano':'Novo plano';f.elements.id.value=p?.id||'';f.elements.nome.value=p?.nome||'';f.elements.valor_mensal.value=p?.valor_mensal??0;f.elements.valor_implantacao.value=p?.valor_implantacao??0;f.elements.limite_usuarios.value=p?.limite_usuarios??'';f.elements.ativo.value=String(p?.ativo??true);f.elements.ordem.value=p?.ordem??0;f.elements.descricao.value=p?.descricao||'';renderPlanoModules(p?.modulos||[]);$('#planoDialog').showModal();}
async function openMasterAgency(id){if(currentProfile?.perfil!=='admin_master')return;const im=db.imobiliarias.find(x=>String(x.id)===String(id));if(!im)return;const f=$('#masterImobForm');f.reset();f.elements.id.value=im.id;f.elements.nome.value=im.nome||'';f.elements.status.value=im.status||'ativo';f.elements.creci.value=im.creci||'';const ps=$('#masterImobPlano');ps.innerHTML='<option value="">Sem plano</option>'+planos.map(p=>`<option value="${p.id}">${escapeHtml(p.nome)} · ${brl(p.valor_mensal)}/mês</option>`).join('');ps.value=im.plano_id||'';const {data:users,error}=await supabaseClient.from('imob_usuarios').select('id,nome,email,telefone,perfil,ativo').eq('imobiliaria_id',im.id).eq('ativo',true).order('nome');if(error){alert(error.message);return;}const owner=(users||[]).find(u=>['admin_imobiliaria','dono'].includes(u.perfil));f.elements.dono_nome.value=owner?.nome||'';f.elements.dono_email.value=owner?.email||'';f.elements.dono_telefone.value=owner?.telefone||'';const nd=$('#masterNovoDono');nd.innerHTML='<option value="">Manter dono atual</option>'+(users||[]).filter(u=>u.id!==owner?.id).map(u=>`<option value="${u.id}">${escapeHtml(u.nome||u.email||'Usuário')} · ${escapeHtml(humanRole(u.perfil))}</option>`).join('');f.dataset.ownerId=owner?.id||'';$('#masterImobDialog').showModal();}
$('#novoPlanoBtn')?.addEventListener('click',()=>openPlanoDialog());
$('#planoForm')?.addEventListener('submit',async e=>{e.preventDefault();const f=e.currentTarget;const mods=[...$('#planoModulosGrid').querySelectorAll('input:checked')].map(x=>x.value);const payload={nome:f.elements.nome.value.trim(),descricao:f.elements.descricao.value.trim(),valor_mensal:Number(f.elements.valor_mensal.value||0),valor_implantacao:Number(f.elements.valor_implantacao.value||0),limite_usuarios:f.elements.limite_usuarios.value?Number(f.elements.limite_usuarios.value):null,ativo:f.elements.ativo.value==='true',ordem:Number(f.elements.ordem.value||0),modulos:mods,atualizado_em:new Date().toISOString()};const id=f.elements.id.value;const r=id?await supabaseClient.from('imob_planos').update(payload).eq('id',id):await supabaseClient.from('imob_planos').insert(payload);if(r.error){alert('Não foi possível salvar o plano: '+r.error.message);return;}$('#planoDialog').close();await loadMasterPlanos();renderAll();});
$('#masterImobForm')?.addEventListener('submit',async e=>{e.preventDefault();const f=e.currentTarget;const id=f.elements.id.value;let r=await supabaseClient.from('imob_imobiliarias').update({status:f.elements.status.value,plano_id:f.elements.plano_id.value||null,atualizado_em:new Date().toISOString()}).eq('id',id);if(r.error){alert(r.error.message);return;}const ownerId=f.dataset.ownerId;if(ownerId){r=await supabaseClient.from('imob_usuarios').update({nome:f.elements.dono_nome.value.trim(),email:f.elements.dono_email.value.trim(),telefone:f.elements.dono_telefone.value.trim()||null}).eq('id',ownerId);if(r.error){alert(r.error.message);return;}}const novo=f.elements.novo_dono_id.value;if(novo){const tr=await supabaseClient.rpc('imob_master_transferir_dono',{p_imobiliaria_id:id,p_novo_dono_id:novo});if(tr.error){alert('Não foi possível transferir o Dono: '+tr.error.message);return;}}$('#masterImobDialog').close();await loadRealImobiliarias();await loadMasterPlanos();renderAll();});
document.addEventListener('click',e=>{const p=e.target.closest('[data-edit-plan]');if(p)openPlanoDialog(p.dataset.editPlan);const a=e.target.closest('[data-admin-agency]');if(a)openMasterAgency(a.dataset.adminAgency);const c=e.target.closest('[data-close-dialog]');if(c)document.getElementById(c.dataset.closeDialog)?.close();});

let comunicacoes=[];
let comunicacaoModelos=[];
let whatsappCanal=null;
let emailCanal=null;
function showToast(message,type='success'){
 const t=$('#appToast');if(!t)return;t.textContent=message;t.className='app-toast '+type;t.hidden=false;clearTimeout(showToast._timer);showToast._timer=setTimeout(()=>t.hidden=true,4200);
}
function humanEvento(e){const m={vence_hoje:'Vence hoje'};if(m[e])return m[e];if(e?.startsWith('antes_'))return e.replace('antes_','')+' dias antes';if(e?.startsWith('atraso_'))return e.replace('atraso_','')+' dias em atraso';return e||'-';}
function renderComunicacoes(){
 const total=comunicacoes.length,pend=comunicacoes.filter(x=>x.status==='pendente').length,env=comunicacoes.filter(x=>x.status==='enviada').length,err=comunicacoes.filter(x=>['erro','sem_destinatario'].includes(x.status)).length;
 if($('#comPendentesKpi'))$('#comPendentesKpi').textContent=pend;if($('#comEnviadasKpi'))$('#comEnviadasKpi').textContent=env;if($('#comErrosKpi'))$('#comErrosKpi').textContent=err;if($('#comTotalKpi'))$('#comTotalKpi').textContent=total;
 const body=$('#comunicacoesTable');if(body)body.innerHTML=comunicacoes.map(x=>`<tr><td>${fmtDateTime(x.criado_em)}</td><td><strong>${escapeHtml(x.destinatario_nome||'-')}</strong><br><small>${escapeHtml(x.destinatario||'Contato não cadastrado')}</small></td><td>${x.canal==='whatsapp'?'WhatsApp':'E-mail'}</td><td>${escapeHtml(humanEvento(x.evento))}</td><td><div class="com-message-preview">${escapeHtml(x.mensagem||'')}</div></td><td><span class="status ${x.status==='enviada'?'ok':x.status==='pendente'?'':'warn'}">${x.status==='sem_destinatario'?'Sem contato':x.status[0].toUpperCase()+x.status.slice(1)}</span></td></tr>`).join('')||'<tr><td colspan="6" class="muted">A fila ainda está vazia. Novos eventos da régua criarão comunicações aqui.</td></tr>';
 const grid=$('#comModelosGrid');if(grid)grid.innerHTML=comunicacaoModelos.map(m=>`<article class="message-model-card" data-model-id="${m.id}"><header><div><strong>${escapeHtml(humanEvento(m.evento))}</strong><small> · ${m.canal==='whatsapp'?'WhatsApp':'E-mail'}</small></div><label><input class="model-active" type="checkbox" ${m.ativo?'checked':''}> Ativo</label></header>${m.canal==='email'?`<label>Assunto<input class="model-subject" type="text" value="${escapeHtml(m.assunto||'')}"></label>`:`<div class="meta-template-grid"><label>Nome do template Meta<input class="model-meta-name" type="text" value="${escapeHtml(m.meta_template_name||'')}" placeholder="cobranca_3_dias_antes"></label><label>Idioma<select class="model-meta-language"><option value="pt_BR" ${(m.meta_template_language||'pt_BR')==='pt_BR'?'selected':''}>Português (Brasil)</option><option value="en_US" ${m.meta_template_language==='en_US'?'selected':''}>English (US)</option></select></label><label>Status Meta<select class="model-meta-status"><option value="nao_configurado" ${m.meta_template_status==='nao_configurado'?'selected':''}>Não configurado</option><option value="rascunho" ${m.meta_template_status==='rascunho'?'selected':''}>Rascunho</option><option value="pendente" ${m.meta_template_status==='pendente'?'selected':''}>Em análise</option><option value="aprovado" ${m.meta_template_status==='aprovado'?'selected':''}>Aprovado</option><option value="rejeitado" ${m.meta_template_status==='rejeitado'?'selected':''}>Rejeitado</option><option value="pausado" ${m.meta_template_status==='pausado'?'selected':''}>Pausado</option></select></label><span class="status ${m.meta_template_status==='aprovado'?'ok':'warn'}">${m.meta_template_status==='aprovado'?'Pronto para envio':'Envio bloqueado'}</span></div>`}<label>Mensagem<textarea class="model-message">${escapeHtml(m.mensagem||'')}</textarea></label><div class="model-actions"><button class="btn primary mini save-model" type="button">Salvar modelo</button></div></article>`).join('');
}
async function loadComunicacoes(){
 if(!isRealMode()||!supabaseClient||!isTenantOwner())return;const imob=currentProfile.imobiliaria_id;
 const [q,m,w,em]=await Promise.all([supabaseClient.from('imob_comunicacoes').select('*').eq('imobiliaria_id',imob).order('criado_em',{ascending:false}).limit(100),supabaseClient.from('imob_comunicacao_modelos').select('*').eq('imobiliaria_id',imob).order('evento').order('canal'),supabaseClient.from('imob_whatsapp_canais').select('*').eq('imobiliaria_id',imob).maybeSingle(),supabaseClient.from('imob_email_canais').select('*').eq('imobiliaria_id',imob).maybeSingle()]);
 if(q.error)throw q.error;if(m.error)throw m.error;if(w.error && w.error.code!=='PGRST116')console.warn(w.error);if(em.error && em.error.code!=='PGRST116')console.warn(em.error);comunicacoes=q.data||[];comunicacaoModelos=m.data||[];whatsappCanal=w.data||null;emailCanal=em.data||null;renderComunicacoes();renderWhatsappCanal();renderEmailCanal();
}
let automacaoConfig=null;
let automacaoExecucoes=[];
const autoBeforeOptions=[1,2,3,5,7,10,15];
const autoLateOptions=[1,2,3,5,7,10,15,20,30,45,60];
function fmtDateTime(v){if(!v)return '-';try{return new Date(v).toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'});}catch(_){return v;}}
function renderRuleChecks(id,options,selected,prefix){const el=$('#'+id);if(!el)return;const set=new Set((selected||[]).map(Number));el.innerHTML=options.map(d=>`<label class="rule-chip"><input type="checkbox" value="${d}" ${set.has(d)?'checked':''}><span>${prefix}${d} dia${d===1?'':'s'}</span></label>`).join('');}
function renderAutomacoes(){
 const page=$('#automacoes');if(!page)return;page.style.display=isTenantOwner()?'':'none';if(!isTenantOwner())return;
 const cfgA=automacaoConfig||{};const f=$('#automacaoForm');if(f){f.elements.regua_cobranca_ativa.checked=cfgA.regua_cobranca_ativa!==false;f.elements.gerar_cobrancas_automaticamente.checked=cfgA.gerar_cobrancas_automaticamente!==false;}
 renderRuleChecks('diasAntesChecks',autoBeforeOptions,cfgA.dias_antes||[5,3],'-');renderRuleChecks('diasAtrasoChecks',autoLateOptions,cfgA.dias_atraso||[1,3,5,10,15,30],'+');
 const ok=cfgA.regua_cobranca_ativa!==false;$('#autoStatusKpi').textContent=ok?'Ativo':'Pausado';
 const successful=automacaoExecucoes.filter(x=>x.status==='sucesso');$('#autoGeradasKpi').textContent=successful.reduce((a,x)=>a+Number(x.cobrancas_geradas||0),0);$('#autoVencidasKpi').textContent=successful.reduce((a,x)=>a+Number(x.cobrancas_vencidas||0),0);$('#autoEventosKpi').textContent=successful.reduce((a,x)=>a+Number(x.eventos_gerados||0),0);
 const last=automacaoExecucoes[0];const lastBadge=$('#autoLastRun');if(lastBadge){lastBadge.textContent=last?`${last.status==='sucesso'?'Sucesso':'Erro'} · ${fmtDateTime(last.inicio_em)}`:'Sem execução';lastBadge.className='status '+(last?.status==='sucesso'?'ok':last?'warn':'');}
 const body=$('#automacoesHistorico');if(body)body.innerHTML=automacaoExecucoes.map(x=>`<tr><td>${fmtDateTime(x.inicio_em)}</td><td><span class="status ${x.status==='sucesso'?'ok':'warn'}">${x.status==='sucesso'?'Sucesso':x.status==='erro'?'Erro':'Executando'}</span></td><td>${x.cobrancas_geradas||0}</td><td>${x.cobrancas_vencidas||0}</td><td>${x.eventos_gerados||0}</td><td>${escapeHtml(x.detalhes?.executado_por||'backend')}</td><td>${x.erro?`<span class="auto-error" title="${escapeHtml(x.erro)}">${escapeHtml(x.erro)}</span>`:'—'}</td></tr>`).join('')||'<tr><td colspan="7" class="muted">Nenhuma execução registrada.</td></tr>';
}
async function loadAutomacoes(){
 if(!isTenantOwner()||!isRealMode()||!supabaseClient||!currentProfile?.imobiliaria_id)return;
 const imob=currentProfile.imobiliaria_id;
 const [c,e]=await Promise.all([supabaseClient.from('imob_automacao_config').select('*').eq('imobiliaria_id',imob).maybeSingle(),supabaseClient.from('imob_automacao_execucoes').select('*').eq('imobiliaria_id',imob).order('inicio_em',{ascending:false}).limit(30)]);
 if(c.error)throw c.error;if(e.error)throw e.error;automacaoConfig=c.data;automacaoExecucoes=e.data||[];renderAutomacoes();
}
$('#automacaoForm')?.addEventListener('submit',async e=>{e.preventDefault();if(!isTenantOwner())return;const f=e.currentTarget;const diasAntes=[...$('#diasAntesChecks').querySelectorAll('input:checked')].map(x=>Number(x.value)).sort((a,b)=>a-b);const diasAtraso=[...$('#diasAtrasoChecks').querySelectorAll('input:checked')].map(x=>Number(x.value)).sort((a,b)=>a-b);const payload={regua_cobranca_ativa:f.elements.regua_cobranca_ativa.checked,gerar_cobrancas_automaticamente:f.elements.gerar_cobrancas_automaticamente.checked,dias_antes:diasAntes,dias_atraso:diasAtraso,atualizado_em:new Date().toISOString()};const r=await supabaseClient.from('imob_automacao_config').update(payload).eq('imobiliaria_id',currentProfile.imobiliaria_id).select().single();if(r.error){alert('Não foi possível salvar: '+r.error.message);return;}automacaoConfig=r.data;renderAutomacoes();const st=$('#autoSaveState');if(st){st.textContent='Salvo agora';setTimeout(()=>st.textContent='Configuração carregada',2500);}});
$('#refreshAutomacoes')?.addEventListener('click',async()=>{try{await loadAutomacoes();}catch(err){alert(err.message||err);}});
$('#executarAutomacoesAgora')?.addEventListener('click',async()=>{if(!isTenantOwner())return;const b=$('#executarAutomacoesAgora');if(!confirm('Executar agora a automação de cobranças desta imobiliária?'))return;const old=b.textContent;b.disabled=true;b.textContent='Executando...';try{const {data,error}=await supabaseClient.rpc('imob_executar_automacao_agora');if(error)throw error;await Promise.all([loadAutomacoes(),loadRealCobrancas()]);renderAll();await loadComunicacoes();showToast(`Automação concluída · ${data?.cobrancas_geradas||0} geradas · ${data?.cobrancas_vencidas||0} vencidas · ${data?.eventos_gerados||0} eventos`,'success');}catch(err){alert('Não foi possível executar: '+(err.message||err));}finally{b.disabled=false;b.textContent=old;}});

$('#refreshComunicacoes')?.addEventListener('click',async()=>{try{await loadComunicacoes();showToast('Fila de comunicação atualizada.');}catch(err){showToast(err.message||String(err),'error');}});
function renderWhatsappCanal(){
 const f=$('#whatsappCanalForm');if(!f)return;const w=whatsappCanal||{};
 f.elements.waba_id.value=w.waba_id||'';f.elements.phone_number_id.value=w.phone_number_id||'';f.elements.numero_exibicao.value=w.numero_exibicao||'';f.elements.nome_exibicao.value=w.nome_exibicao||'';f.elements.ativo.checked=!!w.ativo;
 const st=w.status||'nao_configurado';$('#waGatewayStatus').textContent=st==='conectado'?'Conectado':st==='configurando'?'Em configuração':st==='erro'?'Erro de configuração':'Não configurado';$('#waGatewayNumber').textContent=w.numero_exibicao||'Nenhum número conectado';$('#waGatewayBadge').textContent=st==='conectado'?'Conectado':'Configuração';$('#waGatewayBadge').className='status '+(st==='conectado'?'connected':'configuring');
}
$('#whatsappCanalForm')?.addEventListener('submit',async e=>{e.preventDefault();if(!isTenantOwner())return;const f=e.currentTarget;const payload={waba_id:f.elements.waba_id.value.trim()||null,phone_number_id:f.elements.phone_number_id.value.trim()||null,numero_exibicao:f.elements.numero_exibicao.value.trim()||null,nome_exibicao:f.elements.nome_exibicao.value.trim()||null,ativo:f.elements.ativo.checked,status:f.elements.phone_number_id.value.trim()?'configurando':'nao_configurado',atualizado_em:new Date().toISOString()};try{const {data,error}=await supabaseClient.from('imob_whatsapp_canais').update(payload).eq('imobiliaria_id',currentProfile.imobiliaria_id).select().single();if(error)throw error;whatsappCanal=data;renderWhatsappCanal();showToast('Configuração do canal WhatsApp salva.','success');}catch(err){showToast('Não foi possível salvar: '+(err.message||err),'error');}});


function renderEmailCanal(){
 const f=$('#emailCanalForm');if(!f)return;const c=emailCanal||{};
 f.elements.provedor.value=c.provedor||'resend';f.elements.remetente_nome.value=c.remetente_nome||'';f.elements.remetente_email.value=c.remetente_email||'';f.elements.reply_to.value=c.reply_to||'';f.elements.ativo.checked=!!c.ativo;
 const st=c.status||'nao_configurado';$('#emailGatewayStatus').textContent=st==='conectado'?'Conectado':st==='configurando'?'Em configuração':st==='erro'?'Erro de configuração':'Não configurado';$('#emailGatewayAddress').textContent=c.remetente_email||'Nenhum remetente conectado';$('#emailGatewayBadge').textContent=st==='conectado'?'Conectado':'Configuração';$('#emailGatewayBadge').className='status '+(st==='conectado'?'connected':'configuring');
}
$('#emailCanalForm')?.addEventListener('submit',async e=>{e.preventDefault();if(!isTenantOwner())return;const f=e.currentTarget;const payload={provedor:f.elements.provedor.value,remetente_nome:f.elements.remetente_nome.value.trim()||null,remetente_email:f.elements.remetente_email.value.trim()||null,reply_to:f.elements.reply_to.value.trim()||null,ativo:f.elements.ativo.checked,status:f.elements.remetente_email.value.trim()?'configurando':'nao_configurado',atualizado_em:new Date().toISOString()};try{const {data,error}=await supabaseClient.from('imob_email_canais').update(payload).eq('imobiliaria_id',currentProfile.imobiliaria_id).select().single();if(error)throw error;emailCanal=data;renderEmailCanal();showToast('Configuração do canal de e-mail salva.','success');}catch(err){showToast('Não foi possível salvar: '+(err.message||err),'error');}});
$('#testarGatewayEmail')?.addEventListener('click',()=>{if(!emailCanal?.remetente_email){showToast('Informe primeiro o e-mail do remetente.','error');return;}showToast(emailCanal?.status==='conectado'?'Gateway de e-mail pronto para envio.':'Remetente cadastrado. Falta salvar a API key no Vault e marcar o canal como conectado.');});
$('#enviarEmailPendentes')?.addEventListener('click',async()=>{if(!isTenantOwner())return;if(!emailCanal?.ativo||emailCanal?.status!=='conectado'){showToast('O canal de e-mail ainda não está conectado.','error');return;}const pendentes=comunicacoes.filter(x=>x.canal==='email'&&x.status==='pendente').length;if(!pendentes){showToast('Não há e-mails pendentes.');return;}const b=$('#enviarEmailPendentes'),old=b.textContent;b.disabled=true;b.textContent='Enviando...';try{const {data,error}=await supabaseClient.functions.invoke('imob-email-send',{body:{limite:Math.min(pendentes,50)}});if(error)throw error;await loadComunicacoes();showToast(`E-mail: ${data?.enviadas||0} enviado(s), ${data?.erros||0} erro(s).`,data?.erros?'error':'success');}catch(err){showToast('Envio de e-mail não executado: '+(err.message||err),'error');}finally{b.disabled=false;b.textContent=old;}});

$('#enviarWhatsappPendentes')?.addEventListener('click',async()=>{if(!isTenantOwner())return;if(!whatsappCanal?.ativo||whatsappCanal?.status!=='conectado'){showToast('O canal WhatsApp ainda não está conectado. A fila permanecerá protegida até a configuração da Meta ser concluída.','error');return;}const pendentes=comunicacoes.filter(x=>x.canal==='whatsapp'&&x.status==='pendente').length;if(!pendentes){showToast('Não há mensagens WhatsApp pendentes.');return;}const b=$('#enviarWhatsappPendentes');const old=b.textContent;b.disabled=true;b.textContent='Enviando...';try{const {data,error}=await supabaseClient.functions.invoke('imob-whatsapp-send',{body:{limit:Math.min(pendentes,50)}});if(error)throw error;await loadComunicacoes();showToast(`WhatsApp: ${data?.enviadas||0} enviada(s), ${data?.bloqueadas||0} bloqueada(s), ${data?.erros||0} erro(s).`,data?.erros?'error':'success');}catch(err){showToast('Envio não executado: '+(err.message||err),'error');}finally{b.disabled=false;b.textContent=old;}});

$('#testarGatewayWhatsapp')?.addEventListener('click',async()=>{if(!whatsappCanal?.phone_number_id){showToast('Informe primeiro o Phone Number ID da imobiliária.','error');return;}showToast('IDs cadastrados. O teste real será liberado após o token ser salvo no Vault e o webhook validado.');});

document.addEventListener('click',async e=>{
 const tab=e.target.closest('[data-com-tab]');if(tab){document.querySelectorAll('[data-com-tab]').forEach(x=>x.classList.toggle('active',x===tab));$('#comFilaPane').hidden=tab.dataset.comTab!=='fila';$('#comModelosPane').hidden=tab.dataset.comTab!=='modelos';$('#comWhatsappPane').hidden=tab.dataset.comTab!=='whatsapp';$('#comEmailPane').hidden=tab.dataset.comTab!=='email';}
 const save=e.target.closest('.save-model');if(save){const card=save.closest('[data-model-id]');const id=card.dataset.modelId;const payload={ativo:card.querySelector('.model-active').checked,mensagem:card.querySelector('.model-message').value.trim(),assunto:card.querySelector('.model-subject')?.value.trim()||null,atualizado_em:new Date().toISOString()};if(card.querySelector('.model-meta-name')){payload.meta_template_name=card.querySelector('.model-meta-name').value.trim()||null;payload.meta_template_language=card.querySelector('.model-meta-language').value;payload.meta_template_status=card.querySelector('.model-meta-status').value;payload.meta_template_category='UTILITY';}save.disabled=true;try{const {error}=await supabaseClient.from('imob_comunicacao_modelos').update(payload).eq('id',id).eq('imobiliaria_id',currentProfile.imobiliaria_id);if(error)throw error;await loadComunicacoes();showToast('Modelo de mensagem salvo.');}catch(err){showToast('Não foi possível salvar: '+(err.message||err),'error');}finally{save.disabled=false;}}
});

function renderAll(){renderImoveis();renderProps();renderOthers();renderKPIs();renderConfig();renderEquipe();loadMasterPlanos();bindActions();
 Object.keys(smartCfg).forEach(renderSmart);
}
['searchImovel','filterFinalidade','filterStatus'].forEach(id=>{const el=$('#'+id);if(el)el.addEventListener('input',renderImoveis)});

let editMode={type:null,id:null};
const schemas={
 inquilinos:[['nome','Nome','text'],['documento','CPF/CNPJ','text'],['telefone','Telefone','text'],['email','E-mail','email'],['status','Status','select',['Em dia','Documento pendente','Inativo']]],
 contratos:[['codigo','Código','text'],['imovel','Imóvel','text'],['inquilino','Inquilino','text'],['valor','Aluguel','number'],['vencimento','Dia vencimento','number'],['status','Status','select',['Ativo','Atrasado','Encerrado']]],
 documentos:[['nome','Nome do arquivo','text'],['categoria','Categoria','select',['Contrato','Inquilino','Imóvel','Vistoria','Comprovante']],['vinculo','Vinculado a','text'],['data','Data','date'],['status','Status','select',['Pendente','Validado','Arquivado']]],
 imobiliarias:[['nome','Imobiliária','text'],['creci','CRECI','text'],['plano','Plano','text'],['cor','Cor principal','color'],['status','Status','select',['Ativa','Inativa']]]
};
const realSchemas={
 cobrancas:[
  ['contrato_id','Contrato','relation','contratos',true],['competencia','Competência','date',null,true],['data_vencimento','Vencimento','date',null,true],
  ['valor_base','Valor base','number',null,true],['valor_multa','Multa','number'],['valor_juros','Juros','number'],['valor_desconto','Desconto','number'],
  ['status','Status','select',[['pendente','Pendente'],['pago','Pago'],['vencido','Vencido'],['cancelado','Cancelado'],['parcial','Parcial']],true],
  ['forma_pagamento','Forma de pagamento','text'],['observacoes','Observações','textarea']
 ],
 financeiro:[
  ['contrato_id','Contrato','relation','contratos'],['proprietario_id','Proprietário','relation','proprietarios'],
  ['tipo','Tipo','select',[['receita_imobiliaria','Receita imobiliária'],['repasse_proprietario','Repasse proprietário'],['despesa','Despesa'],['ajuste','Ajuste'],['estorno','Estorno']],true],
  ['categoria','Categoria','text'],['descricao','Descrição','text',null,true],['competencia','Competência','date'],['data_lancamento','Data do lançamento','date',null,true],
  ['data_vencimento','Vencimento','date'],['valor','Valor','number',null,true],['status','Status','select',[['pendente','Pendente'],['pago','Pago'],['cancelado','Cancelado']],true],
  ['forma_pagamento','Forma de pagamento','text'],['observacoes','Observações','textarea']
 ],
 vendas:[
  ['imovel_id','Imóvel','relation','imoveis',true],['cliente_nome','Cliente','text',null,true],['cliente_email','E-mail do cliente','email'],['cliente_telefone','Telefone do cliente','text'],
  ['etapa','Etapa','select',[['lead','Lead'],['visita','Visita'],['proposta','Proposta'],['fechamento','Fechamento'],['concluida','Concluída'],['cancelada','Cancelada']],true],
  ['valor_negociacao','Valor da negociação','number'],['comissao_percentual','Comissão %','number'],['corretor_nome','Corretor','text'],['data_proxima_acao','Próxima ação','date'],['observacoes','Observações','textarea']
 ],
 vistorias:[
  ['imovel_id','Imóvel','relation','imoveis',true],['contrato_id','Contrato','relation','contratos'],['data_vistoria','Data da vistoria','date',null,true],
  ['tipo','Tipo','select',[['entrada','Entrada'],['saida','Saída'],['periodica','Periódica']],true],['responsavel','Responsável','text'],
  ['status','Status','select',[['agendada','Agendada'],['em_andamento','Em andamento'],['concluida','Concluída'],['cancelada','Cancelada']],true],['laudo','Laudo / resumo','textarea'],['observacoes','Observações','textarea']
 ],
 manutencoes:[
  ['imovel_id','Imóvel','relation','imoveis',true],['contrato_id','Contrato','relation','contratos'],['codigo','Código','text'],['descricao','Descrição','textarea',null,true],
  ['solicitante','Solicitante','text'],['prioridade','Prioridade','select',[['baixa','Baixa'],['media','Média'],['alta','Alta'],['urgente','Urgente']],true],
  ['status','Status','select',[['aberto','Aberto'],['aguardando_proprietario','Aguardando proprietário'],['em_execucao','Em execução'],['concluido','Concluído'],['cancelado','Cancelado']],true],
  ['valor_estimado','Valor estimado','number'],['valor_final','Valor final','number'],['fornecedor','Fornecedor','text'],
  ['autorizacao_proprietario','Autorização do proprietário','select',[['false','Não'],['true','Sim']]],['data_abertura','Data de abertura','date'],['data_conclusao','Data de conclusão','date'],['observacoes','Observações','textarea']
 ]
};
const realTableMap={cobrancas:'imob_cobrancas',financeiro:'imob_financeiro',vendas:'imob_vendas',vistorias:'imob_vistorias',manutencoes:'imob_manutencoes'};
const realLoaderMap={cobrancas:loadRealCobrancas,financeiro:loadRealFinanceiro,vendas:loadRealVendas,vistorias:loadRealVistorias,manutencoes:loadRealManutencoes};
function relationItems(kind,imobiliariaId){
 if(kind==='imoveis')return imoveis.filter(x=>!imobiliariaId||String(x.imobiliaria_id)===String(imobiliariaId)).map(x=>[x.id,`${x.codigo?x.codigo+' · ':''}${x.titulo}`]);
 if(kind==='contratos')return db.contratos.filter(x=>!imobiliariaId||String(x.imobiliaria_id)===String(imobiliariaId)).map(x=>[x.id,`${x.codigo||'Contrato'} · ${x.imovel||''}`]);
 if(kind==='proprietarios')return props.filter(x=>!imobiliariaId||String(x.imobiliaria_id)===String(imobiliariaId)).map(x=>[x.id,x.nome]);
 return [];
}
function renderGenericField(def,item,imobId){
 const [n,l,t,opts,required]=def,val=item?.[n]??'';const req=required?' required':'';
 if(t==='textarea')return `<label class="full">${l}<textarea name="${n}" rows="3"${req}>${escapeHtml(String(val||''))}</textarea></label>`;
 if(t==='select'){const arr=opts||[];return `<label>${l}<select name="${n}"${req}>${arr.map(o=>{const v=Array.isArray(o)?o[0]:o,lab=Array.isArray(o)?o[1]:o;return `<option value="${escapeHtml(String(v))}" ${String(val)===String(v)?'selected':''}>${escapeHtml(String(lab))}</option>`}).join('')}</select></label>`;}
 if(t==='relation'){const arr=relationItems(opts,imobId);return `<label>${l}<select name="${n}"${req}><option value="">${required?'Selecione':'Opcional'}</option>${arr.map(([v,lab])=>`<option value="${v}" ${String(val)===String(v)?'selected':''}>${escapeHtml(lab)}</option>`).join('')}</select></label>`;}
 return `<label>${l}<input name="${n}" type="${t}" ${t==='number'?'step="0.01"':''} value="${escapeHtml(String(val??''))}"${req}></label>`;
}
function genericOpen(type,item=null,preset={}){
 editMode={type,id:item?.id||null};$('#genericTitle').textContent=(item?'Editar ':'Novo ')+type;
 if(!item&&preset&&Object.keys(preset).length)item={...preset};
 const real=isRealMode()&&realSchemas[type];
 if(real){
   const formItem={...(item||{})};
   if(type==='cobrancas'&&item?.status_raw)formItem.status=item.status_raw;
   if(type==='financeiro'){if(item?.tipo_raw)formItem.tipo=item.tipo_raw;if(item?.status_raw)formItem.status=item.status_raw;}
   if(type==='vendas'&&item?.etapa_raw)formItem.etapa=item.etapa_raw;
   if(type==='vistorias'){if(item?.tipo_raw)formItem.tipo=item.tipo_raw;if(item?.status_raw)formItem.status=item.status_raw;}
   if(type==='manutencoes'){if(item?.prioridade_raw)formItem.prioridade=item.prioridade_raw;if(item?.status_raw)formItem.status=item.status_raw;}
   const master=currentProfile?.perfil==='admin_master';const defaultImob=formItem?.imobiliaria_id||currentProfile?.imobiliaria_id||'';
   let agency='';if(master)agency=`<label>Imobiliária<select id="genericImobiliaria" name="imobiliaria_id" required><option value="">Selecione</option>${db.imobiliarias.map(i=>`<option value="${i.id}" ${String(defaultImob)===String(i.id)?'selected':''}>${escapeHtml(i.nome)}</option>`).join('')}</select></label>`;
   const supportsIntegratedAttachments=['financeiro','vistorias','manutencoes'].includes(type);
   const attachmentField=supportsIntegratedAttachments?`<label class="full integrated-attachments"><b>📎 Anexos</b><input id="genericAnexos" name="anexos" type="file" accept="application/pdf,image/jpeg,image/png,image/webp,.doc,.docx" multiple><small class="muted">Fotos, PDF ou Word. Selecione vários arquivos, até 20 MB por arquivo.</small></label>`:'';
   $('#genericFields').innerHTML=agency+realSchemas[type].map(d=>renderGenericField(d,formItem,defaultImob)).join('')+attachmentField;
 }else{
   const fields=schemas[type];$('#genericFields').innerHTML=fields.map(([n,l,t,opts])=>{if(t==='select')return `<label>${l}<select name="${n}">${opts.map(o=>`<option ${item?.[n]===o?'selected':''}>${o}</option>`).join('')}</select></label>`;return `<label>${l}<input name="${n}" type="${t}" ${t==='number'?'step="0.01"':''} value="${item?.[n]??''}" required></label>`}).join('');
 }
 if(!$('#genericDialog').open)$('#genericDialog').showModal();
}
$('#genericCancel').onclick=()=>$('#genericDialog').close();
const INTEGRATED_DOC_MIMES=['application/pdf','image/jpeg','image/png','image/webp','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
async function uploadIntegratedAttachments(files,{imobiliariaId,tipoVinculo,referenciaId,imovelId=null,categoria='Anexo'}){
 if(!files?.length)return 0;
 if(!isRealMode()||!supabaseClient)throw new Error('O envio de anexos exige o Supabase conectado.');
 let sent=0;
 for(const file of Array.from(files)){
   if(file.size>20*1024*1024)throw new Error(file.name+': arquivo maior que 20 MB.');
   if(!INTEGRATED_DOC_MIMES.includes(file.type))throw new Error(file.name+': tipo de arquivo não permitido.');
   const ext=(file.name.split('.').pop()||'bin').replace(/[^a-z0-9]/gi,'').toLowerCase();
   const safeBase=file.name.replace(/\.[^.]+$/,'').replace(/[^a-zA-Z0-9_-]+/g,'-').slice(0,60)||'anexo';
   const path=`${imobiliariaId}/${tipoVinculo}/${referenciaId}/${Date.now()}-${crypto.randomUUID?.()||Math.random().toString(36).slice(2)}-${safeBase}.${ext}`;
   const up=await supabaseClient.storage.from('imob-documentos').upload(path,file,{upsert:false,contentType:file.type});if(up.error)throw up.error;
   const payload={imobiliaria_id:imobiliariaId,tipo_vinculo:tipoVinculo,categoria,nome_arquivo:file.name,caminho_storage:path,mime_type:file.type,tamanho_bytes:file.size,data_documento:new Date().toISOString().slice(0,10),enviado_por:currentProfile?.id||null};
   if(imovelId)payload.imovel_id=imovelId;
   if(tipoVinculo==='contrato')payload.contrato_id=referenciaId;
   if(tipoVinculo==='financeiro')payload.financeiro_id=referenciaId;
   if(tipoVinculo==='vistoria')payload.vistoria_id=referenciaId;
   if(tipoVinculo==='manutencao')payload.manutencao_id=referenciaId;
   const ins=await supabaseClient.from('imob_documentos').insert(payload).select().single();
   if(ins.error){await supabaseClient.storage.from('imob-documentos').remove([path]);throw ins.error;}
   sent++;
 }
 await loadRealDocumentos();return sent;
}
$('#genericForm').addEventListener('submit',async e=>{
 e.preventDefault();const fd=new FormData(e.target);const obj=Object.fromEntries(fd);const type=editMode.type;const integratedFiles=Array.from($('#genericAnexos')?.files||[]);delete obj.anexos;
 if(isRealMode()&&realSchemas[type]&&supabaseClient){
   const imobId=currentProfile?.perfil==='admin_master'?obj.imobiliaria_id:currentProfile?.imobiliaria_id;if(!imobId){alert('Selecione a imobiliária.');return;}
   const payload={imobiliaria_id:imobId,atualizado_em:new Date().toISOString()};
   for(const [n,,t] of realSchemas[type]){let v=obj[n];if(v==='')v=null;if(t==='number'&&v!=null)v=Number(v);if(n==='autorizacao_proprietario')v=String(obj[n])==='true';payload[n]=v;}
   if(type==='cobrancas'){payload.valor_total=Math.max(0,Number(payload.valor_base||0)+Number(payload.valor_multa||0)+Number(payload.valor_juros||0)-Number(payload.valor_desconto||0));}
   if(type==='manutencoes'&&!payload.data_abertura)payload.data_abertura=new Date().toISOString().slice(0,10);
   try{const q=editMode.id?supabaseClient.from(realTableMap[type]).update(payload).eq('id',editMode.id):supabaseClient.from(realTableMap[type]).insert(payload);const r=await q.select().single();if(r.error)throw r.error;if(integratedFiles.length&&['financeiro','vistorias','manutencoes'].includes(type)){const vinculo=type==='vistorias'?'vistoria':(type==='manutencoes'?'manutencao':'financeiro');const cat=type==='vistorias'?'Vistoria':(type==='manutencoes'?'Manutenção':'Comprovante');await uploadIntegratedAttachments(integratedFiles,{imobiliariaId:imobId,tipoVinculo:vinculo,referenciaId:r.data.id,imovelId:r.data.imovel_id||payload.imovel_id||null,categoria:cat});}await realLoaderMap[type]();if(type==='cobrancas')await loadRealFinanceiro();$('#genericDialog').close();renderAll();if(imovelDetalheAtual)await refreshImovelDetalhe();}
   catch(err){alert('Não foi possível salvar: '+(err.message||err));}return;
 }
 schemas[type].forEach(([n,,t])=>{if(t==='number')obj[n]=Number(obj[n]||0)});let arr=db[type];if(editMode.id){Object.assign(arr.find(x=>String(x.id)===String(editMode.id)),obj)}else{arr.unshift({id:Date.now(),...obj})}persistAll();$('#genericDialog').close();renderAll();
});


function fillDocumentoImobiliarias(selected=''){
 const wrap=$('#documentoImobWrap'),sel=$('#documentoImobiliaria'); if(!wrap||!sel)return;
 const master=currentProfile?.perfil==='admin_master'&&isRealMode();wrap.style.display=master?'':'none';sel.required=master;
 if(master)sel.innerHTML='<option value="">Selecione a imobiliária</option>'+db.imobiliarias.map(i=>`<option value="${i.id}" ${String(i.id)===String(selected)?'selected':''}>${escapeHtml(i.nome)}</option>`).join('');
 else sel.innerHTML=currentProfile?.imobiliaria_id?`<option value="${currentProfile.imobiliaria_id}" selected></option>`:'';
}
async function fillDocumentoReferencias(){
 const type=$('#documentoTipoVinculo')?.value||'imovel'; const wrap=$('#documentoReferenciaWrap'),sel=$('#documentoReferencia');if(!wrap||!sel)return;
 const imobId=currentProfile?.perfil==='admin_master'?$('#documentoImobiliaria').value:currentProfile?.imobiliaria_id;
 if(type==='geral'){wrap.style.display='none';sel.required=false;sel.innerHTML='';return;}
 wrap.style.display='grid';sel.required=true;sel.innerHTML='<option value="">Carregando...</option>';
 let items=[];
 try{
   if(type==='imovel')items=imoveis.filter(x=>!imobId||String(x.imobiliaria_id)===String(imobId)).map(x=>({id:x.id,nome:`${x.codigo?x.codigo+' · ':''}${x.titulo}`}));
   else if(type==='proprietario')items=props.filter(x=>!imobId||String(x.imobiliaria_id)===String(imobId)).map(x=>({id:x.id,nome:x.nome}));
   else if(type==='inquilino')items=db.inquilinos.filter(x=>x.ativo!==false&&(!imobId||String(x.imobiliaria_id)===String(imobId))).map(x=>({id:x.id,nome:x.nome}));
   else if(isRealMode()&&supabaseClient&&imobId&&type==='contrato'){
     const r=await supabaseClient.from('imob_contratos').select('id,codigo').eq('imobiliaria_id',imobId).eq('ativo',true).order('criado_em',{ascending:false});if(r.error)throw r.error;items=(r.data||[]).map(x=>({id:x.id,nome:x.codigo||'Contrato'}));
   }
   else if(isRealMode()&&supabaseClient&&imobId&&type==='financeiro'){
     const r=await supabaseClient.from('imob_financeiro').select('id,descricao,tipo,valor,data_lancamento').eq('imobiliaria_id',imobId).order('data_lancamento',{ascending:false}).limit(200);if(r.error)throw r.error;items=(r.data||[]).map(x=>({id:x.id,nome:`${x.descricao||financeiroTipoLabel(x.tipo)} · ${brl(x.valor||0)}`}));
   }
   else if(isRealMode()&&supabaseClient&&imobId&&type==='vistoria'){
     const r=await supabaseClient.from('imob_vistorias').select('id,tipo,data_vistoria,imovel_id').eq('imobiliaria_id',imobId).order('data_vistoria',{ascending:false}).limit(200);if(r.error)throw r.error;items=(r.data||[]).map(x=>({id:x.id,nome:`${vistoriaTipoLabel(x.tipo)} · ${formatDateBR(x.data_vistoria)} · ${imovelById(x.imovel_id)?.codigo||'Imóvel'}`}));
   }
   else if(isRealMode()&&supabaseClient&&imobId&&type==='manutencao'){
     const r=await supabaseClient.from('imob_manutencoes').select('id,codigo,descricao,imovel_id').eq('imobiliaria_id',imobId).order('criado_em',{ascending:false}).limit(200);if(r.error)throw r.error;items=(r.data||[]).map(x=>({id:x.id,nome:`${x.codigo||'Manutenção'} · ${x.descricao||imovelById(x.imovel_id)?.codigo||''}`}));
   }
   sel.innerHTML='<option value="">Selecione</option>'+items.map(x=>`<option value="${x.id}">${escapeHtml(x.nome)}</option>`).join('');
 }catch(err){sel.innerHTML='<option value="">Não foi possível carregar</option>';console.warn(err)}
}
async function openDocumentoModal(defaults={}){
 documentoSelecionado=defaults; const f=$('#documentoForm');f.reset();fillDocumentoImobiliarias(defaults.imobiliaria_id||currentProfile?.imobiliaria_id||'');
 $('#documentoTipoVinculo').value=defaults.tipo_vinculo||'imovel'; await fillDocumentoReferencias(); if(defaults.referencia_id)$('#documentoReferencia').value=defaults.referencia_id;
 $('#documentoDialog').showModal();
}
$('#novoDocumentoBtn')?.addEventListener('click',()=>openDocumentoModal());
$('#documentoClose')?.addEventListener('click',()=>$('#documentoDialog').close());
$('#documentoCancel')?.addEventListener('click',()=>$('#documentoDialog').close());
$('#documentoTipoVinculo')?.addEventListener('change',fillDocumentoReferencias);
$('#documentoImobiliaria')?.addEventListener('change',fillDocumentoReferencias);
$('#documentoForm')?.addEventListener('submit',async e=>{
 e.preventDefault();if(!isRealMode()||!supabaseClient){alert('O upload privado de documentos exige o Supabase conectado.');return;}
 const fd=new FormData(e.target),o=Object.fromEntries(fd);const file=$('#documentoArquivo').files?.[0];
 const imobId=currentProfile?.perfil==='admin_master'?o.imobiliaria_id:currentProfile?.imobiliaria_id;
 if(!imobId||!file){alert('Selecione a imobiliária e o arquivo.');return;} if(file.size>20*1024*1024){alert('O arquivo ultrapassa 20 MB.');return;}
 const tipos=['application/pdf','image/jpeg','image/png','image/webp','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document'];if(!tipos.includes(file.type)){alert('Tipo de arquivo não permitido.');return;}
 const ref=o.tipo_vinculo==='geral'?'geral':o.referencia_id;if(o.tipo_vinculo!=='geral'&&!ref){alert('Selecione o registro relacionado.');return;}
 const ext=(file.name.split('.').pop()||'bin').replace(/[^a-z0-9]/gi,'').toLowerCase();const safeBase=file.name.replace(/\.[^.]+$/,'').replace(/[^a-zA-Z0-9_-]+/g,'-').slice(0,60)||'documento';
 const path=`${imobId}/${o.tipo_vinculo}/${ref}/${Date.now()}-${crypto.randomUUID?.()||Math.random().toString(36).slice(2)}-${safeBase}.${ext}`;
 const btn=$('#salvarDocumento');btn.disabled=true;btn.textContent='Enviando...';
 try{
   const up=await supabaseClient.storage.from('imob-documentos').upload(path,file,{upsert:false,contentType:file.type});if(up.error)throw up.error;
   const payload={imobiliaria_id:imobId,tipo_vinculo:o.tipo_vinculo,categoria:o.categoria,nome_arquivo:file.name,caminho_storage:path,mime_type:file.type,tamanho_bytes:file.size,data_documento:o.data_documento||null,data_validade:o.data_validade||null,observacoes:o.observacoes?.trim()||null,enviado_por:currentProfile?.id||null};
   if(o.tipo_vinculo==='imovel')payload.imovel_id=ref;if(o.tipo_vinculo==='proprietario')payload.proprietario_id=ref;if(o.tipo_vinculo==='inquilino')payload.inquilino_id=ref;if(o.tipo_vinculo==='contrato')payload.contrato_id=ref;if(o.tipo_vinculo==='financeiro')payload.financeiro_id=ref;if(o.tipo_vinculo==='vistoria')payload.vistoria_id=ref;if(o.tipo_vinculo==='manutencao')payload.manutencao_id=ref;
   const ins=await supabaseClient.from('imob_documentos').insert(payload).select().single();if(ins.error){await supabaseClient.storage.from('imob-documentos').remove([path]);throw ins.error;}
   await loadRealDocumentos();$('#documentoDialog').close();renderAll();if(imovelDetalheAtual)await refreshImovelDetalhe();
 }catch(err){alert('Não foi possível enviar o documento: '+(err.message||err));}
 finally{btn.disabled=false;btn.textContent='Enviar documento';}
});

function detailEmpty(text){return `<div class="detail-empty">${escapeHtml(text)}</div>`}
function infoGrid(items){return `<div class="detail-info-grid">${items.map(([l,v])=>`<div><small>${escapeHtml(l)}</small><strong>${v==null||v===''?'-':escapeHtml(String(v))}</strong></div>`).join('')}</div>`}
async function loadImovelDetalheDados(item){
 const docsDiretos=(db.documentos||[]).filter(d=>String(d.imovel_id)===String(item.id));let contratos=[],financeiro=[],docsContrato=[],vistorias=[],manutencoes=[],docsFinanceiro=[],docsVistorias=[],docsManutencoes=[];
 if(isRealMode()&&supabaseClient){
   const cr=await supabaseClient.from('imob_contratos').select('id,codigo,status,data_inicio,data_fim,valor_aluguel,dia_vencimento,inquilino_id').eq('imovel_id',item.id).order('criado_em',{ascending:false});if(!cr.error)contratos=cr.data||[];
   const ids=contratos.map(c=>c.id);if(ids.length){
     const dr=await supabaseClient.from('imob_documentos').select('*').in('contrato_id',ids).eq('ativo',true).order('criado_em',{ascending:false});if(!dr.error)docsContrato=(dr.data||[]).map(x=>({...x,nome:x.nome_arquivo,data:x.criado_em,status:'Privado'}));
     const fr=await supabaseClient.from('imob_financeiro').select('*').in('contrato_id',ids).order('data_lancamento',{ascending:false});if(!fr.error)financeiro=fr.data||[];
   }
 }
 if(isRealMode()&&supabaseClient){const vr=await supabaseClient.from('imob_vistorias').select('*').eq('imovel_id',item.id).order('data_vistoria',{ascending:false});if(!vr.error)vistorias=vr.data||[];const mr=await supabaseClient.from('imob_manutencoes').select('*').eq('imovel_id',item.id).order('criado_em',{ascending:false});if(!mr.error)manutencoes=mr.data||[];
   const fids=financeiro.map(x=>x.id);if(fids.length){const r=await supabaseClient.from('imob_documentos').select('*').in('financeiro_id',fids).eq('ativo',true).order('criado_em',{ascending:false});if(!r.error)docsFinanceiro=r.data||[];}
   const vids=vistorias.map(x=>x.id);if(vids.length){const r=await supabaseClient.from('imob_documentos').select('*').in('vistoria_id',vids).eq('ativo',true).order('criado_em',{ascending:false});if(!r.error)docsVistorias=r.data||[];}
   const mids=manutencoes.map(x=>x.id);if(mids.length){const r=await supabaseClient.from('imob_documentos').select('*').in('manutencao_id',mids).eq('ativo',true).order('criado_em',{ascending:false});if(!r.error)docsManutencoes=r.data||[];}
 }
 return {documentos:[...docsDiretos,...docsContrato],contratos,financeiro,vistorias,manutencoes,docsFinanceiro,docsVistorias,docsManutencoes};
}
function renderImovelDetalhe(tab='resumo'){
 const i=imovelDetalheAtual;if(!i)return;const p=props.find(x=>String(x.id)===String(i.proprietario_id));const d=imovelDetalheDados;let html='';
 $$('#imovelDetalheTabs [data-detail-tab]').forEach(b=>b.classList.toggle('active',b.dataset.detailTab===tab));
 if(tab==='resumo')html=`<div class="detail-hero"><div class="detail-main-photo" style="background-image:url('${escapeHtml(i.foto||fallbackPhoto)}')"></div><div>${infoGrid([['Código',i.codigo],['Finalidade',i.finalidade],['Status',i.status],['Tipo',i.tipo_imovel],['Venda',i.valor_venda?brl(i.valor_venda):'-'],['Locação',i.valor_locacao?brl(i.valor_locacao)+'/mês':'-'],['Condomínio',i.valor_condominio?brl(i.valor_condominio):'-'],['IPTU',i.valor_iptu?brl(i.valor_iptu):'-'],['Dormitórios',i.quartos||0],['Suítes',i.suites||0],['Banheiros',i.banheiros||0],['Vagas',i.vagas||0],['Área útil',i.area_util?i.area_util+' m²':'-'],['Publicado no site',i.publicado_site?'Sim':'Não']])}</div></div><div class="detail-block"><h3>Endereço</h3><p>${escapeHtml([i.endereco,i.numero,i.complemento,i.bairro,i.cidade,i.estado].filter(Boolean).join(', ')||'Não informado')}</p></div><div class="detail-block"><h3>Descrição</h3><p>${escapeHtml(i.descricao||'Sem descrição.')}</p></div>`;
 else if(tab==='proprietario')html=p?`<div class="detail-block"><h3>${escapeHtml(p.nome)}</h3>${infoGrid([['CPF/CNPJ',p.cpf_cnpj],['Telefone',p.telefone],['WhatsApp',p.whatsapp],['E-mail',p.email],['Cidade',p.cidade],['Chave PIX',p.chave_pix]])}</div>`:detailEmpty('Nenhum proprietário vinculado a este imóvel.');
 else if(tab==='fotos')html=`<div class="detail-section-head"><div><h3>Fotos</h3><p class="muted">Gerencie as fotos sem sair da ficha do imóvel.</p></div><label class="btn primary" style="cursor:pointer">+ Adicionar fotos<input type="file" data-detail-add-photos accept="image/jpeg,image/png,image/webp" multiple hidden></label></div>`+((i.fotos||[]).length?`<div class="detail-gallery">${i.fotos.map(f=>`<figure><img src="${escapeHtml(f.url)}" alt="Foto do imóvel"><figcaption>${f.principal?'★ Principal':'Foto'} <button class="mini edit" data-photo-main="${f.id}">Principal</button> <button class="mini danger" data-photo-delete="${f.id}">Excluir</button></figcaption></figure>`).join('')}</div>`:detailEmpty('Nenhuma foto cadastrada. Use + Adicionar fotos.'));
 else if(tab==='documentos')html=`<div class="detail-section-head"><div><h3>Documentos</h3><p class="muted">Documentos do imóvel e dos contratos vinculados.</p></div><button class="btn primary" data-detail-add-doc>+ Documento</button></div>`+(d.documentos.length?`<div class="detail-list">${d.documentos.map(x=>`<article><div><strong>${escapeHtml(x.nome_arquivo||x.nome)}</strong><small>${escapeHtml(x.categoria||'-')} · ${formatDateBR(x.criado_em)}</small></div><div class="actions"><button class="mini edit" data-doc-open="${x.id}">Abrir</button><button class="mini danger" data-doc-delete="${x.id}">Excluir</button></div></article>`).join('')}</div>`:detailEmpty('Nenhum documento vinculado. Use + Documento.'));
 else if(tab==='contratos')html=`<div class="detail-section-head"><div><h3>Contratos</h3><p class="muted">Inclua, edite e exclua contratos deste imóvel.</p></div><button class="btn primary" data-detail-add-contract>+ Novo contrato</button></div>`+(d.contratos.length?`<div class="detail-list">${d.contratos.map(c=>`<article><div><strong>${escapeHtml(c.codigo||'Contrato')}</strong><small>${formatDateBR(c.data_inicio)} até ${formatDateBR(c.data_fim)} · Vencimento dia ${c.dia_vencimento||'-'}</small></div><div class="detail-contract-actions"><div><b>${brl(c.valor_aluguel)}</b><small class="status ${statusClass(c.status)}">${escapeHtml(contratoStatusLabel(c.status)||'-')}</small></div><button class="mini edit" data-detail-edit-contract="${c.id}">Editar</button><button class="mini danger" data-detail-delete="contratos" data-record-id="${c.id}">Excluir</button></div></article>`).join('')}</div>`:detailEmpty('Nenhum contrato vinculado. Use + Novo contrato.'));
 else if(tab==='financeiro')html=`<div class="detail-section-head"><div><h3>Financeiro</h3><p class="muted">Lançamentos financeiros deste imóvel.</p></div><button class="btn primary" data-detail-new="financeiro">+ Novo lançamento</button></div>`+(d.financeiro.length?`<div class="detail-list">${d.financeiro.map(f=>{const docs=(d.docsFinanceiro||[]).filter(x=>String(x.financeiro_id)===String(f.id));return `<article><div><strong>${escapeHtml(f.descricao||f.tipo)}</strong><small>${formatDateBR(f.data_lancamento)} · ${escapeHtml(f.status||'-')} · ${docs.length} anexo(s)</small>${docs.map(x=>`<button class="mini edit" data-doc-open="${x.id}">${escapeHtml(x.nome_arquivo)}</button>`).join(' ')}</div><div><b>${brl(f.valor)}</b><button class="mini edit" data-detail-edit="financeiro" data-record-id="${f.id}">Editar</button><button class="mini edit" data-add-record-doc="financeiro" data-record-id="${f.id}">+ Anexo</button><button class="mini danger" data-detail-delete="financeiro" data-record-id="${f.id}">Excluir</button></div></article>`}).join('')}</div>`:detailEmpty('Nenhum lançamento financeiro. Use + Novo lançamento.'));
 else if(tab==='vistorias')html=`<div class="detail-section-head"><div><h3>Vistorias</h3><p class="muted">Gerencie as vistorias deste imóvel sem sair da ficha.</p></div><button class="btn primary" data-detail-new="vistorias">+ Nova vistoria</button></div>`+(d.vistorias?.length?`<div class="detail-list">${d.vistorias.map(v=>{const docs=(d.docsVistorias||[]).filter(x=>String(x.vistoria_id)===String(v.id));return `<article><div><strong>${escapeHtml(vistoriaTipoLabel(v.tipo))}</strong><small>${formatDateBR(v.data_vistoria)} · ${escapeHtml(v.responsavel||'Sem responsável')} · ${docs.length} anexo(s)</small>${docs.map(x=>`<button class="mini edit" data-doc-open="${x.id}">${escapeHtml(x.nome_arquivo)}</button>`).join(' ')}</div><div><span class="status ${statusClass(vistoriaStatusLabel(v.status))}">${escapeHtml(vistoriaStatusLabel(v.status))}</span><button class="mini edit" data-detail-edit="vistorias" data-record-id="${v.id}">Editar</button><button class="mini edit" data-add-record-doc="vistoria" data-record-id="${v.id}">+ Anexo</button><button class="mini danger" data-detail-delete="vistorias" data-record-id="${v.id}">Excluir</button></div></article>`}).join('')}</div>`:detailEmpty('Nenhuma vistoria vinculada. Use + Nova vistoria.'));
 else if(tab==='manutencoes')html=`<div class="detail-section-head"><div><h3>Manutenções</h3><p class="muted">Gerencie manutenções e seus anexos neste imóvel.</p></div><button class="btn primary" data-detail-new="manutencoes">+ Nova manutenção</button></div>`+(d.manutencoes?.length?`<div class="detail-list">${d.manutencoes.map(m=>{const docs=(d.docsManutencoes||[]).filter(x=>String(x.manutencao_id)===String(m.id));return `<article><div><strong>${escapeHtml(m.codigo||'Manutenção')} · ${escapeHtml(m.descricao||'')}</strong><small>${escapeHtml(manutencaoPrioridadeLabel(m.prioridade))} · ${escapeHtml(m.fornecedor||'Sem fornecedor')} · ${docs.length} anexo(s)</small>${docs.map(x=>`<button class="mini edit" data-doc-open="${x.id}">${escapeHtml(x.nome_arquivo)}</button>`).join(' ')}</div><div><b>${brl(m.valor_final??m.valor_estimado??0)}</b><small class="status ${statusClass(manutencaoStatusLabel(m.status))}">${escapeHtml(manutencaoStatusLabel(m.status))}</small><button class="mini edit" data-detail-edit="manutencoes" data-record-id="${m.id}">Editar</button><button class="mini edit" data-add-record-doc="manutencao" data-record-id="${m.id}">+ Anexo</button><button class="mini danger" data-detail-delete="manutencoes" data-record-id="${m.id}">Excluir</button></div></article>`}).join('')}</div>`:detailEmpty('Nenhuma manutenção vinculada. Use + Nova manutenção.'));
 $('#imovelDetalheConteudo').innerHTML=html;bindDocumentActions();
 $('#imovelDetalheConteudo').querySelectorAll('[data-add-record-doc]').forEach(b=>b.addEventListener('click',()=>openDocumentoModal({imobiliaria_id:i.imobiliaria_id,tipo_vinculo:b.dataset.addRecordDoc,referencia_id:b.dataset.recordId})));
 $('#imovelDetalheConteudo').querySelectorAll('[data-detail-new]').forEach(b=>b.addEventListener('click',()=>genericOpen(b.dataset.detailNew,null,{imobiliaria_id:i.imobiliaria_id,imovel_id:i.id})));
 $('#imovelDetalheConteudo').querySelectorAll('[data-detail-edit]').forEach(b=>b.addEventListener('click',()=>{const type=b.dataset.detailEdit;const item=(db[type]||[]).find(x=>String(x.id)===String(b.dataset.recordId));if(item)genericOpen(type,item);}));
 $('#imovelDetalheConteudo').querySelectorAll('[data-detail-delete]').forEach(b=>b.addEventListener('click',async()=>{const type=b.dataset.detailDelete,id=b.dataset.recordId;if(!confirm('Deseja realmente excluir este registro?'))return;try{const table=type==='contratos'?'imob_contratos':realTableMap[type];const {error}=await supabaseClient.from(table).delete().eq('id',id);if(error)throw error;if(type==='contratos')await loadRealContratos();else await realLoaderMap[type]();await refreshImovelDetalhe();renderAll();}catch(err){alert('Não foi possível excluir: '+(err.message||err));}}));
 $('#imovelDetalheConteudo').querySelectorAll('[data-photo-delete]').forEach(b=>b.addEventListener('click',async()=>{if(!confirm('Excluir esta foto?'))return;try{const photo=(i.fotos||[]).find(x=>String(x.id)===String(b.dataset.photoDelete));const {error}=await supabaseClient.from('imob_imovel_fotos').delete().eq('id',b.dataset.photoDelete);if(error)throw error;if(photo?.url){const marker='/imob-imoveis/';const pos=photo.url.indexOf(marker);if(pos>=0){const path=decodeURIComponent(photo.url.slice(pos+marker.length));await supabaseClient.storage.from('imob-imoveis').remove([path]);}}await loadRealImoveis();const fresh=db.imoveis.find(x=>String(x.id)===String(i.id));if(fresh)imovelDetalheAtual=fresh;await refreshImovelDetalhe();renderImoveis();}catch(err){alert('Não foi possível excluir a foto: '+(err.message||err));}}));
 $('#imovelDetalheConteudo').querySelectorAll('[data-photo-main]').forEach(b=>b.addEventListener('click',async()=>{try{await supabaseClient.from('imob_imovel_fotos').update({principal:false}).eq('imovel_id',i.id);const {error}=await supabaseClient.from('imob_imovel_fotos').update({principal:true}).eq('id',b.dataset.photoMain);if(error)throw error;await loadRealImoveis();const fresh=db.imoveis.find(x=>String(x.id)===String(i.id));if(fresh)imovelDetalheAtual=fresh;await refreshImovelDetalhe();renderImoveis();}catch(err){alert('Não foi possível definir a foto principal: '+(err.message||err));}}));
 $('#imovelDetalheConteudo').querySelector('[data-detail-add-doc]')?.addEventListener('click',()=>openDocumentoModal({imobiliaria_id:i.imobiliaria_id,tipo_vinculo:'imovel',referencia_id:i.id}));
 const detailPhotos=$('#imovelDetalheConteudo').querySelector('[data-detail-add-photos]');
 detailPhotos?.addEventListener('change',async e=>{
   const files=[...e.target.files||[]]; if(!files.length)return;
   try{
     let existing=(i.fotos||[]).length;
     for(let n=0;n<files.length;n++){
       const file=files[n];
       if(!['image/jpeg','image/png','image/webp'].includes(file.type))throw new Error(`Arquivo não suportado: ${file.name}`);
       if(file.size>10*1024*1024)throw new Error(`A foto ${file.name} ultrapassa 10 MB.`);
       const ext=(file.name.split('.').pop()||'jpg').toLowerCase().replace(/[^a-z0-9]/g,'')||'jpg';
       const filename=`${Date.now()}-${n}-${crypto.randomUUID?.()||Math.random().toString(36).slice(2)}.${ext}`;
       const path=`${i.imobiliaria_id}/${i.id}/${filename}`;
       const up=await supabaseClient.storage.from('imob-imoveis').upload(path,file,{cacheControl:'3600',upsert:false,contentType:file.type}); if(up.error)throw up.error;
       const pub=supabaseClient.storage.from('imob-imoveis').getPublicUrl(path);
       const ins=await supabaseClient.from('imob_imovel_fotos').insert({imobiliaria_id:i.imobiliaria_id,imovel_id:i.id,url:pub.data.publicUrl,principal:existing===0&&n===0,ordem:existing+n}); if(ins.error)throw ins.error;
     }
     await loadRealImoveis();
     const fresh=db.imoveis.find(x=>String(x.id)===String(i.id)); if(fresh)imovelDetalheAtual=fresh;
     await refreshImovelDetalhe(); renderImoveis(); alert('Foto(s) adicionada(s) com sucesso.');
   }catch(err){alert('Não foi possível enviar as fotos: '+(err.message||err));}
   finally{e.target.value='';}
 });
 $('#imovelDetalheConteudo').querySelector('[data-detail-add-contract]')?.addEventListener('click',()=>openContrato(null,i.id));
 $('#imovelDetalheConteudo').querySelectorAll('[data-detail-edit-contract]').forEach(b=>b.addEventListener('click',()=>{const c=db.contratos.find(x=>String(x.id)===String(b.dataset.detailEditContract))||d.contratos.find(x=>String(x.id)===String(b.dataset.detailEditContract));if(c)openContrato(c);}));
}
async function openImovelDetalhe(item){
 imovelDetalheAtual=item;$('#imovelDetalheTitulo').textContent=item.titulo||'Imóvel';$('#imovelDetalheSubtitulo').textContent=`${item.codigo||'Sem código'} · ${[item.bairro,item.cidade].filter(Boolean).join(' · ')}`;
 $('#imovelDetalheConteudo').innerHTML='<div class="detail-empty">Carregando ficha do imóvel...</div>';$('#imovelDetalheDialog').showModal();imovelDetalheDados=await loadImovelDetalheDados(item);renderImovelDetalhe('resumo');
}
async function refreshImovelDetalhe(){if(!imovelDetalheAtual)return;imovelDetalheDados=await loadImovelDetalheDados(imovelDetalheAtual);const active=$('#imovelDetalheTabs button.active')?.dataset.detailTab||'resumo';renderImovelDetalhe(active)}
$('#imovelDetalheClose')?.addEventListener('click',()=>$('#imovelDetalheDialog').close());$('#imovelDetalheFechar')?.addEventListener('click',()=>$('#imovelDetalheDialog').close());
$('#imovelDetalheEditar')?.addEventListener('click',()=>{const i=imovelDetalheAtual;$('#imovelDetalheDialog').close();if(i)openImovel(i)});
$$('#imovelDetalheTabs [data-detail-tab]').forEach(b=>b.addEventListener('click',()=>renderImovelDetalhe(b.dataset.detailTab)));

$('#novoImovelBtn').onclick=()=>openImovel();$('#novoPropBtn').onclick=()=>openProp();
function fillImovelImobiliarias(selected=''){
 const wrap=$('#imovelImobWrap'), sel=$('#imovelImobiliaria'); if(!wrap||!sel)return;
 const master=currentProfile?.perfil==='admin_master' && isRealMode(); wrap.style.display=master?'':'none'; sel.required=master;
 if(master) sel.innerHTML='<option value="">Selecione a imobiliária</option>'+db.imobiliarias.map(i=>`<option value="${i.id}" ${String(i.id)===String(selected)?'selected':''}>${escapeHtml(i.nome)}</option>`).join('');
 else sel.innerHTML=currentProfile?.imobiliaria_id?`<option value="${currentProfile.imobiliaria_id}" selected></option>`:'';
}
function fillImovelProprietarios(imobiliariaId='',selected=''){
 const sel=$('#imovelProprietario'); if(!sel)return;
 const list=props.filter(p=>!imobiliariaId || String(p.imobiliaria_id)===String(imobiliariaId));
 sel.innerHTML='<option value="">Sem proprietário vinculado</option>'+list.map(p=>`<option value="${p.id}" ${String(p.id)===String(selected)?'selected':''}>${escapeHtml(p.nome)}</option>`).join('');
}
function storagePathFromPublicUrl(url=''){
 try{
   const marker='/storage/v1/object/public/imob-imoveis/';
   const idx=String(url).indexOf(marker);
   return idx>=0?decodeURIComponent(String(url).slice(idx+marker.length)):null;
 }catch{return null}
}
function resetImovelFotos(item=null){
 imovelFotosExistentes=(item?.fotos||[]).map(f=>({...f}));
 imovelFotosNovas=[];
 imovelFotosRemover=[];
 const principal=imovelFotosExistentes.find(f=>f.principal)||imovelFotosExistentes[0];
 imovelFotoPrincipalKey=principal?`existing:${principal.id}`:null;
 renderImovelFotos();
}
function renderImovelFotos(){
 const grid=$('#imovelFotosGrid'); if(!grid)return;
 const existentes=imovelFotosExistentes.filter(f=>!imovelFotosRemover.some(r=>String(r.id)===String(f.id)));
 const cards=[];
 existentes.forEach(f=>{
   const key=`existing:${f.id}`;
   cards.push(`<div class="photo-thumb"><img src="${escapeHtml(f.url)}" alt="Foto do imóvel"><div class="photo-thumb-actions"><button type="button" class="photo-star ${imovelFotoPrincipalKey===key?'active':''}" data-photo-main="${key}" title="Definir como principal">★</button><button type="button" class="photo-remove" data-photo-remove="${key}" title="Remover foto">×</button></div></div>`);
 });
 imovelFotosNovas.forEach(f=>{
   const key=`pending:${f.key}`;
   cards.push(`<div class="photo-thumb"><img src="${escapeHtml(f.preview)}" alt="Nova foto"><div class="photo-thumb-actions"><button type="button" class="photo-star ${imovelFotoPrincipalKey===key?'active':''}" data-photo-main="${key}" title="Definir como principal">★</button><button type="button" class="photo-remove" data-photo-remove="${key}" title="Remover foto">×</button></div><span class="photo-pending">Nova</span></div>`);
 });
 grid.innerHTML=cards.join('')||'<div class="photo-empty">Nenhuma foto selecionada.</div>';
 grid.querySelectorAll('[data-photo-main]').forEach(b=>b.onclick=()=>{imovelFotoPrincipalKey=b.dataset.photoMain;renderImovelFotos();});
 grid.querySelectorAll('[data-photo-remove]').forEach(b=>b.onclick=()=>removeImovelFoto(b.dataset.photoRemove));
}
function removeImovelFoto(key){
 if(key.startsWith('existing:')){
   const id=key.slice(9), f=imovelFotosExistentes.find(x=>String(x.id)===String(id));
   if(f && !imovelFotosRemover.some(x=>String(x.id)===String(id))) imovelFotosRemover.push(f);
 }else{
   const k=key.slice(8), f=imovelFotosNovas.find(x=>String(x.key)===String(k));
   if(f){URL.revokeObjectURL(f.preview);imovelFotosNovas=imovelFotosNovas.filter(x=>String(x.key)!==String(k));}
 }
 if(imovelFotoPrincipalKey===key){
   const restante=imovelFotosExistentes.filter(f=>!imovelFotosRemover.some(r=>String(r.id)===String(f.id)))[0];
   imovelFotoPrincipalKey=restante?`existing:${restante.id}`:(imovelFotosNovas[0]?`pending:${imovelFotosNovas[0].key}`:null);
 }
 renderImovelFotos();
}
$('#imovelFotosInput')?.addEventListener('change',e=>{
 const files=[...e.target.files||[]];
 for(const file of files){
   if(!['image/jpeg','image/png','image/webp'].includes(file.type)){alert(`Arquivo não suportado: ${file.name}`);continue;}
   if(file.size>10*1024*1024){alert(`A foto ${file.name} ultrapassa 10 MB.`);continue;}
   const key=(crypto.randomUUID?.()||`${Date.now()}-${Math.random()}`);
   imovelFotosNovas.push({key,file,preview:URL.createObjectURL(file)});
   if(!imovelFotoPrincipalKey) imovelFotoPrincipalKey=`pending:${key}`;
 }
 e.target.value=''; renderImovelFotos();
});
async function syncImovelFotos(imovelId,imobiliariaId){
 // Remove primeiro do banco e depois do Storage. Se a URL não for deste bucket, só remove o registro.
 for(const foto of imovelFotosRemover){
   const del=await supabaseClient.from('imob_imovel_fotos').delete().eq('id',foto.id); if(del.error) throw del.error;
   const path=storagePathFromPublicUrl(foto.url); if(path){const sr=await supabaseClient.storage.from('imob-imoveis').remove([path]); if(sr.error) console.warn('Foto removida do banco, mas não do Storage:',sr.error);}
 }
 const uploads=[];
 for(let i=0;i<imovelFotosNovas.length;i++){
   const item=imovelFotosNovas[i], file=item.file;
   const ext=(file.name.split('.').pop()||'jpg').toLowerCase().replace(/[^a-z0-9]/g,'')||'jpg';
   const filename=`${Date.now()}-${i}-${crypto.randomUUID?.()||Math.random().toString(36).slice(2)}.${ext}`;
   const path=`${imobiliariaId}/${imovelId}/${filename}`;
   const up=await supabaseClient.storage.from('imob-imoveis').upload(path,file,{cacheControl:'3600',upsert:false,contentType:file.type});
   if(up.error) throw up.error;
   const pub=supabaseClient.storage.from('imob-imoveis').getPublicUrl(path);
   uploads.push({key:item.key,url:pub.data.publicUrl,path});
 }
 // Garante que exista apenas uma principal.
 const currentExisting=imovelFotosExistentes.filter(f=>!imovelFotosRemover.some(r=>String(r.id)===String(f.id)));
 const anyPhotos=currentExisting.length||uploads.length;
 let principalKey=imovelFotoPrincipalKey;
 if(anyPhotos && !principalKey){principalKey=currentExisting[0]?`existing:${currentExisting[0].id}`:`pending:${uploads[0].key}`;}
 if(anyPhotos){
   const clear=await supabaseClient.from('imob_imovel_fotos').update({principal:false}).eq('imovel_id',imovelId); if(clear.error) throw clear.error;
 }
 for(let i=0;i<uploads.length;i++){
   const u=uploads[i], principal=principalKey===`pending:${u.key}`;
   const ins=await supabaseClient.from('imob_imovel_fotos').insert({imobiliaria_id:imobiliariaId,imovel_id:imovelId,url:u.url,principal,ordem:currentExisting.length+i});
   if(ins.error) throw ins.error;
 }
 if(principalKey?.startsWith('existing:')){
   const id=principalKey.slice(9);
   const set=await supabaseClient.from('imob_imovel_fotos').update({principal:true}).eq('id',id); if(set.error) throw set.error;
 }
 imovelFotosNovas.forEach(x=>URL.revokeObjectURL(x.preview));
}
function openImovel(item=null){
 editMode={type:'imoveis',id:item?.id||null}; const f=$('#imovelForm'); f.reset();
 const imobId=item?.imobiliaria_id||currentProfile?.imobiliaria_id||''; fillImovelImobiliarias(imobId); fillImovelProprietarios(imobId,item?.proprietario_id||'');
 if(item){
   const values={...item,finalidade:({Venda:'venda','Locação':'locacao','Venda e Locação':'venda_locacao'}[item.finalidade]||item.finalidade),status:({Disponível:'disponivel',Reservado:'reservado',Alugado:'alugado',Vendido:'vendido',Inativo:'inativo'}[item.status]||item.status),dormitorios:item.dormitorios??item.quartos,area_util:item.area_util??item.area};
   Object.entries(values).forEach(([k,v])=>{if(f.elements[k]){if(f.elements[k].type==='checkbox')f.elements[k].checked=!!v;else f.elements[k].value=v??''}});
 }
 resetImovelFotos(item);
 $('#imovelDialogTitle').textContent=item?'Editar imóvel':'Novo imóvel'; $('#imovelDialog').showModal();
}
$('#imovelImobiliaria')?.addEventListener('change',e=>fillImovelProprietarios(e.target.value,''));

function fillInquilinoImobiliarias(selected=''){
 const wrap=$('#inquilinoImobWrap'),sel=$('#inquilinoImobiliaria');if(!wrap||!sel)return;
 const master=currentProfile?.perfil==='admin_master'&&isRealMode();wrap.style.display=master?'':'none';sel.required=master;
 if(master)sel.innerHTML='<option value="">Selecione a imobiliária</option>'+db.imobiliarias.map(i=>`<option value="${i.id}" ${String(i.id)===String(selected)?'selected':''}>${escapeHtml(i.nome)}</option>`).join('');
 else sel.innerHTML=currentProfile?.imobiliaria_id?`<option value="${currentProfile.imobiliaria_id}" selected></option>`:'';
}
function openInquilino(item=null){
 editMode={type:'inquilinos',id:item?.id||null};const f=$('#inquilinoForm');f.reset();fillInquilinoImobiliarias(item?.imobiliaria_id||currentProfile?.imobiliaria_id||'');
 if(item){Object.entries(item).forEach(([k,v])=>{if(f.elements[k])f.elements[k].value=(k==='ativo'?String(!!v):(v??''));});}
 $('#inquilinoDialogTitle').textContent=item?'Editar inquilino':'Novo inquilino';$('#inquilinoDialog').showModal();
}
$('#novoInquilinoBtn')?.addEventListener('click',()=>openInquilino());
$('#inquilinoClose')?.addEventListener('click',()=>$('#inquilinoDialog').close());
$('#inquilinoForm')?.addEventListener('submit',async e=>{
 if(e.submitter?.value==='cancel')return;e.preventDefault();const fd=new FormData(e.target),obj=Object.fromEntries(fd);
 if(isRealMode()&&supabaseClient){
   const imobiliariaId=currentProfile?.perfil==='admin_master'?obj.imobiliaria_id:currentProfile?.imobiliaria_id;if(!imobiliariaId){alert('Selecione a imobiliária.');return;}
   const renda=obj.renda_mensal===''?null:Number(obj.renda_mensal);
   const payload={imobiliaria_id:imobiliariaId,nome:obj.nome?.trim(),tipo_pessoa:obj.tipo_pessoa||'fisica',cpf_cnpj:obj.cpf_cnpj?.trim()||null,rg_ie:obj.rg_ie?.trim()||null,data_nascimento:obj.data_nascimento||null,email:obj.email?.trim()||null,telefone:obj.telefone?.trim()||null,whatsapp:obj.whatsapp?.trim()||null,profissao:obj.profissao?.trim()||null,empresa:obj.empresa?.trim()||null,renda_mensal:renda,cep:obj.cep?.trim()||null,endereco:obj.endereco?.trim()||null,numero:obj.numero?.trim()||null,complemento:obj.complemento?.trim()||null,bairro:obj.bairro?.trim()||null,cidade:obj.cidade?.trim()||null,estado:obj.estado?.trim()||null,contato_emergencia_nome:obj.contato_emergencia_nome?.trim()||null,contato_emergencia_telefone:obj.contato_emergencia_telefone?.trim()||null,observacoes:obj.observacoes?.trim()||null,ativo:obj.ativo!=='false',atualizado_em:new Date().toISOString()};
   try{const result=editMode.id?await supabaseClient.from('imob_inquilinos').update(payload).eq('id',editMode.id).select().single():await supabaseClient.from('imob_inquilinos').insert(payload).select().single();if(result.error)throw result.error;await loadRealInquilinos();$('#inquilinoDialog').close();renderAll();}
   catch(err){alert('Não foi possível salvar o inquilino: '+(err.message||err));}
   return;
 }
 const local={id:editMode.id||Date.now(),...obj,documento:obj.cpf_cnpj,status:obj.ativo==='false'?'Inativo':'Ativo',ativo:obj.ativo!=='false'};if(editMode.id)Object.assign(db.inquilinos.find(x=>String(x.id)===String(editMode.id)),local);else db.inquilinos.unshift(local);persistAll();$('#inquilinoDialog').close();renderAll();
});

function fillContratoImobiliarias(selected=''){
 const wrap=$('#contratoImobWrap'),sel=$('#contratoImobiliaria'); if(!wrap||!sel)return;
 const master=currentProfile?.perfil==='admin_master'&&isRealMode(); wrap.style.display=master?'':'none'; sel.required=master;
 if(master) sel.innerHTML='<option value="">Selecione a imobiliária</option>'+db.imobiliarias.map(i=>`<option value="${i.id}" ${String(i.id)===String(selected)?'selected':''}>${escapeHtml(i.nome)}</option>`).join('');
 else sel.innerHTML=currentProfile?.imobiliaria_id?`<option value="${currentProfile.imobiliaria_id}" selected></option>`:'';
}
function fillContratoRelacionados(imobiliariaId,selectedImovel='',selectedInquilino=''){
 const imSel=$('#contratoImovel'),inqSel=$('#contratoInquilino'); if(!imSel||!inqSel)return;
 const ims=imoveis.filter(x=>!imobiliariaId||String(x.imobiliaria_id)===String(imobiliariaId));
 const inqs=db.inquilinos.filter(x=>!imobiliariaId||String(x.imobiliaria_id)===String(imobiliariaId)).filter(x=>x.ativo!==false);
 imSel.innerHTML='<option value="">Selecione o imóvel</option>'+ims.map(x=>`<option value="${x.id}" ${String(x.id)===String(selectedImovel)?'selected':''}>${escapeHtml((x.codigo?x.codigo+' · ':'')+x.titulo)}</option>`).join('');
 inqSel.innerHTML='<option value="">Selecione o inquilino</option>'+inqs.map(x=>`<option value="${x.id}" ${String(x.id)===String(selectedInquilino)?'selected':''}>${escapeHtml(x.nome)}</option>`).join('');
}
function syncContratoProprietario(){
 const im=imoveis.find(x=>String(x.id)===String($('#contratoImovel')?.value));
 const p=props.find(x=>String(x.id)===String(im?.proprietario_id));
 $('#contratoProprietarioNome').value=p?.nome||'Proprietário não vinculado ao imóvel';
}
function garantiaLabel(v){return ({fiador:'Fiador',deposito_caucao:'Depósito caução',seguro_fianca:'Seguro-fiança',titulo_capitalizacao:'Título de capitalização',sem_garantia:'Sem garantia',outro:'Outro'}[v]||v||'');}
function openContrato(item=null,presetImovelId=''){
 editMode={type:'contratos',id:item?.id||null}; const f=$('#contratoForm'); f.reset();
 const imobId=item?.imobiliaria_id||currentProfile?.imobiliaria_id||imoveis.find(x=>String(x.id)===String(presetImovelId))?.imobiliaria_id||'';
 fillContratoImobiliarias(imobId); fillContratoRelacionados(imobId,item?.imovel_id||presetImovelId||'',item?.inquilino_id||'');
 if(item){
   Object.entries(item).forEach(([k,v])=>{if(f.elements[k])f.elements[k].value=(typeof v==='boolean'?String(v):(v??''));});
   f.elements.status.value=({Rascunho:'rascunho',Ativo:'ativo',Encerrado:'encerrado',Cancelado:'cancelado'}[item.status]||item.status||'ativo');
 }
 syncContratoProprietario();
 $('#contratoDialogTitle').textContent=item?'Editar contrato':'Novo contrato'; $('#contratoDialog').showModal();
}
$('#novoContratoBtn')?.addEventListener('click',()=>openContrato());
$('#contratoClose')?.addEventListener('click',()=>$('#contratoDialog').close());
$('#contratoCancel')?.addEventListener('click',()=>$('#contratoDialog').close());
$('#contratoImobiliaria')?.addEventListener('change',e=>{fillContratoRelacionados(e.target.value);syncContratoProprietario();});
$('#contratoImovel')?.addEventListener('change',syncContratoProprietario);
$('#contratoForm')?.addEventListener('submit',async e=>{
 e.preventDefault(); const fd=new FormData(e.target),obj=Object.fromEntries(fd),integratedFiles=Array.from($('#contratoAnexos')?.files||[]);delete obj.anexos;
 const im=imoveis.find(x=>String(x.id)===String(obj.imovel_id)); if(!im){alert('Selecione um imóvel.');return;}
 if(!im.proprietario_id){alert('Este imóvel não possui proprietário vinculado. Vincule um proprietário antes de criar o contrato.');return;}
 if(isRealMode()&&supabaseClient){
   const imobiliariaId=currentProfile?.perfil==='admin_master'?obj.imobiliaria_id:currentProfile?.imobiliaria_id; if(!imobiliariaId){alert('Selecione a imobiliária.');return;}
   const num=v=>v===''||v==null?null:Number(v);
   const payload={imobiliaria_id:imobiliariaId,imovel_id:obj.imovel_id,proprietario_id:im.proprietario_id,inquilino_id:obj.inquilino_id,codigo:obj.codigo?.trim()||null,status:obj.status||'ativo',data_inicio:obj.data_inicio,data_fim:obj.data_fim||null,dia_vencimento:Number(obj.dia_vencimento||10),valor_aluguel:Number(obj.valor_aluguel||0),primeira_parcela_imobiliaria:obj.primeira_parcela_imobiliaria!=='false',taxa_administracao_tipo:obj.taxa_administracao_tipo||'percentual',taxa_administracao_valor:Number(obj.taxa_administracao_valor||0),prazo_repasse_dias:Number(obj.prazo_repasse_dias||0),multa_atraso_percentual:Number(obj.multa_atraso_percentual||0),juros_atraso_percentual_mes:Number(obj.juros_atraso_percentual_mes||0),reajuste_indice:obj.reajuste_indice?.trim()||null,reajuste_periodicidade_meses:Number(obj.reajuste_periodicidade_meses||12),garantia_tipo:obj.garantia_tipo||null,garantia_valor:num(obj.garantia_valor),observacoes:obj.observacoes?.trim()||null,ativo:obj.status!=='cancelado',atualizado_em:new Date().toISOString()};
   try{
     const result=editMode.id?await supabaseClient.from('imob_contratos').update(payload).eq('id',editMode.id).select().single():await supabaseClient.from('imob_contratos').insert(payload).select().single();
     if(result.error)throw result.error;
     if(integratedFiles.length)await uploadIntegratedAttachments(integratedFiles,{imobiliariaId,tipoVinculo:'contrato',referenciaId:result.data.id,imovelId:payload.imovel_id,categoria:'Contrato'});
     if(payload.status==='ativo'){
       const ur=await supabaseClient.from('imob_imoveis').update({status:'alugado',atualizado_em:new Date().toISOString()}).eq('id',payload.imovel_id); if(ur.error)console.warn('Contrato salvo, mas status do imóvel não foi atualizado:',ur.error);
     }
     await loadRealImoveis(); await loadRealContratos(); await loadRealCobrancas(); $('#contratoDialog').close(); renderAll();
     if(imovelDetalheAtual && String(imovelDetalheAtual.id)===String(payload.imovel_id)){imovelDetalheAtual=imoveis.find(x=>String(x.id)===String(payload.imovel_id))||imovelDetalheAtual;imovelDetalheDados=await loadImovelDetalheDados(imovelDetalheAtual);renderImovelDetalhe('contratos');}
   }catch(err){alert('Não foi possível salvar o contrato: '+(err.message||err));}
   return;
 }
 const local={id:editMode.id||Date.now(),...obj,imovel_id:im.id,proprietario_id:im.proprietario_id,imovel:im.titulo,inquilino:db.inquilinos.find(x=>String(x.id)===String(obj.inquilino_id))?.nome||'',valor:Number(obj.valor_aluguel||0),vencimento:Number(obj.dia_vencimento||10),status:contratoStatusLabel(obj.status)};
 if(editMode.id)Object.assign(db.contratos.find(x=>String(x.id)===String(editMode.id)),local);else db.contratos.unshift(local);persistAll();$('#contratoDialog').close();renderAll();
});

function fillPropImobiliarias(selected=''){
 const wrap=$('#propImobWrap'), sel=$('#propImobiliaria');
 if(!wrap||!sel) return;
 const isMaster=currentProfile?.perfil==='admin_master' && isRealMode();
 wrap.style.display=isMaster?'':'none';
 sel.required=isMaster;
 if(isMaster){
   sel.innerHTML='<option value="">Selecione a imobiliária</option>'+db.imobiliarias.map(i=>`<option value="${i.id}" ${String(i.id)===String(selected)?'selected':''}>${escapeHtml(i.nome)}</option>`).join('');
 } else {
   sel.innerHTML=currentProfile?.imobiliaria_id?`<option value="${currentProfile.imobiliaria_id}" selected></option>`:'';
 }
}
function openProp(item=null){
 editMode={type:'props',id:item?.id||null};
 const f=$('#propForm'); f.reset();
 fillPropImobiliarias(item?.imobiliaria_id||currentProfile?.imobiliaria_id||'');
 if(item) Object.entries(item).forEach(([k,v])=>{if(f.elements[k])f.elements[k].value=v??''});
 $('#propDialogTitle').textContent=item?'Editar proprietário':'Novo proprietário';
 $('#propDialog').showModal();
}
$('#imovelForm').addEventListener('submit',async e=>{
 if(e.submitter?.value==='cancel')return; e.preventDefault(); const fd=new FormData(e.target), obj=Object.fromEntries(fd);
 if(isRealMode() && supabaseClient){
   const imobiliariaId=currentProfile?.perfil==='admin_master'?obj.imobiliaria_id:currentProfile?.imobiliaria_id; if(!imobiliariaId){alert('Selecione a imobiliária.');return;}
   const n=v=>v===''||v==null?null:Number(v);
   const payload={imobiliaria_id:imobiliariaId,proprietario_id:obj.proprietario_id||null,codigo:obj.codigo?.trim()||null,titulo:obj.titulo?.trim(),finalidade:obj.finalidade||'venda',tipo_imovel:obj.tipo_imovel?.trim()||null,status:obj.status||'disponivel',valor_venda:n(obj.valor_venda),valor_locacao:n(obj.valor_locacao),valor_condominio:n(obj.valor_condominio),valor_iptu:n(obj.valor_iptu),dormitorios:Number(obj.dormitorios||0),suites:Number(obj.suites||0),banheiros:Number(obj.banheiros||0),vagas:Number(obj.vagas||0),area_util:n(obj.area_util),area_total:n(obj.area_total),cep:obj.cep?.trim()||null,endereco:obj.endereco?.trim()||null,numero:obj.numero?.trim()||null,complemento:obj.complemento?.trim()||null,bairro:obj.bairro?.trim()||null,cidade:obj.cidade?.trim()||null,estado:obj.estado?.trim()||null,descricao:obj.descricao?.trim()||null,caracteristicas:obj.caracteristicas?.trim()||null,destaque:fd.get('destaque')==='on',publicado_site:fd.get('publicado_site')==='on',atualizado_em:new Date().toISOString()};
   try{
     let result=editMode.id?await supabaseClient.from('imob_imoveis').update(payload).eq('id',editMode.id).select().single():await supabaseClient.from('imob_imoveis').insert(payload).select().single(); if(result.error)throw result.error;
     const imovelId=result.data.id;
     await syncImovelFotos(imovelId,imobiliariaId);
     await loadRealImoveis(); $('#imovelDialog').close(); renderAll();
   }catch(err){alert('Não foi possível salvar o imóvel: '+(err.message||err));}
   return;
 }
 const local={id:editMode.id||Date.now(),...obj,finalidade:finalidadeLabel(obj.finalidade),status:statusLabel(obj.status),valor:Number(obj.valor_venda||obj.valor_locacao||0),quartos:Number(obj.dormitorios||0),banheiros:Number(obj.banheiros||0),vagas:Number(obj.vagas||0),area:Number(obj.area_util||0),foto:imovelFotosNovas[0]?.preview||''}; if(editMode.id)Object.assign(imoveis.find(x=>String(x.id)===String(editMode.id)),local);else imoveis.unshift(local);persistAll();renderAll();$('#imovelDialog').close();
});
$('#propForm').addEventListener('submit',async e=>{
 if(e.submitter?.value==='cancel') return;
 e.preventDefault();
 const form=e.target, fd=new FormData(form);
 const obj=Object.fromEntries(fd);
 if(isRealMode() && supabaseClient){
   const imobiliariaId=currentProfile?.perfil==='admin_master' ? obj.imobiliaria_id : currentProfile?.imobiliaria_id;
   if(!imobiliariaId){ alert('Selecione a imobiliária.'); return; }
   const payload={
     imobiliaria_id:imobiliariaId,
     nome:obj.nome?.trim(),
     tipo_pessoa:obj.tipo_pessoa||'fisica',
     cpf_cnpj:obj.cpf_cnpj?.trim()||null,
     email:obj.email?.trim()||null,
     telefone:obj.telefone?.trim()||null,
     whatsapp:obj.whatsapp?.trim()||null,
     cidade:obj.cidade?.trim()||null,
     estado:obj.estado?.trim()||null,
     chave_pix:obj.chave_pix?.trim()||null,
     observacoes:obj.observacoes?.trim()||null,
     atualizado_em:new Date().toISOString()
   };
   try{
     let result;
     if(editMode.id) result=await supabaseClient.from('imob_proprietarios').update(payload).eq('id',editMode.id).select().single();
     else result=await supabaseClient.from('imob_proprietarios').insert(payload).select().single();
     if(result.error) throw result.error;
     await loadRealProprietarios();
     $('#propDialog').close(); renderAll();
   }catch(err){ alert('Não foi possível salvar o proprietário: '+(err.message||err)); }
   return;
 }
 const local={...obj,id:editMode.id||Date.now(),documento:obj.cpf_cnpj};
 if(editMode.id) Object.assign(props.find(x=>String(x.id)===String(editMode.id)),local); else props.unshift(local);
 persistAll(); $('#propDialog').close(); renderAll();
});

function localDateTimeValue(d=new Date()){const z=n=>String(n).padStart(2,'0');return `${d.getFullYear()}-${z(d.getMonth()+1)}-${z(d.getDate())}T${z(d.getHours())}:${z(d.getMinutes())}`;}
function openPagamentoDialog(id){
 const item=db.cobrancas.find(x=>String(x.id)===String(id));if(!item)return;
 const total=Number(item.valor_total||item.valor||0),pago=Number(item.valor_pago||0),saldo=Math.max(0,total-pago);
 const f=$('#pagamentoForm');f.reset();f.elements.cobranca_id.value=id;f.elements.valor.value=saldo.toFixed(2);f.elements.valor.max=saldo.toFixed(2);f.elements.data_pagamento.value=localDateTimeValue();f.elements.meio_pagamento.value=(item.meio_pagamento||item.forma_pagamento||'pix').toLowerCase();if(![...f.elements.meio_pagamento.options].some(o=>o.value===f.elements.meio_pagamento.value))f.elements.meio_pagamento.value='outro';
 $('#pagamentoSubtitulo').textContent=`${item.descricao} · ${item.inquilino||'Inquilino'}`;$('#pagamentoValorCobranca').textContent=brl(total);$('#pagamentoJaRecebido').textContent=brl(pago);$('#pagamentoSaldo').textContent=brl(saldo);updatePagamentoPreview();$('#pagamentoDialog').showModal();
}
function updatePagamentoPreview(){const f=$('#pagamentoForm');if(!f)return;const id=f.elements.cobranca_id.value,item=db.cobrancas.find(x=>String(x.id)===String(id));if(!item)return;const total=Number(item.valor_total||item.valor||0),pago=Number(item.valor_pago||0),saldo=Math.max(0,total-pago),valor=Number(f.elements.valor.value||0),restante=Math.max(0,saldo-valor),box=$('#pagamentoResultado');if(valor<=0){box.className='payment-result';box.textContent='Informe o valor recebido.';return;}if(valor>saldo+.005){box.className='payment-result partial';box.textContent=`O valor informado ultrapassa o saldo de ${brl(saldo)}.`;return;}if(restante>.005){box.className='payment-result partial';box.textContent=`Pagamento parcial · saldo restante após a baixa: ${brl(restante)}.`;}else{box.className='payment-result paid';box.textContent='Pagamento total · esta cobrança será marcada como Paga.';}}
async function submitPagamento(e){e.preventDefault();const f=e.currentTarget,id=f.elements.cobranca_id.value,item=db.cobrancas.find(x=>String(x.id)===String(id));if(!item)return;const total=Number(item.valor_total||item.valor||0),pago=Number(item.valor_pago||0),saldo=Math.max(0,total-pago),valor=Number(f.elements.valor.value||0);if(!Number.isFinite(valor)||valor<=0){showToast('Informe um valor válido.','error');return;}if(valor>saldo+.005){showToast(`O pagamento não pode ultrapassar o saldo de ${brl(saldo)}.`,'error');return;}const btn=$('#pagamentoConfirmar'),old=btn.textContent;btn.disabled=true;btn.textContent='Registrando...';try{const dataLocal=f.elements.data_pagamento.value;if(!dataLocal)throw new Error('Informe a data do pagamento.');const {data:pagamentoId,error}=await supabaseClient.rpc('imob_registrar_pagamento_manual',{p_cobranca_id:id,p_valor:valor,p_meio_pagamento:f.elements.meio_pagamento.value,p_data_pagamento:new Date(dataLocal).toISOString(),p_observacoes:f.elements.observacoes.value.trim()||null});if(error)throw error;const file=f.elements.comprovante.files?.[0];if(file&&pagamentoId){if(file.size>20*1024*1024)throw new Error('O comprovante deve ter no máximo 20 MB.');const safe=file.name.replace(/[^a-zA-Z0-9._-]/g,'_'),path=`${currentProfile.imobiliaria_id}/pagamentos/${pagamentoId}/${Date.now()}-${safe}`;const up=await supabaseClient.storage.from('imob-documentos').upload(path,file,{upsert:false,contentType:file.type});if(up.error)throw up.error;const upd=await supabaseClient.from('imob_pagamentos').update({comprovante_url:path,atualizado_em:new Date().toISOString()}).eq('id',pagamentoId);if(upd.error){await supabaseClient.storage.from('imob-documentos').remove([path]);throw upd.error;}}
 try{await processarReguaFinanceira();}catch(_){}await loadRealCobrancas();await loadRealFinanceiro();await loadNotifications();$('#pagamentoDialog').close();renderAll();showToast(valor<saldo-.005?`Pagamento parcial de ${brl(valor)} registrado.`:`Pagamento de ${brl(valor)} registrado e cobrança quitada.`,'success');}catch(err){showToast('Não foi possível registrar o pagamento: '+(err.message||err),'error');}finally{btn.disabled=false;btn.textContent=old;}}

$('#pagamentoForm')?.addEventListener('submit',submitPagamento);$('#pagamentoForm')?.elements.valor?.addEventListener('input',updatePagamentoPreview);$('#pagamentoClose')?.addEventListener('click',()=>$('#pagamentoDialog').close());$('#pagamentoCancel')?.addEventListener('click',()=>$('#pagamentoDialog').close());


function openRepasseDialog(id){
 const item=db.financeiro.find(x=>String(x.id)===String(id));if(!item)return;const f=$('#repasseForm');f.reset();f.elements.financeiro_id.value=id;f.elements.data_repasse.value=localDateTimeValue();f.elements.meio_repasse.value='pix';$('#repasseSubtitulo').textContent=`${item.proprietario_nome||'Proprietário'} · ${formatDateBR(item.competencia)}`;$('#repasseValor').textContent=brl(item.valor);$('#repassePrevisto').textContent=formatDateBR(item.data_prevista_repasse||item.data_vencimento);$('#repasseDialog').showModal();
}
async function submitRepasse(e){e.preventDefault();const f=e.currentTarget,id=f.elements.financeiro_id.value,item=db.financeiro.find(x=>String(x.id)===String(id));if(!item)return;const btn=$('#repasseConfirmar'),old=btn.textContent;btn.disabled=true;btn.textContent='Confirmando...';try{const dt=f.elements.data_repasse.value;if(!dt)throw new Error('Informe a data do repasse.');let comprovante=null;const file=f.elements.comprovante.files?.[0];if(file){if(file.size>20*1024*1024)throw new Error('O comprovante deve ter no máximo 20 MB.');const safe=file.name.replace(/[^a-zA-Z0-9._-]/g,'_'),path=`${currentProfile.imobiliaria_id}/repasses/${id}/${Date.now()}-${safe}`;const up=await supabaseClient.storage.from('imob-documentos').upload(path,file,{upsert:false,contentType:file.type});if(up.error)throw up.error;comprovante=path;}const payload={status:'pago',data_pagamento:new Date(dt).toISOString(),data_repasse_efetiva:new Date(dt).toISOString(),meio_repasse:f.elements.meio_repasse.value,observacoes_repasse:f.elements.observacoes.value.trim()||null,atualizado_em:new Date().toISOString()};if(comprovante)payload.comprovante_repasse_url=comprovante;const {error}=await supabaseClient.from('imob_financeiro').update(payload).eq('id',id);if(error)throw error;try{await processarReguaFinanceira();}catch(_){}await loadRealFinanceiro();await loadNotifications();$('#repasseDialog').close();renderAll();showToast(`Repasse de ${brl(item.valor)} confirmado.`,'success');}catch(err){showToast('Não foi possível confirmar o repasse: '+(err.message||err),'error');}finally{btn.disabled=false;btn.textContent=old;}}
$('#repasseForm')?.addEventListener('submit',submitRepasse);$('#repasseClose')?.addEventListener('click',()=>$('#repasseDialog').close());$('#repasseCancel')?.addEventListener('click',()=>$('#repasseDialog').close());

function bindActions(){
 $$('[data-view-imovel]').forEach(c=>c.onclick=e=>{if(e.target.closest('button'))return;const item=imoveis.find(x=>String(x.id)===String(c.dataset.viewImovel));if(item)openImovelDetalhe(item);});
 $$('[data-create]').forEach(b=>b.onclick=()=>b.dataset.create==='contratos'?openContrato():genericOpen(b.dataset.create));
 $$('[data-edit]').forEach(b=>b.onclick=()=>{const type=b.dataset.edit,id=b.dataset.id;if(type==='imoveis')openImovel(imoveis.find(x=>String(x.id)===id));else if(type==='props')openProp(props.find(x=>String(x.id)===id));else if(type==='inquilinos')openInquilino(db.inquilinos.find(x=>String(x.id)===id));else if(type==='contratos')openContrato(db.contratos.find(x=>String(x.id)===id));else genericOpen(type,db[type].find(x=>String(x.id)===id));});
 $$('[data-baixa-cobranca]').forEach(b=>b.onclick=()=>openPagamentoDialog(b.dataset.baixaCobranca));
 $$('[data-payment-detail]').forEach(b=>b.onclick=()=>{const x=db.cobrancas.find(c=>String(c.id)===String(b.dataset.paymentDetail));if(!x)return;const parts=[`Cobrança: ${x.descricao}`,`Inquilino: ${x.inquilino}`,`Valor: ${brl(x.valor)}`,`Pago: ${brl(Number(x.valor_pago||0))}`,`Vencimento: ${x.vencimento||'-'}`,`Status: ${x.status}`,`Meio: ${x.meio_pagamento||x.forma_pagamento||'-'}`,`Provedor: ${x.provider||'-'}`,x.pix_copia_cola?`PIX Copia e Cola: ${x.pix_copia_cola}`:'',x.boleto_linha_digitavel?`Linha digitável: ${x.boleto_linha_digitavel}`:'',x.boleto_url?`Boleto: ${x.boleto_url}`:''].filter(Boolean);alert(parts.join('\n'));});
 $$('[data-pagar-repasse]').forEach(b=>b.onclick=()=>openRepasseDialog(b.dataset.pagarRepasse));
 const refreshRule=$('#refreshFinanceRule');if(refreshRule)refreshRule.onclick=async()=>{refreshRule.disabled=true;const old=refreshRule.textContent;refreshRule.textContent='Atualizando...';try{await processarReguaFinanceira();await loadRealCobrancas();await loadRealFinanceiro();await loadNotifications();renderAll();alert('Régua financeira atualizada.');}catch(err){alert('Não foi possível atualizar a régua. Rode a migração V6.1 no Supabase. Detalhe: '+(err.message||err));}finally{refreshRule.disabled=false;refreshRule.textContent=old;}};
 $$('[data-delete]').forEach(b=>b.onclick=async()=>{const type=b.dataset.delete,id=b.dataset.id;if(!confirm('Deseja realmente excluir este registro?'))return;
   if(type==='imoveis' && isRealMode() && supabaseClient){
     try{
       const item=imoveis.find(x=>String(x.id)===String(id));
       const paths=(item?.fotos||[]).map(f=>storagePathFromPublicUrl(f.url)).filter(Boolean);
       if(paths.length){const sr=await supabaseClient.storage.from('imob-imoveis').remove(paths);if(sr.error)console.warn('Não foi possível remover todas as fotos do Storage:',sr.error);}
       const {error}=await supabaseClient.from('imob_imoveis').delete().eq('id',id);if(error)throw error;await loadRealImoveis();renderAll();
     }
     catch(err){alert('Não foi possível excluir o imóvel. Se ele estiver vinculado a contrato, venda ou outro registro, mantenha-o como inativo. Detalhe: '+(err.message||err));} return;
   }
   if(type==='props' && isRealMode() && supabaseClient){
     try{
       const {error}=await supabaseClient.from('imob_proprietarios').delete().eq('id',id);
       if(error) throw error;
       await loadRealProprietarios(); renderAll();
     }catch(err){ alert('Não foi possível excluir o proprietário. Se ele estiver vinculado a um contrato, o cadastro deve ser mantido. Detalhe: '+(err.message||err)); }
     return;
   }
   if(type==='inquilinos' && isRealMode() && supabaseClient){
     try{
       const {error}=await supabaseClient.from('imob_inquilinos').delete().eq('id',id);
       if(error) throw error;
       await loadRealInquilinos(); renderAll();
     }catch(err){ alert('Não foi possível excluir o inquilino. Se ele estiver vinculado a um contrato, mantenha o cadastro como inativo. Detalhe: '+(err.message||err)); }
     return;
   }
   if(type==='contratos' && isRealMode() && supabaseClient){
     try{
       const {error}=await supabaseClient.from('imob_contratos').delete().eq('id',id);
       if(error) throw error;
       await loadRealContratos(); renderAll();
     }catch(err){ alert('Não foi possível excluir o contrato. Se houver cobranças, documentos ou lançamentos vinculados, encerre/cancele o contrato em vez de excluir. Detalhe: '+(err.message||err)); }
     return;
   }
   if(realTableMap[type] && isRealMode() && supabaseClient){
     try{const {error}=await supabaseClient.from(realTableMap[type]).delete().eq('id',id);if(error)throw error;await realLoaderMap[type]();renderAll();if(imovelDetalheAtual)await refreshImovelDetalhe();}
     catch(err){alert('Não foi possível excluir o registro: '+(err.message||err));}return;
   }
   if(type==='imoveis')imoveis=imoveis.filter(x=>String(x.id)!==id);else if(type==='props')props=props.filter(x=>String(x.id)!==id);else db[type]=db[type].filter(x=>String(x.id)!==id);persistAll();renderAll();});
}
$('#cfgImobiliaria')?.addEventListener('change',e=>{const imob=db.imobiliarias.find(x=>String(x.id)===String(e.target.value));fillCustomizer(imob||null);});
['cfgNome','cfgSlogan','cfgCor1','cfgCor2','cfgFundo','cfgTextoSidebar','cfgFonte'].forEach(id=>$('#'+id)?.addEventListener('input',updateCustomizerPreview));
document.addEventListener('click',e=>{const b=e.target.closest('[data-customize-agency]');if(!b)return;const imob=db.imobiliarias.find(x=>String(x.id)===String(b.dataset.customizeAgency));customAgency=imob||null;go('configuracoes');renderConfig();});
$('#salvarConfigBtn').onclick=async()=>{
 if(currentProfile?.perfil!=='admin_master'&&!cfg.demoMode){alert('A personalização é exclusiva do Admin Master.');return;} if(!customAgency){alert('Selecione uma imobiliária.');return;}
 try{
  let logoUrl=customAgency.logo_url||null;const file=$('#cfgLogo')?.files?.[0];
  if(file&&isRealMode()){const ext=(file.name.split('.').pop()||'png').toLowerCase();const path=`${customAgency.id}/logo-${Date.now()}.${ext}`;const up=await supabaseClient.storage.from('imob-branding').upload(path,file,{upsert:true,contentType:file.type});if(up.error)throw up.error;const pub=supabaseClient.storage.from('imob-branding').getPublicUrl(path);logoUrl=pub.data.publicUrl;}
  const payload={nome_fantasia:$('#cfgNome').value.trim(),slogan:$('#cfgSlogan').value.trim(),logo_url:logoUrl,cor_primaria:$('#cfgCor1').value,cor_secundaria:$('#cfgCor2').value,cor_fundo:$('#cfgFundo').value,cor_texto_sidebar:$('#cfgTextoSidebar').value,fonte:$('#cfgFonte').value,creci:$('#cfgCreci').value.trim(),status:$('#cfgStatus').value,atualizado_em:new Date().toISOString()};
  if(isRealMode()){const {error}=await supabaseClient.from('imob_imobiliarias').update(payload).eq('id',customAgency.id);if(error)throw error;await loadRealImobiliarias();customAgency=db.imobiliarias.find(x=>String(x.id)===String(customAgency.id));}
  else Object.assign(customAgency,payload);
  fillCustomizer(customAgency);renderAll();alert('Personalização salva. Ela será aplicada somente após o usuário dessa imobiliária entrar.');
 }catch(err){alert('Não foi possível salvar a personalização: '+(err.message||err));}
};
$('#globalSearch').addEventListener('input',e=>{if(e.target.value.trim()){go('imoveis');$('#searchImovel').value=e.target.value;renderImoveis();bindActions();}});
$('#notifBtn').onclick=()=>{ renderNotifications(); $('#notifDialog').showModal(); };$('#helpBtn').onclick=()=>$('#helpDialog').showModal();

// ===== Relatórios =====
let currentReportRows=[];
let currentReportHeaders=[];
function reportTable(headers, rows){
 currentReportHeaders=headers; currentReportRows=rows;
 const head=headers.map(h=>`<th>${h}</th>`).join('');
 const body=rows.length?rows.map(r=>`<tr>${r.map(v=>`<td>${v ?? '-'}</td>`).join('')}</tr>`).join(''):`<tr><td colspan="${headers.length}" class="muted">Nenhum registro para este relatório.</td></tr>`;
 return `<div class="report-table-wrap"><table class="report-table"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
}
function reportStats(items){return `<div class="report-stats">${items.map(([v,l])=>`<div class="report-stat"><b>${v}</b><small>${l}</small></div>`).join('')}</div>`}
function openReport(type){
 let title='',summary='',html='';
 if(type==='carteira'){
   title='Carteira de imóveis'; summary='Visão consolidada dos imóveis cadastrados na plataforma.';
   const disponiveis=imoveis.filter(i=>i.status==='Disponível').length, alugados=imoveis.filter(i=>i.status==='Alugado').length, vendidos=imoveis.filter(i=>i.status==='Vendido').length;
   html=reportStats([[imoveis.length,'Total de imóveis'],[disponiveis,'Disponíveis'],[alugados,'Alugados'],[vendidos,'Vendidos']])+reportTable(['Código','Imóvel','Finalidade','Status','Bairro','Valor'],imoveis.map(i=>[i.codigo,i.titulo,i.finalidade,i.status,i.bairro,brl(i.valor)]));
 }else if(type==='financeiro'){
   title='Financeiro'; summary='Recebimentos, repasses, receitas e despesas registrados.';
   const total=db.financeiro.reduce((a,x)=>a+Number(x.valor||0),0), recebidos=db.financeiro.filter(x=>/recebid|pago/i.test(x.status||'')).reduce((a,x)=>a+Number(x.valor||0),0), pendentes=db.financeiro.filter(x=>/pend/i.test(x.status||'')).reduce((a,x)=>a+Number(x.valor||0),0);
   html=reportStats([[brl(total),'Movimentado'],[brl(recebidos),'Recebido'],[brl(pendentes),'Pendente'],[db.financeiro.length,'Lançamentos']])+reportTable(['Data','Descrição','Tipo','Valor','Status'],db.financeiro.map(x=>[x.data,x.descricao,x.tipo,brl(x.valor),x.status]));
 }else if(type==='inadimplencia'){
   title='Inadimplência'; summary='Cobranças em atraso ou ainda pendentes.';
   const pend=db.cobrancas.filter(x=>/pendente|atrasado/i.test(x.status||'')); const atras=db.cobrancas.filter(x=>/atrasado/i.test(x.status||'')); const valor=pend.reduce((a,x)=>a+Number(x.valor||0),0);
   html=reportStats([[pend.length,'Pendências'],[atras.length,'Em atraso'],[brl(valor),'Valor pendente'],[db.cobrancas.length,'Cobranças totais']])+reportTable(['Descrição','Inquilino','Valor','Vencimento','Status'],pend.map(x=>[x.descricao,x.inquilino,brl(x.valor),x.vencimento,x.status]));
 }else if(type==='vendas'){
   title='Vendas'; summary='Funil comercial, valores negociados e comissão prevista.';
   const total=db.vendas.reduce((a,x)=>a+Number(x.valor||0),0); const comissao=db.vendas.reduce((a,x)=>a+(Number(x.valor||0)*Number(x.comissao||0)/100),0); const concl=db.vendas.filter(x=>/conclu|fech/i.test(x.etapa||'')).length;
   html=reportStats([[db.vendas.length,'Negociações'],[concl,'Fechamentos'],[brl(total),'Volume negociado'],[brl(comissao),'Comissão prevista']])+reportTable(['Cliente','Imóvel','Etapa','Valor','Comissão'],db.vendas.map(x=>[x.cliente,x.imovel,x.etapa,brl(x.valor),`${x.comissao}%`]));
 }
 $('#reportTitle').textContent=title; $('#reportSummary').textContent=summary; $('#reportContent').innerHTML=html; $('#reportDialog').showModal();
}
function csvEscape(v){const s=String(v??'').replace(/<[^>]*>/g,'');return `"${s.replace(/"/g,'""')}"`}
function exportCurrentReport(){
 const rows=[currentReportHeaders,...currentReportRows].map(r=>r.map(csvEscape).join(';')).join('\n');
 const blob=new Blob(['\ufeff'+rows],{type:'text/csv;charset=utf-8;'}); const a=document.createElement('a');
 a.href=URL.createObjectURL(blob); a.download=($('#reportTitle').textContent||'relatorio').toLowerCase().replace(/[^a-z0-9]+/gi,'_')+'.csv'; a.click(); URL.revokeObjectURL(a.href);
}
function bindReports(){
 $$('[data-report]').forEach(c=>{c.onclick=()=>openReport(c.dataset.report);c.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();openReport(c.dataset.report)}}});
}
bindReports();
$('#reportClose').onclick=$('#reportCloseBottom').onclick=()=>$('#reportDialog').close();
$('#reportExport').onclick=exportCurrentReport;

// ===== V6.2.1 Usuários e acessos =====
$('#novoUsuarioBtn')?.addEventListener('click',openUsuarioDialog);
$('#usuarioClose')?.addEventListener('click',()=>$('#usuarioDialog').close());
$('#usuarioCancel')?.addEventListener('click',()=>$('#usuarioDialog').close());
$('#usuarioPerfil')?.addEventListener('change',e=>renderPermissionGrid(e.target.value));
$('#usuarioForm')?.addEventListener('submit',async e=>{e.preventDefault();if(!isTenantOwner()){alert('Somente o Dono pode administrar usuários.');return;}const fd=new FormData(e.currentTarget);const perms={};$$('[data-perm-module]').forEach(c=>{perms[c.dataset.permModule]||={};perms[c.dataset.permModule][c.dataset.permOp]=c.checked;});try{const {data,error}=await supabaseClient.rpc('imob_criar_convite_usuario',{p_email:String(fd.get('email')).trim().toLowerCase(),p_nome:String(fd.get('nome')).trim(),p_perfil:String(fd.get('perfil')),p_permissoes:perms});if(error)throw error;$('#usuarioDialog').close();alert('Convite criado. Código de ativação: '+data+'\n\nEnvie este código ao novo usuário. A ativação da conta usa o fluxo de convite da Plataforma.');}catch(err){alert('Não foi possível criar o convite: '+(err.message||err));}});

setTimeout(()=>{bindSmartFilters();Object.keys(smartCfg).forEach(renderSmart)},0);


// V6.7.5 — WhatsApp Embedded Signup (Meta)
let metaSdkReady=false;
window.fbAsyncInit=function(){
  if(!cfg.metaAppId)return;
  try{FB.init({appId:cfg.metaAppId,cookie:true,xfbml:false,version:'v23.0'});metaSdkReady=true;renderMetaEmbeddedStatus();}catch(err){console.warn('Meta SDK:',err);}
};
function loadMetaSdk(){
  if(window.FB){ window.fbAsyncInit(); return; }
  if(document.getElementById('facebook-jssdk')) return;
  const js=document.createElement('script');
  js.id='facebook-jssdk';
  js.async=true; js.defer=true; js.crossOrigin='anonymous';
  js.src='https://connect.facebook.net/pt_BR/sdk.js';
  js.onerror=()=>{const el=$('#metaEmbeddedStatus');if(el)el.textContent='Não foi possível carregar o SDK da Meta. Verifique bloqueadores de conteúdo e tente novamente.';};
  document.head.appendChild(js);
}
function renderMetaEmbeddedStatus(){
 const el=$('#metaEmbeddedStatus'),btn=$('#conectarMetaWhatsapp');if(!el||!btn)return;
 const ready=!!cfg.metaAppId&&!!cfg.whatsappEmbeddedConfigId;
 btn.disabled=!ready;
 el.textContent=!ready?'Informe metaAppId e whatsappEmbeddedConfigId em js/config.js antes de publicar.':(metaSdkReady?'Pronto para iniciar o Cadastro Incorporado da Meta.':'Configuração encontrada. Aguardando SDK da Meta...');
}
function metaEmbeddedMessage(event){
 if(!event.origin?.includes('facebook.com'))return;
 let data=event.data;try{if(typeof data==='string')data=JSON.parse(data);}catch(_){return;}
 if(!data||data.type!=='WA_EMBEDDED_SIGNUP')return;
 const el=$('#metaEmbeddedStatus');
 if(data.event==='FINISH'){if(el)el.textContent='Cadastro concluído na Meta. Finalizando vínculo seguro no backend...';}
 else if(data.event==='CANCEL'){if(el)el.textContent='Cadastro cancelado antes da conclusão.';}
 else if(data.event==='ERROR'){if(el)el.textContent='A Meta informou um erro durante o cadastro.';}
}
window.addEventListener('message',metaEmbeddedMessage);
$('#abrirGatewayWhatsapp')?.addEventListener('click',()=>{
  const tab=document.querySelector('[data-com-tab="whatsapp"]');
  if(tab) tab.click();
  setTimeout(()=>$('#conectarMetaWhatsapp')?.scrollIntoView({behavior:'smooth',block:'center'}),80);
});
$('#conectarMetaWhatsapp')?.addEventListener('click',()=>{
 if(!cfg.metaAppId||!cfg.whatsappEmbeddedConfigId){showToast('Configure o App ID e o Configuration ID da Meta antes de conectar.','error');return;}
 if(!window.FB||!metaSdkReady){showToast('O SDK da Meta ainda está carregando. Tente novamente em alguns segundos.','error');return;}
 FB.login((response)=>{
   const code=response?.authResponse?.code;
   if(code){
     const el=$('#metaEmbeddedStatus');if(el)el.textContent='Autorização recebida. O código temporário deve ser trocado pelo backend; nenhum token será salvo no navegador.';
     // A troca do code por token deve ocorrer exclusivamente na Edge Function imob-whatsapp-oauth.
     // Não persistimos code/token no localStorage nem no HTML.
   }else{showToast('Conexão com a Meta não foi concluída.','error');}
 },{config_id:cfg.whatsappEmbeddedConfigId,response_type:'code',override_default_response_type:true,extras:{setup:{},featureType:'',sessionInfoVersion:'3'}});
});
setTimeout(()=>{renderMetaEmbeddedStatus();loadMetaSdk();},0);
