// Parser simples de ChordPro (.cho): diretivas "{chave: valor}" e acordes
// embutidos na letra como "[Acorde]". Não tenta cobrir a especificação
// ChordPro inteira — só o subset que scripts/pdf_para_cho.py gera (title,
// artist, comment) e o que um humano digitaria à mão do mesmo jeito.

const DIRECTIVE_RE = /^\{(\w+):\s*(.*)\}$/;
const CHORD_TOKEN_RE = /\[([^\]]+)\]/g;

// Linhas de comentário que na verdade são metadados de cabeçalho (o script
// de conversão os emite como {comment: ...} por não ter marcador próprio) —
// tratadas como legenda discreta em vez de título de seção
const META_RE = /^(tom|capotraste|composi[cç][aã]o de|afina[cç][aã]o)\s*:/i;

function dividirAcordes(linha) {
  const segmentos = [];
  let ultimoIndex = 0;
  let acordeAtual = null;
  CHORD_TOKEN_RE.lastIndex = 0;
  let m;
  while ((m = CHORD_TOKEN_RE.exec(linha))) {
    const textoAntes = linha.slice(ultimoIndex, m.index);
    if (textoAntes || acordeAtual) {
      segmentos.push({ chord: acordeAtual, texto: textoAntes });
    }
    acordeAtual = m[1];
    ultimoIndex = CHORD_TOKEN_RE.lastIndex;
  }
  const resto = linha.slice(ultimoIndex);
  segmentos.push({ chord: acordeAtual, texto: resto });
  return segmentos;
}

// Recebe o texto bruto do .cho e devolve { title, artist, blocos } — blocos
// é a lista, em ordem, do que renderizar: seções (comentários), linhas em
// branco e linhas de letra/acorde já divididas em segmentos.
export function parseChordPro(texto) {
  const resultado = { title: null, artist: null, blocos: [] };
  const linhas = String(texto ?? "").split(/\r?\n/);

  for (const linhaBruta of linhas) {
    const linha = linhaBruta.replace(/\r$/, "");
    const diretiva = linha.match(DIRECTIVE_RE);
    if (diretiva) {
      const chave = diretiva[1].toLowerCase();
      const valor = diretiva[2].trim();
      if (chave === "title") resultado.title = valor;
      else if (chave === "artist") resultado.artist = valor;
      else if (chave === "comment" || chave === "comment_italic" || chave === "ci") {
        resultado.blocos.push({
          tipo: META_RE.test(valor) ? "meta" : "secao",
          texto: valor,
        });
      }
      // outras diretivas (ex.: {key:}, {capo:}) são ignoradas por ora
      continue;
    }
    if (linha.trim() === "") {
      resultado.blocos.push({ tipo: "vazio" });
      continue;
    }
    resultado.blocos.push({ tipo: "linha", segmentos: dividirAcordes(linha) });
  }

  return resultado;
}
