import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
const URL=Deno.env.get('SUPABASE_URL')!, ANON=Deno.env.get('SUPABASE_ANON_KEY')!, SERVICE=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const GRAPH=Deno.env.get('META_GRAPH_VERSION')||'v25.0'
const cors={'access-control-allow-origin':'*','access-control-allow-headers':'authorization, x-client-info, apikey, content-type'}
const json=(x:any,s=200)=>new Response(JSON.stringify(x),{status:s,headers:{...cors,'content-type':'application/json'}})
function normalizePhone(v:string){return (v||'').replace(/\D/g,'')}
Deno.serve(async(req)=>{
 if(req.method==='OPTIONS')return new Response('ok',{headers:cors})
 if(req.method!=='POST')return json({error:'Method not allowed'},405)
 const auth=req.headers.get('authorization')||''
 const userDb=createClient(URL,ANON,{global:{headers:{Authorization:auth}}}), admin=createClient(URL,SERVICE)
 const {data:{user}}=await userDb.auth.getUser(); if(!user)return json({error:'Não autenticado'},401)
 const {data:profile}=await admin.from('imob_usuarios').select('imobiliaria_id,perfil,ativo').eq('auth_user_id',user.id).maybeSingle()
 if(!profile?.ativo||!['dono','admin_imobiliaria'].includes(profile.perfil))return json({error:'Somente o Dono pode executar envios'},403)
 const imob=profile.imobiliaria_id
 const {data:channel}=await admin.from('imob_whatsapp_canais').select('*').eq('imobiliaria_id',imob).maybeSingle()
 if(!channel?.ativo||channel.status!=='conectado'||!channel.phone_number_id)return json({error:'WhatsApp da imobiliária ainda não está conectado'},409)
 const {data:tokenData,error:tokenErr}=await admin.rpc('imob_whatsapp_token_por_imobiliaria',{p_imobiliaria_id:imob})
 if(tokenErr||!tokenData)return json({error:'Token do WhatsApp não configurado no Vault'},409)
 const body=await req.json().catch(()=>({})); const limit=Math.min(Math.max(Number(body.limit||10),1),50)
 const {data:rows,error}=await admin.from('imob_comunicacoes').select('*,imob_comunicacao_modelos(meta_template_name,meta_template_language,meta_template_status)').eq('imobiliaria_id',imob).eq('canal','whatsapp').eq('status','pendente').order('criado_em').limit(limit)
 if(error)return json({error:error.message},500)
 let sent=0,failed=0,blocked=0
 for(const c of rows||[]){
   const to=normalizePhone(c.destinatario); if(!to){await admin.from('imob_comunicacoes').update({status:'sem_destinatario',erro:'Telefone não cadastrado'}).eq('id',c.id);failed++;continue}
   const model=c.imob_comunicacao_modelos; const templateName=c.template_name||model?.meta_template_name; const language=c.template_language||model?.meta_template_language||'pt_BR'
   if(!templateName||model?.meta_template_status!=='aprovado'){
     await admin.from('imob_comunicacoes').update({erro:'Template Meta ainda não configurado/aprovado. Envio automático bloqueado com segurança.',atualizado_em:new Date().toISOString()}).eq('id',c.id);blocked++;continue
   }
   await admin.from('imob_comunicacoes').update({status:'processando',tentativas:(c.tentativas||0)+1,atualizado_em:new Date().toISOString()}).eq('id',c.id)
   try{
     // V6.5.2: mensagens automáticas iniciadas pela empresa usam somente template aprovado.
     // Os templates cadastrados na Meta devem reproduzir o texto aprovado. Componentes parametrizados
     // poderão ser sincronizados na etapa de publicação; até lá, templates sem parâmetros são seguros.
     const payload={messaging_product:'whatsapp',recipient_type:'individual',to,type:'template',template:{name:templateName,language:{code:language}}}
     const r=await fetch(`https://graph.facebook.com/${GRAPH}/${channel.phone_number_id}/messages`,{method:'POST',headers:{Authorization:`Bearer ${tokenData}`,'Content-Type':'application/json'},body:JSON.stringify(payload)})
     const out=await r.json(); if(!r.ok)throw new Error(out?.error?.message||`Meta HTTP ${r.status}`)
     const mid=out?.messages?.[0]?.id
     await admin.from('imob_comunicacoes').update({status:'enviada',provider_status:'accepted',provider_message_id:mid||null,provider_payload:out,enviado_em:new Date().toISOString(),erro:null,atualizado_em:new Date().toISOString()}).eq('id',c.id);sent++
   }catch(e){await admin.from('imob_comunicacoes').update({status:'erro',erro:String(e?.message||e),atualizado_em:new Date().toISOString()}).eq('id',c.id);failed++}
 }
 return json({ok:true,processadas:(rows||[]).length,enviadas:sent,bloqueadas:blocked,erros:failed})
})
