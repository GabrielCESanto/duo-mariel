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

// ---------- Transposição ----------

const NOTAS = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
// Enarmônicos mais comuns em cifra brasileira (bemóis) — só usados pra
// localizar a posição no círculo cromático; a nota transposta sempre sai
// em sustenido (não tenta adivinhar se o tom "deveria" usar bemol)
const ENARMONICOS = { Db: "C#", Eb: "D#", Gb: "F#", Ab: "G#", Bb: "A#" };

function transporParteDoAcorde(parte, semitons) {
  const m = parte.match(/^([A-G])(#|b)?(.*)$/);
  if (!m) return parte;
  const [, letra, alteracao, resto] = m;
  const chaveOriginal = letra + (alteracao ?? "");
  const notaBase = ENARMONICOS[chaveOriginal] ?? chaveOriginal;
  const indice = NOTAS.indexOf(notaBase);
  if (indice === -1) return parte; // não reconhecida (ex.: nota já "estranha") — devolve como veio
  const novoIndice = ((indice + semitons) % 12 + 12) % 12;
  return NOTAS[novoIndice] + resto;
}

// "Em7/D" (baixo diferente) precisa transpor as duas partes separadamente
function transporAcorde(acorde, semitons) {
  return acorde
    .split("/")
    .map((parte) => transporParteDoAcorde(parte, semitons))
    .join("/");
}

// Desloca todo acorde [entre colchetes] do texto em N semitons — usado pro
// controle de "Tom" na tela da cifra. Não toca em mais nada do texto (letra,
// seções, metadados), só nos tokens [Acorde].
export function transporTexto(texto, semitons) {
  if (!texto || !semitons) return texto;
  return texto.replace(/\[([^\]]+)\]/g, (_, acorde) => `[${transporAcorde(acorde, semitons)}]`);
}

// ---------- Capotraste ----------

// Só reconhece/atualiza a linha no formato que a própria tela da cifra
// escreve (ver definirCapoNoTexto) — cifras convertidas de PDF podem ter
// uma anotação de capotraste em formato livre (o texto original do PDF),
// que não é reconhecida aqui; nesse caso o controle mostra "sem capotraste"
// até o usuário mexer nele (a linha antiga continua visível no texto,
// intacta, só não é mais atualizada por esse controle específico)
const LINHA_CAPO_RE = /^\{comment:\s*Capotraste na (\d+)ª casa\}\s*$/im;

export function extrairCapoDoTexto(texto) {
  const m = String(texto ?? "").match(LINHA_CAPO_RE);
  return m ? Number(m[1]) : 0;
}

// Insere, atualiza ou remove (casa=0) a linha de capotraste no texto —
// logo após title/artist se existirem, senão no topo
export function definirCapoNoTexto(texto, casa) {
  const linhas = String(texto ?? "").split(/\r?\n/);
  const linhaNova = casa > 0 ? `{comment: Capotraste na ${casa}ª casa}` : null;
  const idx = linhas.findIndex((l) => LINHA_CAPO_RE.test(l));

  if (idx !== -1) {
    if (linhaNova) linhas[idx] = linhaNova;
    else linhas.splice(idx, 1);
    return linhas.join("\n");
  }
  if (!linhaNova) return texto; // não tinha e continua sem

  let pontoInsercao = 0;
  for (let i = 0; i < linhas.length; i++) {
    if (/^\{(title|artist):/i.test(linhas[i])) pontoInsercao = i + 1;
  }
  linhas.splice(pontoInsercao, 0, linhaNova);
  return linhas.join("\n");
}
