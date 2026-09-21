import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const cors = {"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS"};
const out=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,"Content-Type":"application/json; charset=utf-8"}});
const esc=(s:string)=>s.replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]!));
const htmlEmail=(message:string,agency:string)=>`<!doctype html><html><body style="margin:0;background:#f5f5f5;font-family:Arial,sans-serif;color:#222"><div style="max-width:640px;margin:32px auto;background:#fff;border-radius:12px;padding:32px"><h2 style="margin:0 0 24px">${esc(agency)}</h2><div style="font-size:16px;line-height:1.6;white-space:pre-line">${esc(message)}</div><hr style="border:0;border-top:1px solid #eee;margin:28px 0"><small style="color:#777">Mensagem automática referente à sua locação.</small></div></body></html>`;

Deno.serve(async(req)=>{
 if(req.method==="OPTIONS") return new Response("ok",{headers:cors});
 if(req.method!=="POST") return out({error:"Método não permitido."},405);
 try{
  const authorization=req.headers.get("Authorization")??"";
  if(!authorization.startsWith("Bearer ")) return out({error:"Usuário não autenticado."},401);
  const userClient=createClient(SUPABASE_URL,SUPABASE_ANON_KEY,{global:{headers:{Authorization:authorization}}});
  const {data:{user},error:userError}=await userClient.auth.getUser();
  if(userError||!user) return out({error:"Sessão inválida ou expirada."},401);
  const admin=createClient(SUPABASE_URL,SUPABASE_SERVICE_ROLE_KEY);
  const {data:usuario,error:ue}=await admin.from("imob_usuarios").select("imobiliaria_id,perfil,ativo").eq("auth_user_id",user.id).eq("ativo",true).maybeSingle();
  if(ue) throw ue;
  if(!usuario||!["admin_imobiliaria","dono"].includes(String(usuario.perfil))) return out({error:"Somente o Dono da imobiliária pode executar o envio."},403);
  const iid=usuario.imobiliaria_id;
  const {data:canal,error:ce}=await admin.from("imob_email_canais").select("*").eq("imobiliaria_id",iid).maybeSingle();
  if(ce) throw ce;
  if(!canal?.ativo||canal.status!=="conectado"||!canal.remetente_email) return out({error:"Gateway de e-mail desta imobiliária não está conectado."},400);
  const {data:key,error:ke}=await admin.rpc("imob_email_token_por_imobiliaria",{p_imobiliaria_id:iid});
  if(ke) throw ke;if(!key) return out({error:"API key de e-mail não configurada no Vault."},400);
  let body:any={};try{body=await req.json()}catch{}
  const limite=Math.min(Math.max(Number(body.limite??body.limit??20),1),50);
  let q=admin.from("imob_comunicacoes").select("*").eq("imobiliaria_id",iid).eq("canal","email").eq("status","pendente").order("criado_em",{ascending:true}).limit(limite);
  if(body.comunicacao_id) q=q.eq("id",body.comunicacao_id);
  const {data:items,error:qe}=await q;if(qe) throw qe;
  if(!items?.length) return out({success:true,processadas:0,enviadas:0,erros:0,message:"Não existem e-mails pendentes."});
  const {data:imob}=await admin.from("imob_imobiliarias").select("nome,nome_fantasia").eq("id",iid).maybeSingle();
  const agency=imob?.nome_fantasia||imob?.nome||canal.remetente_nome||"Imobiliária";
  let enviadas=0,erros=0;const resultados:any[]=[];
  for(const c of items){
   try{
    if(!c.destinatario||!String(c.destinatario).includes("@")){await admin.from("imob_comunicacoes").update({status:"sem_destinatario",provider_status:"sem_destinatario"}).eq("id",c.id);erros++;continue;}
    const {data:lock}=await admin.from("imob_comunicacoes").update({status:"processando",provider_status:"processando",tentativas:Number(c.tentativas||0)+1,atualizado_em:new Date().toISOString()}).eq("id",c.id).eq("status","pendente").select("id").maybeSingle();
    if(!lock) continue;
    const payload:any={from:`${canal.remetente_nome||agency} <${canal.remetente_email}>`,to:[c.destinatario],subject:c.assunto||`Aviso de cobrança - ${agency}`,html:htmlEmail(c.mensagem||"",agency),text:c.mensagem||""};
    if(canal.reply_to) payload.reply_to=canal.reply_to;
    const r=await fetch("https://api.resend.com/emails",{method:"POST",headers:{Authorization:`Bearer ${key}`,"Content-Type":"application/json","Idempotency-Key":`imob-email/${c.id}`},body:JSON.stringify(payload)});
    const rb=await r.json().catch(()=>({}));
    if(!r.ok) throw new Error(rb?.message||rb?.error?.message||`Resend HTTP ${r.status}`);
    await admin.from("imob_comunicacoes").update({status:"enviada",provider_status:"sent",provider_message_id:rb?.id||null,provider_payload:rb,enviado_em:new Date().toISOString(),erro:null,atualizado_em:new Date().toISOString()}).eq("id",c.id);
    enviadas++;resultados.push({id:c.id,status:"enviada",provider_message_id:rb?.id||null});
   }catch(e){const msg=e instanceof Error?e.message:String(e);await admin.from("imob_comunicacoes").update({status:"erro",provider_status:"failed",erro:msg,provider_payload:{erro:msg,processado_em:new Date().toISOString()},atualizado_em:new Date().toISOString()}).eq("id",c.id);erros++;resultados.push({id:c.id,status:"erro",erro:msg});}
  }
  await admin.from("imob_email_canais").update({ultimo_envio_em:enviadas?new Date().toISOString():canal.ultimo_envio_em,ultimo_erro:erros?"Houve falha em um ou mais envios.":null,atualizado_em:new Date().toISOString()}).eq("imobiliaria_id",iid);
  return out({success:true,processadas:items.length,enviadas,erros,resultados});
 }catch(e){console.error(e);return out({success:false,error:e instanceof Error?e.message:String(e)},500)}
});
