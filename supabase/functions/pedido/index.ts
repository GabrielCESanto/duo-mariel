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
    const body = await req.json();
    const tipo = body.tipo === "aprender" ? "aprender" : "pedido";

    // Cliente com service role — ignora RLS
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const TOKEN = Deno.env.get("TELEGRAM_TOKEN");
    const CHAT_ID = Deno.env.get("TELEGRAM_CHAT_ID");
    const notificar = async (texto: string) => {
      if (!TOKEN || !CHAT_ID) return;
      await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: CHAT_ID, text: texto }),
      });
    };

    if (tipo === "aprender") {
      // Sugestão de música para o duo aprender
      const { musica, artista, mensagem } = body;

      if (typeof musica !== "string" || !musica.trim()) {
        return json({ error: "Música vazia" }, 400);
      }
      if (
        musica.length > 200 ||
        (artista && String(artista).length > 120) ||
        (mensagem && String(mensagem).length > 300)
      ) {
        return json({ error: "Texto muito longo" }, 400);
      }

      const registro = {
        musica: musica.trim(),
        artista: artista ? String(artista).trim() : null,
        mensagem: mensagem ? String(mensagem).trim() : null,
        origem: "visitante",
      };

      const { error: dbError } = await supabase
        .from("sugestoes")
        .insert(registro);

      if (dbError) console.error("Erro ao salvar sugestão:", dbError);

      await notificar(
        `🎸 SUGESTÃO PARA APRENDER — DUO MARIEL\n\n` +
          `Música: ${registro.musica}\n` +
          `Artista: ${registro.artista || "—"}\n\n` +
          `Mensagem:\n${registro.mensagem || "—"}`
      );

      return json({ ok: true });
    }

    // Pedido de música (fluxo original)
    const { pedido, mensagem } = body;

    // Validação básica anti-abuso
    if (typeof pedido !== "string" || !pedido.trim()) {
      return json({ error: "Pedido vazio" }, 400);
    }
    if (pedido.length > 200 || (mensagem && String(mensagem).length > 300)) {
      return json({ error: "Texto muito longo" }, 400);
    }

    const pedidoLimpo = pedido.trim();
    const mensagemLimpa = mensagem ? String(mensagem).trim() : null;

    const { error: dbError } = await supabase
      .from("pedidos")
      .insert({ pedido: pedidoLimpo, mensagem: mensagemLimpa });

    if (dbError) console.error("Erro ao salvar pedido:", dbError);

    await notificar(
      `🎵 NOVO PEDIDO — DUO MARIEL\n\n` +
        `Pedido: ${pedidoLimpo}\n\n` +
        `Mensagem:\n${mensagemLimpa || "—"}`
    );

    return json({ ok: true });
  } catch (e) {
    console.error(e);
    return json({ error: (e as Error).message }, 500);
  }
});
