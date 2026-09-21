import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const VERIFY_TOKEN = Deno.env.get('WHATSAPP_VERIFY_TOKEN') || ''
const APP_SECRET = Deno.env.get('META_APP_SECRET') || ''
const db = createClient(SUPABASE_URL, SERVICE_KEY)

const text = (s:string, status=200) => new Response(s,{status,headers:{'content-type':'text/plain; charset=utf-8'}})
async function validSignature(req:Request, raw:string){
  if(!APP_SECRET) return true // habilite META_APP_SECRET antes da produção
  const sig=req.headers.get('x-hub-signature-256')||''
  if(!sig.startsWith('sha256=')) return false
  const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(APP_SECRET),{name:'HMAC',hash:'SHA-256'},false,['sign'])
  const mac=await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(raw))
  const hex=[...new Uint8Array(mac)].map(b=>b.toString(16).padStart(2,'0')).join('')
  return sig===`sha256=${hex}`
}

Deno.serve(async(req)=>{
  const url=new URL(req.url)
  if(req.method==='GET'){
    const mode=url.searchParams.get('hub.mode'), token=url.searchParams.get('hub.verify_token'), challenge=url.searchParams.get('hub.challenge')
    if(mode==='subscribe' && token===VERIFY_TOKEN && challenge) return text(challenge)
    return text('Forbidden',403)
  }
  if(req.method!=='POST') return text('Method not allowed',405)
  const raw=await req.text()
  if(!(await validSignature(req,raw))) return text('Invalid signature',401)
  let body:any; try{body=JSON.parse(raw)}catch{return text('Bad JSON',400)}
  try{
    for(const entry of body.entry||[]) for(const change of entry.changes||[]){
      const v=change.value||{}, phoneId=v.metadata?.phone_number_id
      if(!phoneId) continue
      const {data:channel}=await db.from('imob_whatsapp_canais').select('*').eq('phone_number_id',phoneId).maybeSingle()
      if(!channel) continue
      await db.from('imob_whatsapp_canais').update({ultimo_webhook_em:new Date().toISOString(),atualizado_em:new Date().toISOString()}).eq('id',channel.id)
      for(const s of v.statuses||[]){
        const patch:any={provider_status:s.status,provider_payload:s,atualizado_em:new Date().toISOString()}
        if(s.status==='sent'){patch.status='enviada';patch.enviado_em=new Date(Number(s.timestamp)*1000).toISOString()}
        if(s.status==='delivered'){patch.status='entregue';patch.entregue_em=new Date(Number(s.timestamp)*1000).toISOString()}
        if(s.status==='read'){patch.status='lida';patch.lida_em=new Date(Number(s.timestamp)*1000).toISOString()}
        if(s.status==='failed'){patch.status='erro';patch.erro=s.errors?.[0]?.message||s.errors?.[0]?.title||'Falha informada pela Meta'}
        await db.from('imob_comunicacoes').update(patch).eq('provider_message_id',s.id)
      }
      for(const m of v.messages||[]){
        const contact=(v.contacts||[])[0]||{}
        await db.from('imob_whatsapp_mensagens_recebidas').upsert({
          imobiliaria_id:channel.imobiliaria_id,phone_number_id:phoneId,wamid:m.id,remetente:m.from,
          nome_remetente:contact.profile?.name||null,tipo:m.type||'unknown',texto:m.text?.body||null,payload:m,
          recebido_em:m.timestamp?new Date(Number(m.timestamp)*1000).toISOString():new Date().toISOString()
        },{onConflict:'wamid',ignoreDuplicates:true})
      }
    }
    return text('EVENT_RECEIVED')
  }catch(e){console.error(e);return text('EVENT_RECEIVED')}
})
