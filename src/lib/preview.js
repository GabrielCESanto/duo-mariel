import { PEDIDO_FUNCTION_URL, anonKey, supabaseConfigured } from "./supabase";

// iTunes Search API (pública, gratuita, sem chave).
// No iPhone a Apple redireciona a chamada para o esquema musics:// e o
// navegador bloqueia — nesses casos caímos para o proxy na edge function.

const cache = new Map();

// Depois que a via direta falha uma vez (iOS), vai sempre pelo proxy
let usarSomenteProxy = false;

async function buscarNoItunes(termo, limite) {
  const params = `term=${encodeURIComponent(termo)}&media=music&entity=song&limit=${limite}&country=BR`;

  // 1) Tentativa direta (funciona em desktop/Android)
  if (!usarSomenteProxy) {
    try {
      const resp = await fetch(`https://itunes.apple.com/search?${params}`);
      if (resp.ok) return (await resp.json()).results ?? [];
      usarSomenteProxy = true;
    } catch {
      usarSomenteProxy = true; // segue para o proxy
    }
  }

  // 2) Proxy via edge function (necessário no iOS)
  if (!supabaseConfigured) return [];
  try {
    const resp = await fetch(PEDIDO_FUNCTION_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`,
      },
      body: JSON.stringify({ tipo: "itunes", termo, limite }),
    });
    if (!resp.ok) return [];
    return (await resp.json()).results ?? [];
  } catch (e) {
    console.error("Erro ao buscar no iTunes:", e);
    return [];
  }
}

// Preview oficial de 30s de uma música. Retorna a URL do áudio ou null.
export async function buscarPreview(nome, artista) {
  const chave = `${nome}|${artista}`.toLowerCase();
  if (cache.has(chave)) return cache.get(chave);

  const resultados = await buscarNoItunes(`${nome} ${artista}`, 1);
  const url = resultados[0]?.previewUrl ?? null;
  cache.set(chave, url);
  return url;
}

// Verifica se a música existe no iTunes (checagem em lote da área admin).
// Retorna true/false, ou null quando a checagem falhou (rede, limite da API) —
// nesse caso não dá para afirmar que a música não existe.
export async function existeNoItunes(nome, artista) {
  const params =
    `term=${encodeURIComponent(`${nome} ${artista ?? ""}`.trim())}` +
    `&media=music&entity=song&limit=1&country=BR`;

  try {
    const resp = await fetch(`https://itunes.apple.com/search?${params}`);
    if (resp.ok) return ((await resp.json()).results ?? []).length > 0;
  } catch {
    // segue para o proxy
  }

  if (!supabaseConfigured) return null;
  try {
    const resp = await fetch(PEDIDO_FUNCTION_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`,
      },
      body: JSON.stringify({
        tipo: "itunes",
        termo: `${nome} ${artista ?? ""}`.trim(),
        limite: 1,
      }),
    });
    if (!resp.ok) return null;
    return ((await resp.json()).results ?? []).length > 0;
  } catch {
    return null;
  }
}

// Busca músicas para autocompletar o cadastro (nome, artista, estilo, capa).
// Se a API falhar ou não achar, retorna [] — o cadastro manual segue normal.
export async function buscarMusicasApi(termo) {
  const resultados = await buscarNoItunes(termo, 6);
  const vistos = new Set();
  return resultados.flatMap((r) => {
    const chave = `${r.trackName}|${r.artistName}`.toLowerCase();
    if (!r.trackName || vistos.has(chave)) return [];
    vistos.add(chave);
    return [
      {
        nome: r.trackName,
        artista: r.artistName ?? "",
        estilo: r.primaryGenreName ?? "",
        capa: r.artworkUrl60 ?? null,
        previewUrl: r.previewUrl ?? null,
      },
    ];
  });
}
