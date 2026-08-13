import { PEDIDO_FUNCTION_URL, anonKey, supabaseConfigured } from "./supabase";

// iTunes Search API (pública, gratuita, sem chave).
// No iPhone a Apple redireciona a chamada para o esquema musics:// e o
// navegador bloqueia — nesses casos caímos para o proxy na edge function.

const cache = new Map();

// Depois que a via direta falha uma vez (iOS), vai sempre pelo proxy
let usarSomenteProxy = false;

// Tentativa "crua": direta (desktop/Android) ou via proxy (iOS). Lança se as
// duas falharem — quem chama decide se quer tratar isso como "sem resultado"
// ou precisa distinguir falha de "não encontrado" (ver existeNoItunes abaixo).
async function buscarNoItunesOuFalhar(termo, limite) {
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
  if (!supabaseConfigured) throw new Error("Proxy indisponível (Supabase não configurado)");

  const resp = await fetch(PEDIDO_FUNCTION_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
    },
    body: JSON.stringify({ tipo: "itunes", termo, limite }),
  });
  if (!resp.ok) throw new Error(`Proxy respondeu ${resp.status}`);
  return (await resp.json()).results ?? [];
}

// Versão tolerante a falha — usada pelos fluxos que preferem "nada
// encontrado" a um erro (preview, autocomplete de cadastro)
async function buscarNoItunes(termo, limite) {
  try {
    return await buscarNoItunesOuFalhar(termo, limite);
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
  const termo = `${nome} ${artista ?? ""}`.trim();
  if (!termo) return null;

  try {
    const resultados = await buscarNoItunesOuFalhar(termo, 1);
    return resultados.length > 0;
  } catch {
    return null; // falha de rede/limite — não dá pra afirmar que não existe
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
        id: r.trackId ?? null,
        nome: r.trackName,
        artista: r.artistName ?? "",
        estilo: r.primaryGenreName ?? "",
        capa: r.artworkUrl60 ?? null,
        previewUrl: r.previewUrl ?? null,
      },
    ];
  });
}
