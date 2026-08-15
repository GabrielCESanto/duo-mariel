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
    const tipo = [
      "aprender",
      "itunes",
      "evento_login",
      "evento_lista",
      "evento_add",
      "evento_remover",
      "evento_add_repertorio",
    ].includes(body.tipo)
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

    // Playlist de evento (cliente contratante, protegida por senha própria
    // de cada show). Toda ação confere a senha de novo aqui no servidor
    // (não há sessão/token: cada chamada manda evento_id + senha, guardados
    // no navegador do contratante depois do login).
    if (tipo.startsWith("evento_")) {
      const eventoId = String(body.evento_id ?? "");
      const senha = String(body.senha ?? "");
      if (!eventoId || !senha) return json({ error: "Dados incompletos" }, 400);

      const { data: evento, error: eventoError } = await supabase
        .from("eventos")
        .select("senha")
        .eq("id", eventoId)
        .single();
      if (eventoError || !evento) return json({ error: "Evento não encontrado" }, 404);
      // Sem senha configurada pra esse evento = recurso desativado (mesma
      // mensagem de "senha incorreta" pra não revelar se o evento existe
      // com a playlist desligada)
      if (!evento.senha || senha !== evento.senha) return json({ error: "Senha incorreta" }, 401);

      if (tipo === "evento_login") {
        return json({ ok: true });
      }

      if (tipo === "evento_lista") {
        const { data, error } = await supabase
          .from("pedidos_evento")
          .select("id, nome, artista, capa, preview_url, created_at")
          .eq("evento_id", eventoId)
          .order("created_at");
        if (error) return json({ error: "Erro ao carregar" }, 500);
        return json({ musicas: data ?? [] });
      }

      if (tipo === "evento_add") {
        const musica = body.musica ?? {};
        const nome = String(musica.nome ?? "").slice(0, 200).trim();
        const artista = String(musica.artista ?? "").slice(0, 200).trim();
        if (!nome || !artista) return json({ error: "Música inválida" }, 400);

        // Limite generoso pra evitar abuso (ninguém precisa de mais que
        // isso numa playlist de evento real)
        const { count } = await supabase
          .from("pedidos_evento")
          .select("*", { count: "exact", head: true })
          .eq("evento_id", eventoId);
        if ((count ?? 0) >= 60) {
          return json({ error: "Limite de músicas atingido para este evento" }, 400);
        }

        const trackId = Number(musica.itunes_track_id);
        const registro = {
          evento_id: eventoId,
          nome,
          artista,
          capa: musica.capa ? String(musica.capa).slice(0, 500) : null,
          itunes_track_id: Number.isFinite(trackId) ? trackId : null,
          preview_url: musica.preview_url ? String(musica.preview_url).slice(0, 500) : null,
        };

        const { data, error } = await supabase
          .from("pedidos_evento")
          .insert(registro)
          .select()
          .single();
        if (error) return json({ error: "Erro ao adicionar" }, 500);
        return json({ musica: data });
      }

      if (tipo === "evento_remover") {
        const id = String(body.id ?? "");
        if (!id) return json({ error: "Id inválido" }, 400);
        const { error } = await supabase
          .from("pedidos_evento")
          .delete()
          .eq("id", id)
          .eq("evento_id", eventoId);
        if (error) return json({ error: "Erro ao remover" }, 500);
        return json({ ok: true });
      }

      // Leva uma música da lista pessoal do evento pro repertório oficial
      // do duo (tabela "musicas") — útil quando o contratante pede algo
      // que a gente ainda não toca. Evita duplicata (nome+artista, sem
      // diferenciar caixa) em vez de inserir de novo se já existir.
      if (tipo === "evento_add_repertorio") {
        const musica = body.musica ?? {};
        const nome = String(musica.nome ?? "").slice(0, 200).trim();
        const artista = String(musica.artista ?? "").slice(0, 200).trim();
        if (!nome || !artista) return json({ error: "Música inválida" }, 400);

        const { data: existente } = await supabase
          .from("musicas")
          .select("id, nome, artista, estilo")
          .ilike("nome", nome)
          .ilike("artista", artista)
          .maybeSingle();
        if (existente) return json({ musica: existente });

        const { data, error } = await supabase
          .from("musicas")
          .insert({ nome, artista })
          .select("id, nome, artista, estilo")
          .single();
        if (error) return json({ error: "Erro ao adicionar ao repertório" }, 500);
        return json({ musica: data });
      }
    }

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
