// Busca o preview oficial de 30s da música na iTunes Search API
// (pública, gratuita, sem chave). Retorna a URL do áudio ou null.

const cache = new Map();

// Busca músicas para autocompletar o cadastro (nome, artista, estilo, capa).
// Se a API falhar ou não achar, retorna [] — o cadastro manual segue normal.
export async function buscarMusicasApi(termo) {
  try {
    const resp = await fetch(
      `https://itunes.apple.com/search?term=${encodeURIComponent(termo)}&media=music&entity=song&limit=6&country=BR`
    );
    const json = await resp.json();
    const vistos = new Set();
    return (json.results ?? []).flatMap((r) => {
      const chave = `${r.trackName}|${r.artistName}`.toLowerCase();
      if (!r.trackName || vistos.has(chave)) return [];
      vistos.add(chave);
      return [
        {
          nome: r.trackName,
          artista: r.artistName ?? "",
          estilo: r.primaryGenreName ?? "",
          capa: r.artworkUrl60 ?? null,
        },
      ];
    });
  } catch (e) {
    console.error("Erro na busca do iTunes:", e);
    return [];
  }
}

export async function buscarPreview(nome, artista) {
  const chave = `${nome}|${artista}`.toLowerCase();
  if (cache.has(chave)) return cache.get(chave);

  try {
    const termo = encodeURIComponent(`${nome} ${artista}`);
    const resp = await fetch(
      `https://itunes.apple.com/search?term=${termo}&media=music&entity=song&limit=1&country=BR`
    );
    const json = await resp.json();
    const url = json.results?.[0]?.previewUrl ?? null;
    cache.set(chave, url);
    return url;
  } catch (e) {
    console.error("Erro ao buscar preview:", e);
    return null;
  }
}
