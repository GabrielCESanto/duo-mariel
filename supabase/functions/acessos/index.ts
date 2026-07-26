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

// Proxy da API privada do GoatCounter (visitas únicas/aparelhos) — só pra
// quem está logado no Admin. O token da API do GoatCounter fica só aqui no
// servidor (secret da function); nunca vai pro bundle do site.
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Confere que quem chamou está de fato autenticado no Supabase (mesma
    // sessão usada no Admin) — sem isso, qualquer um poderia bater nesse
    // endpoint e consumir a cota da API do GoatCounter.
    // Chama a API de auth direto (REST), sem passar pelo client da lib —
    // getUser()/getUser(jwt) da supabase-js dependem de estado de sessão
    // interno do GoTrueClient que não existe numa function serverless e
    // devolvia "Auth session missing!" mesmo com o JWT certo.
    const authHeader = req.headers.get("Authorization") ?? "";
    const jwt = authHeader.replace(/^Bearer\s+/i, "").trim();
    if (!jwt) return json({ error: "Não autenticado (sem token)" }, 401);

    const authResp = await fetch(`${Deno.env.get("SUPABASE_URL")}/auth/v1/user`, {
      headers: {
        Authorization: `Bearer ${jwt}`,
        apikey: Deno.env.get("SUPABASE_ANON_KEY")!,
      },
    });
    if (!authResp.ok) {
      const texto = await authResp.text();
      return json({ error: `Não autenticado (${authResp.status}): ${texto.slice(0, 200)}` }, 401);
    }
    const usuario = await authResp.json();
    if (!usuario?.id) return json({ error: "Não autenticado (sem usuário)" }, 401);

    const token = Deno.env.get("GOATCOUNTER_API_TOKEN");
    const codigo = Deno.env.get("GOATCOUNTER_CODE");
    if (!token || !codigo) {
      return json({ error: "GOATCOUNTER_API_TOKEN/GOATCOUNTER_CODE não configurados" }, 500);
    }

    const { periodos } = await req.json();
    if (!Array.isArray(periodos)) return json({ error: "periodos inválido" }, 400);

    const resultado = await Promise.all(
      periodos.map(async (p: { rotulo: string; inicio: string }) => {
        try {
          const resp = await fetch(
            `https://${codigo}.goatcounter.com/api/v0/stats/total?start=${p.inicio}`,
            { headers: { Authorization: `Bearer ${token}` } }
          );
          if (!resp.ok) {
            // Devolve o motivo (ex.: token sem permissão, código errado)
            // em vez de só sumir com o número — isso é o que aparece na
            // aba Network do navegador pra diagnosticar
            const texto = await resp.text();
            console.error(`GoatCounter respondeu ${resp.status}:`, texto);
            return { rotulo: p.rotulo, unicos: null, erro: `${resp.status}: ${texto.slice(0, 200)}` };
          }
          const dados = await resp.json();
          if (typeof dados.total_unique !== "number") {
            // Formato inesperado — devolve o JSON cru pra descobrir o campo
            // certo em vez de silenciosamente mostrar "—"
            return {
              rotulo: p.rotulo,
              unicos: null,
              erro: `Resposta sem total_unique: ${JSON.stringify(dados).slice(0, 300)}`,
            };
          }
          return { rotulo: p.rotulo, unicos: dados.total_unique };
        } catch (e) {
          return { rotulo: p.rotulo, unicos: null, erro: (e as Error).message };
        }
      })
    );

    return json({ resultado });
  } catch (e) {
    console.error(e);
    return json({ error: (e as Error).message }, 500);
  }
});
