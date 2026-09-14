const cfg = window.ZAMAR_CONFIG || {};
const $ = (s)=>document.querySelector(s);
const $$ = (s)=>[...document.querySelectorAll(s)];
const brl = v => Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const fallbackPhoto='https://images.unsplash.com/photo-1564013799919-ab600027ffc6?auto=format&fit=crop&w=900&q=80';
const save=(k,v)=>localStorage.setItem('zamar_'+k,JSON.stringify(v));
const load=(k,seed)=>JSON.parse(localStorage.getItem('zamar_'+k)||'null')||seed;

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
const isRealMode=()=>!cfg.demoMode && !!cfg.supabaseUrl && !!cfg.supabaseAnonKey;

function humanRole(role){
 const map={admin_master:'Admin Master',admin_imobiliaria:'Administrador',corretor:'Corretor',financeiro:'Financeiro',proprietario:'Proprietário',inquilino:'Inquilino'};
 return map[role]||'Usuário';
}
function initials(name='Usuário'){return name.split(/\s+/).filter(Boolean).slice(0,2).map(x=>x[0]).join('').toUpperCase()||'US'}
function applyAccessControl(){
 const master=currentProfile?.perfil==='admin_master';
 const adminBtn=$('#adminMasterNav');
 if(adminBtn) adminBtn.style.display=master?'':'none';
 // Segurança visual: se alguém estava na página master e perde acesso, volta ao dashboard.
 if(!master && $('#adminmaster')?.classList.contains('active')) go('dashboard');
 // Configurações estruturais ficam para master ou administrador da imobiliária.
 const cfgBtn=$('#nav button[data-page="configuracoes"]');
 if(cfgBtn) cfgBtn.style.display=(master||currentProfile?.perfil==='admin_imobiliaria'||cfg.demoMode)?'':'none';
}
function applyUserUI(){
 const name=currentProfile?.nome || currentUser?.email || 'Carlos Zamar';
 $('#userName').textContent=name;
 $('#userRole').textContent=cfg.demoMode?'Demonstração':humanRole(currentProfile?.perfil);
 $('#userAvatar').textContent=initials(name);
}
function applyTenantBrand(){
 const imob=currentImobiliaria;
 if(!imob) return;
 const primary=imob.cor_primaria || '#F5C400';
 const secondary=imob.cor_secundaria || '#111111';
 document.documentElement.style.setProperty('--yellow', primary);
 document.documentElement.style.setProperty('--black', secondary);
 const slogan=imob.slogan || 'SEU SONHO TEM NOME, ZAMAR IMÓVEIS';
 const hero=$('#dashboard .hero strong'); if(hero) hero.textContent='“'+slogan+'”';
 const heroP=$('#dashboard .hero p'); if(heroP) heroP.textContent='Aqui está o resumo da '+(imob.nome_fantasia || imob.nome || 'imobiliária')+'.';
 const foot=document.querySelector('.sidebar-foot'); if(foot) foot.innerHTML=`${imob.nome_fantasia || imob.nome || 'Imobiliária'}<br><small>${imob.creci ? 'CRECI '+imob.creci : 'Plataforma Imobiliária'}</small>`;
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
 loadNotifications();
}
async function loadRealImobiliarias(){
 if(!isRealMode() || !supabaseClient || !currentProfile) return;
 if(currentProfile.perfil==='admin_master'){
   const {data,error}=await supabaseClient.from('imob_imobiliarias').select('id,nome,nome_fantasia,creci,status,cor_primaria').order('nome');
   if(error) throw error;
   db.imobiliarias=(data||[]).map(x=>({id:x.id,nome:x.nome_fantasia||x.nome,creci:x.creci||'',plano:'',cor:x.cor_primaria||'#F5C400',status:x.status==='ativo'?'Ativa':'Inativa'}));
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
   .select('id,imobiliaria_id,imovel_id,proprietario_id,inquilino_id,codigo,status,data_inicio,data_fim,dia_vencimento,valor_aluguel,primeira_parcela_imobiliaria,taxa_administracao_tipo,taxa_administracao_valor,multa_atraso_percentual,juros_atraso_percentual_mes,reajuste_indice,reajuste_periodicidade_meses,garantia_tipo,garantia_valor,observacoes,ativo,criado_em,atualizado_em')
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
 await loadRealCobrancas();
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
 if(page==='adminmaster' && currentProfile?.perfil!=='admin_master'){page='dashboard';}
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

const actionBtns=(type,id)=>`<div class="actions"><button class="mini edit" data-edit="${type}" data-id="${id}">Editar</button><button class="mini danger" data-delete="${type}" data-id="${id}">Excluir</button></div>`;
function propertyPrice(i){
 if(i.finalidade==='Venda e Locação') return `${brl(i.valor_venda)} <small>venda</small><br>${brl(i.valor_locacao)}<small>/mês</small>`;
 if(i.finalidade==='Locação') return `${brl(i.valor_locacao ?? i.valor)}<small>/mês</small>`;
 return brl(i.valor_venda ?? i.valor);
}
function card(i){const imob=db.imobiliarias.find(x=>String(x.id)===String(i.imobiliaria_id));return `<article class="property property-clickable" data-view-imovel="${i.id}" title="Clique para abrir a ficha completa do imóvel"><div class="photo" style="background-image:url('${escapeHtml(i.foto||fallbackPhoto)}')"><span class="badge">${escapeHtml(i.finalidade)}</span>${i.publicado_site?'<span class="site-badge">🌐 Publicado</span>':''}</div><div class="body"><h4>${escapeHtml(i.titulo)}</h4>${currentProfile?.perfil==='admin_master'&&imob?`<small class="muted">${escapeHtml(imob.nome)}</small>`:''}<div class="meta"><span>🛏 ${i.quartos||0}</span><span>🛁 ${i.banheiros||0}</span><span>🚗 ${i.vagas||0}</span><span>📐 ${i.area||0}m²</span></div><div class="price">${propertyPrice(i)}</div><small>${escapeHtml(i.bairro||'')} · ${escapeHtml(i.cidade||'')}</small>${actionBtns('imoveis',i.id)}</div></article>`}
function renderImoveis(){let q=($('#searchImovel')?.value||'').toLowerCase(),f=$('#filterFinalidade')?.value||'',s=$('#filterStatus')?.value||'';let data=imoveis.filter(i=>(!q||`${i.titulo} ${i.bairro} ${i.codigo}`.toLowerCase().includes(q))&&(!f||i.finalidade===f)&&(!s||i.status===s));$('#imoveisGrid').innerHTML=data.map(card).join('')||'<div class="empty">Nenhum imóvel encontrado.</div>';$('#featured').innerHTML=imoveis.filter(i=>i.destaque).slice(0,4).map(card).join('')||imoveis.slice(0,4).map(card).join('');}
function renderProps(){
 const table=$('#propTable'); if(!table) return;
 table.innerHTML=props.map(p=>{
   const imob=db.imobiliarias.find(i=>String(i.id)===String(p.imobiliaria_id));
   const nomeImob=currentProfile?.perfil==='admin_master' && imob ? `<small class="muted">${escapeHtml(imob.nome)}</small>` : '';
   return `<tr><td><strong>${escapeHtml(p.nome||'')}</strong>${nomeImob}</td><td>${escapeHtml(p.cpf_cnpj||p.documento||'-')}</td><td>${escapeHtml(p.telefone||'-')}</td><td>${escapeHtml(p.email||'-')}</td><td>${imoveis.filter(i=>String(i.proprietario_id)===String(p.id)).length}</td><td>${actionBtns('props',p.id)}</td></tr>`;
 }).join('') || '<tr><td colspan="6" class="muted">Nenhum proprietário cadastrado.</td></tr>';
}
function statusClass(v){return /ativo|em dia|recebido|validado|conclu|pago|disponível|ativa/i.test(v||'')?'ok':'warn'}
function rows(id,html){const el=$(id);if(el)el.innerHTML=html||'<tr><td colspan="8" class="muted">Nenhum registro.</td></tr>'}
function renderOthers(){
 rows('#inquilinosTable',db.inquilinos.map(x=>`<tr><td>${x.nome}</td><td>${x.documento||'-'}</td><td>${x.telefone||'-'}</td><td>${x.email||'-'}</td><td><span class="status ${statusClass(x.status)}">${x.status||'-'}</span></td><td>${actionBtns('inquilinos',x.id)}</td></tr>`).join(''));
 rows('#contratosTable',db.contratos.map(x=>`<tr><td>${x.codigo}</td><td>${x.imovel}</td><td>${x.inquilino}</td><td>${brl(x.valor)}</td><td>Dia ${x.vencimento}</td><td><span class="status ${statusClass(x.status)}">${x.status}</span></td><td>${actionBtns('contratos',x.id)}</td></tr>`).join(''));
 rows('#cobrancasTable',db.cobrancas.map(x=>`<tr><td>${x.descricao}</td><td>${x.inquilino}</td><td>${brl(x.valor)}</td><td>${x.vencimento||'-'}</td><td><span class="status ${statusClass(x.status)}">${x.status}</span></td><td><div class="actions">${x.status_raw!=='pago'?`<button class="mini edit" data-baixa-cobranca="${x.id}">Dar baixa</button>`:''}<button class="mini edit" data-edit="cobrancas" data-id="${x.id}">Editar</button><button class="mini danger" data-delete="cobrancas" data-id="${x.id}">Excluir</button></div></td></tr>`).join(''));
 rows('#financeiroTable',db.financeiro.map(x=>`<tr><td>${x.data||'-'}</td><td>${x.descricao}</td><td>${x.tipo}</td><td>${brl(x.valor)}</td><td><span class="status ${statusClass(x.status)}">${x.status}</span></td><td>${actionBtns('financeiro',x.id)}</td></tr>`).join(''));
 rows('#vendasTable',db.vendas.map(x=>`<tr><td>${x.cliente}</td><td>${x.imovel}</td><td>${x.etapa}</td><td>${brl(x.valor)}</td><td>${x.comissao}%</td><td>${actionBtns('vendas',x.id)}</td></tr>`).join(''));
 rows('#vistoriasTable',db.vistorias.map(x=>`<tr><td>${x.data}</td><td>${x.imovel}</td><td>${x.tipo}</td><td>${x.responsavel}</td><td><span class="status ${statusClass(x.status)}">${x.status}</span></td><td>${actionBtns('vistorias',x.id)}</td></tr>`).join(''));
 rows('#manutencoesTable',db.manutencoes.map(x=>`<tr><td>${x.chamado}</td><td>${x.imovel}</td><td>${x.descricao}</td><td><span class="status ${statusClass(x.status)}">${x.status}</span></td><td>${brl(x.valor)}</td><td>${actionBtns('manutencoes',x.id)}</td></tr>`).join(''));
 renderDocumentosTable();
 rows('#imobiliariasTable',db.imobiliarias.map(x=>`<tr><td><strong>${x.nome}</strong></td><td>${x.creci||'-'}</td><td>${x.plano||'-'}</td><td><span class="color-dot" style="background:${x.cor}"></span>${x.cor}</td><td><span class="status ${statusClass(x.status)}">${x.status}</span></td><td>${actionBtns('imobiliarias',x.id)}</td></tr>`).join(''));
}

function formatDateBR(v){if(!v)return '-';const d=new Date(String(v).length===10?v+'T12:00:00':v);return Number.isNaN(d.getTime())?escapeHtml(v):d.toLocaleDateString('pt-BR')}
function nomeVinculoDocumento(x){
 if(x.tipo_vinculo==='imovel'){const r=imoveis.find(i=>String(i.id)===String(x.imovel_id));return r?`${r.codigo||''} ${r.titulo}`.trim():'Imóvel';}
 if(x.tipo_vinculo==='proprietario'){const r=props.find(i=>String(i.id)===String(x.proprietario_id));return r?.nome||'Proprietário';}
 if(x.tipo_vinculo==='inquilino') return x._vinculo_nome||'Inquilino';
 if(x.tipo_vinculo==='contrato') return x._vinculo_nome||'Contrato';
 return 'Geral';
}
function renderDocumentosTable(){
 const el=$('#documentosTable'); if(!el)return;
 el.innerHTML=(db.documentos||[]).map(x=>`<tr><td><strong>${escapeHtml(x.nome_arquivo||x.nome||'Documento')}</strong><small class="muted doc-type">${escapeHtml(x.mime_type||'')}</small></td><td>${escapeHtml(x.categoria||'-')}</td><td>${escapeHtml(nomeVinculoDocumento(x))}</td><td>${formatDateBR(x.data_validade)}</td><td>${formatDateBR(x.criado_em||x.data)}</td><td><div class="actions"><button class="mini edit" data-doc-open="${x.id}">Abrir</button><button class="mini danger" data-doc-delete="${x.id}">Excluir</button></div></td></tr>`).join('')||'<tr><td colspan="6" class="muted">Nenhum documento enviado.</td></tr>';
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
 const badge=$('#cobPriorityBadge');if(badge)badge.textContent=`${cobrancasAbertas.length} pendência${cobrancasAbertas.length===1?'':'s'}`;
 const list=$('#cobrancaPriorityList');
 if(list)list.innerHTML=priorities.length?priorities.map(x=>{const d=daysFromToday(x.data_vencimento);const label=d===0?'Vence hoje':d<0?`${Math.abs(d)} dia${Math.abs(d)===1?'':'s'} em atraso`:`Vence em ${d} dia${d===1?'':'s'}`;return `<div class="ops-item"><span class="ops-icon">${d<0?'⚠️':d===0?'⏰':'📅'}</span><div><strong>${escapeHtml(x.descricao||'Cobrança')}</strong><small>${escapeHtml(x.inquilino||'Inquilino')} · ${label}</small></div><div class="ops-value"><b>${brl(x.valor_total||x.valor)}</b><small>${formatDateBR(x.data_vencimento)}</small></div></div>`}).join(''):'<div class="ops-empty">Nenhuma cobrança prioritária. A carteira está em dia.</div>';

 const repasses=db.financeiro.filter(x=>x.tipo_raw==='repasse_proprietario'&&x.status_raw==='pendente');
 const repasseTotal=repasses.reduce((a,x)=>a+Number(x.valor||0),0);
 if($('#repassePendenteTotal'))$('#repassePendenteTotal').textContent=brl(repasseTotal);
 const rt=$('#repassesTable');if(rt)rt.innerHTML=repasses.length?repasses.map(x=>`<tr><td class="repasse-owner"><strong>${escapeHtml(x.proprietario_nome||'Proprietário')}</strong><small>${escapeHtml(x.descricao||'Repasse')}</small></td><td>${formatDateBR(x.competencia)}</td><td>${brl(x.valor)}</td><td>${formatDateBR(x.data_vencimento)}</td><td><button class="mini edit" data-pagar-repasse="${x.id}">Confirmar repasse</button></td></tr>`).join(''):'<tr><td colspan="5" class="muted">Nenhum repasse pendente.</td></tr>';
 const recebidoMes=db.cobrancas.filter(x=>x.status_raw==='pago'&&isCurrentMonth(x.data_pagamento)).reduce((a,x)=>a+Number(x.valor_pago||x.valor_total||x.valor||0),0);
 const receitaMes=db.financeiro.filter(x=>x.tipo_raw==='receita_imobiliaria'&&x.status_raw==='pago'&&isCurrentMonth(x.data_pagamento||x.data_lancamento)).reduce((a,x)=>a+Number(x.valor||0),0);
 const aReceber=cobrancasAbertas.reduce((a,x)=>a+Number(x.valor_total||x.valor||0),0);
 const repassesAtrasados=repasses.filter(x=>{const d=daysFromToday(x.data_vencimento);return d!==null&&d<0;});
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
function renderConfig(){ $('#cfgNome').value=configuracoes.nome;$('#cfgSlogan').value=configuracoes.slogan;$('#cfgCor1').value=configuracoes.cor1;$('#cfgCor2').value=configuracoes.cor2;$('#cfgCreci').value=configuracoes.creci;$('#cfgBanco').value=configuracoes.banco;document.documentElement.style.setProperty('--yellow',configuracoes.cor1||'#ffe600');}
function renderAll(){renderImoveis();renderProps();renderOthers();renderKPIs();renderConfig();bindActions();}
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
  ['valor_negociacao','Valor da negociação','number'],['comissao_percentual','Comissão %','number'],['corretor_nome','Corretor','text'],['observacoes','Observações','textarea']
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
function genericOpen(type,item=null){
 editMode={type,id:item?.id||null};$('#genericTitle').textContent=(item?'Editar ':'Novo ')+type;
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
   $('#genericFields').innerHTML=agency+realSchemas[type].map(d=>renderGenericField(d,formItem,defaultImob)).join('');
 }else{
   const fields=schemas[type];$('#genericFields').innerHTML=fields.map(([n,l,t,opts])=>{if(t==='select')return `<label>${l}<select name="${n}">${opts.map(o=>`<option ${item?.[n]===o?'selected':''}>${o}</option>`).join('')}</select></label>`;return `<label>${l}<input name="${n}" type="${t}" ${t==='number'?'step="0.01"':''} value="${item?.[n]??''}" required></label>`}).join('');
 }
 if(!$('#genericDialog').open)$('#genericDialog').showModal();
}
$('#genericCancel').onclick=()=>$('#genericDialog').close();
$('#genericForm').addEventListener('submit',async e=>{
 e.preventDefault();const fd=new FormData(e.target);const obj=Object.fromEntries(fd);const type=editMode.type;
 if(isRealMode()&&realSchemas[type]&&supabaseClient){
   const imobId=currentProfile?.perfil==='admin_master'?obj.imobiliaria_id:currentProfile?.imobiliaria_id;if(!imobId){alert('Selecione a imobiliária.');return;}
   const payload={imobiliaria_id:imobId,atualizado_em:new Date().toISOString()};
   for(const [n,,t] of realSchemas[type]){let v=obj[n];if(v==='')v=null;if(t==='number'&&v!=null)v=Number(v);if(n==='autorizacao_proprietario')v=String(obj[n])==='true';payload[n]=v;}
   if(type==='cobrancas'){payload.valor_total=Math.max(0,Number(payload.valor_base||0)+Number(payload.valor_multa||0)+Number(payload.valor_juros||0)-Number(payload.valor_desconto||0));}
   if(type==='manutencoes'&&!payload.data_abertura)payload.data_abertura=new Date().toISOString().slice(0,10);
   try{const q=editMode.id?supabaseClient.from(realTableMap[type]).update(payload).eq('id',editMode.id):supabaseClient.from(realTableMap[type]).insert(payload);const r=await q.select().single();if(r.error)throw r.error;await realLoaderMap[type]();if(type==='cobrancas')await loadRealFinanceiro();$('#genericDialog').close();renderAll();if(imovelDetalheAtual)await refreshImovelDetalhe();}
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
   if(o.tipo_vinculo==='imovel')payload.imovel_id=ref;if(o.tipo_vinculo==='proprietario')payload.proprietario_id=ref;if(o.tipo_vinculo==='inquilino')payload.inquilino_id=ref;if(o.tipo_vinculo==='contrato')payload.contrato_id=ref;
   const ins=await supabaseClient.from('imob_documentos').insert(payload).select().single();if(ins.error){await supabaseClient.storage.from('imob-documentos').remove([path]);throw ins.error;}
   await loadRealDocumentos();$('#documentoDialog').close();renderAll();if(imovelDetalheAtual)await refreshImovelDetalhe();
 }catch(err){alert('Não foi possível enviar o documento: '+(err.message||err));}
 finally{btn.disabled=false;btn.textContent='Enviar documento';}
});

function detailEmpty(text){return `<div class="detail-empty">${escapeHtml(text)}</div>`}
function infoGrid(items){return `<div class="detail-info-grid">${items.map(([l,v])=>`<div><small>${escapeHtml(l)}</small><strong>${v==null||v===''?'-':escapeHtml(String(v))}</strong></div>`).join('')}</div>`}
async function loadImovelDetalheDados(item){
 const docsDiretos=(db.documentos||[]).filter(d=>String(d.imovel_id)===String(item.id));let contratos=[],financeiro=[],docsContrato=[],vistorias=[],manutencoes=[];
 if(isRealMode()&&supabaseClient){
   const cr=await supabaseClient.from('imob_contratos').select('id,codigo,status,data_inicio,data_fim,valor_aluguel,dia_vencimento,inquilino_id').eq('imovel_id',item.id).order('criado_em',{ascending:false});if(!cr.error)contratos=cr.data||[];
   const ids=contratos.map(c=>c.id);if(ids.length){
     const dr=await supabaseClient.from('imob_documentos').select('*').in('contrato_id',ids).eq('ativo',true).order('criado_em',{ascending:false});if(!dr.error)docsContrato=(dr.data||[]).map(x=>({...x,nome:x.nome_arquivo,data:x.criado_em,status:'Privado'}));
     const fr=await supabaseClient.from('imob_financeiro').select('*').in('contrato_id',ids).order('data_lancamento',{ascending:false});if(!fr.error)financeiro=fr.data||[];
   }
 }
 if(isRealMode()&&supabaseClient){const vr=await supabaseClient.from('imob_vistorias').select('*').eq('imovel_id',item.id).order('data_vistoria',{ascending:false});if(!vr.error)vistorias=vr.data||[];const mr=await supabaseClient.from('imob_manutencoes').select('*').eq('imovel_id',item.id).order('criado_em',{ascending:false});if(!mr.error)manutencoes=mr.data||[];}
 return {documentos:[...docsDiretos,...docsContrato],contratos,financeiro,vistorias,manutencoes};
}
function renderImovelDetalhe(tab='resumo'){
 const i=imovelDetalheAtual;if(!i)return;const p=props.find(x=>String(x.id)===String(i.proprietario_id));const d=imovelDetalheDados;let html='';
 $$('#imovelDetalheTabs [data-detail-tab]').forEach(b=>b.classList.toggle('active',b.dataset.detailTab===tab));
 if(tab==='resumo')html=`<div class="detail-hero"><div class="detail-main-photo" style="background-image:url('${escapeHtml(i.foto||fallbackPhoto)}')"></div><div>${infoGrid([['Código',i.codigo],['Finalidade',i.finalidade],['Status',i.status],['Tipo',i.tipo_imovel],['Venda',i.valor_venda?brl(i.valor_venda):'-'],['Locação',i.valor_locacao?brl(i.valor_locacao)+'/mês':'-'],['Condomínio',i.valor_condominio?brl(i.valor_condominio):'-'],['IPTU',i.valor_iptu?brl(i.valor_iptu):'-'],['Dormitórios',i.quartos||0],['Suítes',i.suites||0],['Banheiros',i.banheiros||0],['Vagas',i.vagas||0],['Área útil',i.area_util?i.area_util+' m²':'-'],['Publicado no site',i.publicado_site?'Sim':'Não']])}</div></div><div class="detail-block"><h3>Endereço</h3><p>${escapeHtml([i.endereco,i.numero,i.complemento,i.bairro,i.cidade,i.estado].filter(Boolean).join(', ')||'Não informado')}</p></div><div class="detail-block"><h3>Descrição</h3><p>${escapeHtml(i.descricao||'Sem descrição.')}</p></div>`;
 else if(tab==='proprietario')html=p?`<div class="detail-block"><h3>${escapeHtml(p.nome)}</h3>${infoGrid([['CPF/CNPJ',p.cpf_cnpj],['Telefone',p.telefone],['WhatsApp',p.whatsapp],['E-mail',p.email],['Cidade',p.cidade],['Chave PIX',p.chave_pix]])}</div>`:detailEmpty('Nenhum proprietário vinculado a este imóvel.');
 else if(tab==='fotos')html=(i.fotos||[]).length?`<div class="detail-gallery">${i.fotos.map(f=>`<figure><img src="${escapeHtml(f.url)}" alt="Foto do imóvel">${f.principal?'<figcaption>★ Principal</figcaption>':''}</figure>`).join('')}</div>`:detailEmpty('Nenhuma foto cadastrada.');
 else if(tab==='documentos')html=`<div class="detail-section-head"><div><h3>Documentos</h3><p class="muted">Documentos do imóvel e dos contratos vinculados.</p></div><button class="btn primary" data-detail-add-doc>+ Documento</button></div>`+(d.documentos.length?`<div class="detail-list">${d.documentos.map(x=>`<article><div><strong>${escapeHtml(x.nome_arquivo||x.nome)}</strong><small>${escapeHtml(x.categoria||'-')} · ${formatDateBR(x.criado_em)}</small></div><button class="mini edit" data-doc-open="${x.id}">Abrir</button></article>`).join('')}</div>`:detailEmpty('Nenhum documento vinculado a este imóvel.'));
 else if(tab==='contratos')html=`<div class="detail-section-head"><div><h3>Contratos</h3><p class="muted">Contratos vinculados a este imóvel.</p></div><button class="btn primary" data-detail-add-contract>+ Contrato</button></div>`+(d.contratos.length?`<div class="detail-list">${d.contratos.map(c=>`<article><div><strong>${escapeHtml(c.codigo||'Contrato')}</strong><small>${formatDateBR(c.data_inicio)} até ${formatDateBR(c.data_fim)} · Vencimento dia ${c.dia_vencimento||'-'}</small></div><div class="detail-contract-actions"><div><b>${brl(c.valor_aluguel)}</b><small class="status ${statusClass(c.status)}">${escapeHtml(contratoStatusLabel(c.status)||'-')}</small></div><button class="mini edit" data-detail-edit-contract="${c.id}">Editar</button></div></article>`).join('')}</div>`:detailEmpty('Nenhum contrato vinculado a este imóvel.'));
 else if(tab==='financeiro')html=d.financeiro.length?`<div class="detail-list">${d.financeiro.map(f=>`<article><div><strong>${escapeHtml(f.descricao||f.tipo)}</strong><small>${formatDateBR(f.data_lancamento)} · ${escapeHtml(f.status||'-')}</small></div><b>${brl(f.valor)}</b></article>`).join('')}</div>`:detailEmpty('Nenhum lançamento financeiro vinculado aos contratos deste imóvel.');
 else if(tab==='vistorias')html=d.vistorias?.length?`<div class="detail-list">${d.vistorias.map(v=>`<article><div><strong>${escapeHtml(vistoriaTipoLabel(v.tipo))}</strong><small>${formatDateBR(v.data_vistoria)} · ${escapeHtml(v.responsavel||'Sem responsável')}</small></div><span class="status ${statusClass(vistoriaStatusLabel(v.status))}">${escapeHtml(vistoriaStatusLabel(v.status))}</span></article>`).join('')}</div>`:detailEmpty('Nenhuma vistoria vinculada a este imóvel.');
 else if(tab==='manutencoes')html=d.manutencoes?.length?`<div class="detail-list">${d.manutencoes.map(m=>`<article><div><strong>${escapeHtml(m.codigo||'Manutenção')} · ${escapeHtml(m.descricao||'')}</strong><small>${escapeHtml(manutencaoPrioridadeLabel(m.prioridade))} · ${escapeHtml(m.fornecedor||'Sem fornecedor')}</small></div><div><b>${brl(m.valor_final??m.valor_estimado??0)}</b><small class="status ${statusClass(manutencaoStatusLabel(m.status))}">${escapeHtml(manutencaoStatusLabel(m.status))}</small></div></article>`).join('')}</div>`:detailEmpty('Nenhuma manutenção vinculada a este imóvel.');
 $('#imovelDetalheConteudo').innerHTML=html;bindDocumentActions();
 $('#imovelDetalheConteudo').querySelector('[data-detail-add-doc]')?.addEventListener('click',()=>openDocumentoModal({imobiliaria_id:i.imobiliaria_id,tipo_vinculo:'imovel',referencia_id:i.id}));
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
 e.preventDefault(); const fd=new FormData(e.target),obj=Object.fromEntries(fd);
 const im=imoveis.find(x=>String(x.id)===String(obj.imovel_id)); if(!im){alert('Selecione um imóvel.');return;}
 if(!im.proprietario_id){alert('Este imóvel não possui proprietário vinculado. Vincule um proprietário antes de criar o contrato.');return;}
 if(isRealMode()&&supabaseClient){
   const imobiliariaId=currentProfile?.perfil==='admin_master'?obj.imobiliaria_id:currentProfile?.imobiliaria_id; if(!imobiliariaId){alert('Selecione a imobiliária.');return;}
   const num=v=>v===''||v==null?null:Number(v);
   const payload={imobiliaria_id:imobiliariaId,imovel_id:obj.imovel_id,proprietario_id:im.proprietario_id,inquilino_id:obj.inquilino_id,codigo:obj.codigo?.trim()||null,status:obj.status||'ativo',data_inicio:obj.data_inicio,data_fim:obj.data_fim||null,dia_vencimento:Number(obj.dia_vencimento||10),valor_aluguel:Number(obj.valor_aluguel||0),primeira_parcela_imobiliaria:obj.primeira_parcela_imobiliaria!=='false',taxa_administracao_tipo:obj.taxa_administracao_tipo||'percentual',taxa_administracao_valor:Number(obj.taxa_administracao_valor||0),multa_atraso_percentual:Number(obj.multa_atraso_percentual||0),juros_atraso_percentual_mes:Number(obj.juros_atraso_percentual_mes||0),reajuste_indice:obj.reajuste_indice?.trim()||null,reajuste_periodicidade_meses:Number(obj.reajuste_periodicidade_meses||12),garantia_tipo:obj.garantia_tipo||null,garantia_valor:num(obj.garantia_valor),observacoes:obj.observacoes?.trim()||null,ativo:obj.status!=='cancelado',atualizado_em:new Date().toISOString()};
   try{
     const result=editMode.id?await supabaseClient.from('imob_contratos').update(payload).eq('id',editMode.id).select().single():await supabaseClient.from('imob_contratos').insert(payload).select().single();
     if(result.error)throw result.error;
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

function bindActions(){
 $$('[data-view-imovel]').forEach(c=>c.onclick=e=>{if(e.target.closest('button'))return;const item=imoveis.find(x=>String(x.id)===String(c.dataset.viewImovel));if(item)openImovelDetalhe(item);});
 $$('[data-create]').forEach(b=>b.onclick=()=>b.dataset.create==='contratos'?openContrato():genericOpen(b.dataset.create));
 $$('[data-edit]').forEach(b=>b.onclick=()=>{const type=b.dataset.edit,id=b.dataset.id;if(type==='imoveis')openImovel(imoveis.find(x=>String(x.id)===id));else if(type==='props')openProp(props.find(x=>String(x.id)===id));else if(type==='inquilinos')openInquilino(db.inquilinos.find(x=>String(x.id)===id));else if(type==='contratos')openContrato(db.contratos.find(x=>String(x.id)===id));else genericOpen(type,db[type].find(x=>String(x.id)===id));});
 $$('[data-baixa-cobranca]').forEach(b=>b.onclick=async()=>{const id=b.dataset.baixaCobranca;const item=db.cobrancas.find(x=>String(x.id)===String(id));if(!item)return;if(!confirm(`Confirmar pagamento de ${brl(item.valor)}? O financeiro será gerado automaticamente.`))return;try{const {error}=await supabaseClient.from('imob_cobrancas').update({status:'pago',valor_pago:Number(item.valor||0),data_pagamento:new Date().toISOString(),atualizado_em:new Date().toISOString()}).eq('id',id);if(error)throw error;try{await processarReguaFinanceira();}catch(_){}await loadRealCobrancas();await loadRealFinanceiro();await loadNotifications();renderAll();alert('Pagamento confirmado. Receita e repasse foram lançados automaticamente no Financeiro.');}catch(err){alert('Não foi possível dar baixa: '+(err.message||err));}});
 $$('[data-pagar-repasse]').forEach(b=>b.onclick=async()=>{const id=b.dataset.pagarRepasse;const item=db.financeiro.find(x=>String(x.id)===String(id));if(!item)return;if(!confirm(`Confirmar repasse de ${brl(item.valor)} para ${item.proprietario_nome||'o proprietário'}?`))return;try{const {error}=await supabaseClient.from('imob_financeiro').update({status:'pago',data_pagamento:new Date().toISOString(),atualizado_em:new Date().toISOString()}).eq('id',id);if(error)throw error;try{await processarReguaFinanceira();}catch(_){}await loadRealFinanceiro();await loadNotifications();renderAll();alert('Repasse confirmado.');}catch(err){alert('Não foi possível confirmar o repasse: '+(err.message||err));}});
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
$('#salvarConfigBtn').onclick=()=>{configuracoes={nome:$('#cfgNome').value,slogan:$('#cfgSlogan').value,cor1:$('#cfgCor1').value,cor2:$('#cfgCor2').value,creci:$('#cfgCreci').value,banco:$('#cfgBanco').value};persistAll();renderAll();alert('Configurações salvas.');};
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
