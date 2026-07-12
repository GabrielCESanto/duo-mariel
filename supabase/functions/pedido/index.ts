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
    const tipo = ["aprender", "itunes"].includes(body.tipo)
      ? body.tipo
      : "pedido";

    // Proxy da iTunes Search API: no iPhone a Apple redireciona a chamada
    // direta para musics:// e o navegador bloqueia (CORS)
    if (tipo === "itunes") {
      const termo = String(body.termo ?? "").slice(0, 200).trim();
      const limite = Math.min(Math.max(Number(body.limite) || 1, 1), 10);
      if (!termo) return json({ results: [] });

      const resp = await fetch(
        `https://itunes.apple.com/search?term=${encodeURIComponent(termo)}` +
          `&media=music&entity=song&limit=${limite}&country=BR`
      );
      if (!resp.ok) return json({ results: [] });
      const dados = await resp.json();
      return json({ results: dados.results ?? [] });
    }

    // Cliente com service role — ignora RLS
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

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

      // Sem o Telegram, o banco é o único registro — falha precisa avisar
      if (dbError) {
        console.error("Erro ao salvar sugestão:", dbError);
        return json({ error: "Erro ao salvar" }, 500);
      }

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

    if (dbError) {
      console.error("Erro ao salvar pedido:", dbError);
      return json({ error: "Erro ao salvar" }, 500);
    }

    return json({ ok: true });
  } catch (e) {
    console.error(e);
    return json({ error: (e as Error).message }, 500);
  }
});
