import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const META_APP_ID = Deno.env.get("META_APP_ID") ?? "";
const META_APP_SECRET = Deno.env.get("META_APP_SECRET") ?? "";

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" },
  });
}

Deno.serve(async (req) => {
  try {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
    if (req.method === "GET") return jsonResponse({ ok: true, message: "OAuth da Plataforma Imobiliária ativo." });
    if (req.method !== "POST") return jsonResponse({ ok: false, error: "Método não permitido." }, 405);

    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) return jsonResponse({ ok: false, error: "Sessão não informada." }, 401);

    const jwt = authHeader.slice(7).trim();
    const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(jwt);
    if (userError || !user) return jsonResponse({ ok: false, error: "Sessão inválida ou expirada." }, 401);

    const { data: usuarioImob, error: usuarioImobError } = await supabaseAdmin
      .from("imob_usuarios")
      .select("id, imobiliaria_id, perfil, ativo")
      .eq("auth_user_id", user.id)
      .eq("ativo", true)
      .maybeSingle();

    if (usuarioImobError) {
      console.error("Erro ao consultar imob_usuarios:", usuarioImobError);
      return jsonResponse({ ok: false, error: "Não foi possível identificar o usuário da imobiliária." }, 500);
    }
    if (!usuarioImob?.imobiliaria_id) return jsonResponse({ ok: false, error: "Usuário não está vinculado a uma imobiliária ativa." }, 403);

    let payload: { code?: string };
    try { payload = await req.json(); }
    catch { return jsonResponse({ ok: false, error: "JSON inválido." }, 400); }

    const code = typeof payload.code === "string" ? payload.code.trim() : "";
    if (!code) return jsonResponse({ ok: false, error: "Authorization code da Meta não informado." }, 400);
    if (!META_APP_ID || !META_APP_SECRET) return jsonResponse({ ok: false, error: "Configuração da Meta incompleta no servidor." }, 500);

    // O code desta versão nasce do FB.login() / Facebook Login for Business.
    // Para esse fluxo do JSSDK, enviamos redirect_uri explicitamente vazio na troca.
    // Não substitua por URL da Vercel ou da Edge Function: isso cria mismatch com o code emitido pelo SDK.
    const tokenResponse = await fetch("https://graph.facebook.com/oauth/access_token", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        client_id: META_APP_ID,
        client_secret: META_APP_SECRET,
        code,
        grant_type: "authorization_code",
        redirect_uri: "",
      }),
    });

    const metaData = await tokenResponse.json();
    if (!tokenResponse.ok || !metaData?.access_token) {
      console.error("Falha na troca do authorization code:", JSON.stringify(metaData));
      return jsonResponse({ ok: false, error: metaData?.error?.message || "A Meta não aceitou o código de autorização.", meta_code: metaData?.error?.code ?? null, meta_subcode: metaData?.error?.error_subcode ?? null }, 400);
    }

    const accessToken = String(metaData.access_token);
    console.log(`Embedded Signup autorizado para imobiliaria_id=${usuarioImob.imobiliaria_id}; token recebido com segurança; comprimento=${accessToken.length}`);

    // Ainda não persistimos nem devolvemos o token. A próxima etapa é capturar WABA/phone_number_id
    // do evento WA_EMBEDDED_SIGNUP e gravar a credencial no Vault vinculada à imobiliária.
    return jsonResponse({
      ok: true,
      authorized: true,
      imobiliaria_id: usuarioImob.imobiliaria_id,
      message: "Autorização Meta concluída com segurança.",
    });
  } catch (err) {
    console.error("Erro inesperado no OAuth Meta:", err);
    return jsonResponse({ ok: false, error: "Erro interno ao processar autorização da Meta." }, 500);
  }
});
