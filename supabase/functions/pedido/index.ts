import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { pedido, mensagem } = await req.json();

    // Validação básica anti-abuso
    if (typeof pedido !== "string" || !pedido.trim()) {
      return json({ error: "Pedido vazio" }, 400);
    }
    if (pedido.length > 200 || (mensagem && String(mensagem).length > 300)) {
      return json({ error: "Texto muito longo" }, 400);
    }

    const pedidoLimpo = pedido.trim();
    const mensagemLimpa = mensagem ? String(mensagem).trim() : null;

    // 1) Salva no banco (service role — ignora RLS)
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { error: dbError } = await supabase
      .from("pedidos")
      .insert({ pedido: pedidoLimpo, mensagem: mensagemLimpa });

    if (dbError) console.error("Erro ao salvar pedido:", dbError);

    // 2) Notifica no Telegram
    const TOKEN = Deno.env.get("TELEGRAM_TOKEN");
    const CHAT_ID = Deno.env.get("TELEGRAM_CHAT_ID");

    if (TOKEN && CHAT_ID) {
      const texto =
        `🎵 NOVO PEDIDO — DUO MARIEL\n\n` +
        `Pedido: ${pedidoLimpo}\n\n` +
        `Mensagem:\n${mensagemLimpa || "—"}`;

      await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: CHAT_ID, text: texto }),
      });
    }

    return json({ ok: true });
  } catch (e) {
    console.error(e);
    return json({ error: (e as Error).message }, 500);
  }
});
