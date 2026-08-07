// Porta pro navegador do scripts/pdf_para_cho.py (Python): mesma lógica de
// juntar acorde+letra por posição na página, só que usando o texto que o
// pdf.js já extrai — sem precisar rodar nada fora do navegador. Roda no
// upload do PDF (Admin > Músicas), guardando o resultado direto em
// cifra_cho.
//
// PDFs de fonte quebrada (texto vira "(cid:...") ou sem texto nenhum
// (página escaneada) precisariam de OCR pra funcionar — isso não dá pra
// fazer aqui (o script Python ainda existe pra esses casos, via
// scripts/pdf_para_cho.py). pdfParaChordPro devolve null nesses casos, e
// a música continua só com o PDF normal.
import * as pdfjs from "pdfjs-dist";

// "-" no fim da classe de caracteres = literal (não forma intervalo com o
// caractere anterior, diferente de "+-/" no meio, que seria um intervalo
// não intencional de "+" até "/")
const CHORD_RE = /^[A-G](#|b)?[a-zA-Z0-9°ºΔ#()+/-]{0,12}$/;
// px: palavras com "top" a menos que isso de distância = mesma linha
const TOLERANCIA_LINHA = 3.0;
const RUIDO_DIAGRAMA_RE = /^(parte\s+\d+|\(repete parte \d+ e parte \d+\))$/i;
const HEADER_KEYWORDS = ["tom:", "capotraste", "afinação:", "composição de:"];

// Extrai {text, top, x0} de uma página. Itens do pdf.js às vezes trazem
// uma linha inteira grudada num item só — divide em "palavras" e
// interpola a posição x de cada uma, proporcional ao nº de caracteres
// (só temos a caixa do item inteiro, não de cada palavra dentro dele)
async function extrairPalavras(pagina, viewport) {
  const conteudo = await pagina.getTextContent();
  const palavras = [];
  for (const item of conteudo.items) {
    const texto = item.str;
    if (!texto || !texto.trim()) continue;
    const x0Item = item.transform[4];
    const topItem = viewport.height - item.transform[5];
    const totalChars = texto.length || 1;
    const partes = texto.split(/(\s+)/);
    let offset = 0;
    for (const parte of partes) {
      if (parte.trim()) {
        const x0 = x0Item + (item.width * offset) / totalChars;
        palavras.push({ text: parte, top: topItem, x0 });
      }
      offset += parte.length;
    }
  }
  return palavras;
}

function agruparLinhas(palavras) {
  const ordenadas = [...palavras].sort((a, b) => a.top - b.top || a.x0 - b.x0);
  const linhas = [];
  let atual = [];
  let ultimoTop = null;
  for (const p of ordenadas) {
    if (ultimoTop !== null && Math.abs(p.top - ultimoTop) > TOLERANCIA_LINHA) {
      linhas.push(atual);
      atual = [];
    }
    atual.push(p);
    ultimoTop = p.top;
  }
  if (atual.length > 0) linhas.push(atual);
  for (const linha of linhas) linha.sort((a, b) => a.x0 - b.x0);
  return linhas;
}

const textoDaLinha = (linha) => linha.map((w) => w.text).join(" ");
const ehLinhaDeAcordes = (linha) => linha.length > 0 && linha.every((w) => CHORD_RE.test(w.text));
const ehMarcadorSecao = (linha) => linha.length > 0 && linha[0].text.startsWith("[");

function dividirMarcadorSecao(linha) {
  const fechamentoIdx = linha.findIndex((w) => w.text.endsWith("]"));
  if (fechamentoIdx === -1) {
    return { nome: textoDaLinha(linha).replace(/[[\]]/g, ""), resto: [] };
  }
  const nome = textoDaLinha(linha.slice(0, fechamentoIdx + 1)).replace(/[[\]]/g, "");
  return { nome, resto: linha.slice(fechamentoIdx + 1) };
}

function mesclarAcordeLetra(linhaAcordes, linhaLetra) {
  let texto = textoDaLinha(linhaLetra);
  const posicoes = [];
  let cursor = 0;
  for (const w of linhaLetra) {
    posicoes.push([w.x0, cursor]);
    cursor += w.text.length + 1; // +1 pelo espaço
  }

  const insercoes = [];
  for (const ac of linhaAcordes) {
    let idxTexto = texto.length;
    for (const [x0, idx] of posicoes) {
      if (x0 >= ac.x0 - 1) {
        idxTexto = idx;
        break;
      }
    }
    insercoes.push([idxTexto, `[${ac.text}]`]);
  }
  insercoes.sort((a, b) => b[0] - a[0]); // de trás pra frente, pra não bagunçar os índices
  for (const [idx, marcado] of insercoes) {
    texto = texto.slice(0, idx) + marcado + texto.slice(idx);
  }
  return texto;
}

const linhaSoAcordesParaCho = (linha) => linha.map((w) => `[${w.text}]`).join(" ");

// Fonte sem mapa de caracteres válido (texto vira "(cid:19)" etc.) ou
// página sem texto nenhum (PDF escaneado) — os dois pedem OCR, que não
// dá pra fazer no navegador
function paginasTemProblema(paginas) {
  const totalPalavras = paginas.reduce((n, p) => n + p.length, 0);
  if (totalPalavras === 0) return true;
  return paginas.some((pagina) => pagina.some((w) => w.text.includes("(cid:")));
}

function processarPaginas(paginas) {
  const saida = [];
  let titulo = null;
  let artista = null;
  const metaExtra = [];
  let emHeader = true;
  let primeiraPagina = true;

  for (const palavras of paginas) {
    if (palavras.length === 0) continue;
    const linhas = agruparLinhas(palavras);

    let i = 0;
    while (i < linhas.length) {
      let linha = linhas[i];
      let texto = textoDaLinha(linha);

      if (emHeader && primeiraPagina) {
        if (titulo === null) {
          titulo = texto;
          i++;
          continue;
        }
        if (artista === null) {
          artista = texto;
          i++;
          continue;
        }
        const textoLower = texto.toLowerCase();
        if (HEADER_KEYWORDS.some((kw) => textoLower.startsWith(kw))) {
          metaExtra.push(texto);
          i++;
          continue;
        }
        emHeader = false;
      }

      if (RUIDO_DIAGRAMA_RE.test(texto.trim())) {
        i++;
        continue;
      }

      if (ehMarcadorSecao(linha)) {
        const { nome, resto } = dividirMarcadorSecao(linha);
        saida.push(`{comment: ${nome}}`);
        if (resto.length > 0) {
          linha = resto;
          texto = textoDaLinha(linha);
        } else {
          i++;
          continue;
        }
      }

      if (ehLinhaDeAcordes(linha)) {
        const proxima = linhas[i + 1];
        if (proxima && !ehLinhaDeAcordes(proxima) && !ehMarcadorSecao(proxima)) {
          saida.push(mesclarAcordeLetra(linha, proxima));
          i += 2;
          continue;
        }
        saida.push(linhaSoAcordesParaCho(linha));
        i++;
        continue;
      }

      saida.push(texto);
      i++;
    }

    primeiraPagina = false;
    saida.push(""); // respiro entre páginas
  }

  const cho = [];
  if (titulo) cho.push(`{title: ${titulo}}`);
  if (artista) cho.push(`{artist: ${artista}}`);
  for (const m of metaExtra) cho.push(`{comment: ${m}}`);
  cho.push("");
  cho.push(...saida);
  return cho.join("\n");
}

// Devolve o texto em ChordPro, ou null se esse PDF não dá pra converter
// automaticamente (fonte quebrada, PDF escaneado, ou nenhum acorde
// reconhecido — nesses casos a música continua só com o PDF)
export async function pdfParaChordPro(origem) {
  const doc = await pdfjs.getDocument(origem).promise;
  try {
    const paginas = [];
    for (let i = 1; i <= doc.numPages; i++) {
      const pagina = await doc.getPage(i);
      const viewport = pagina.getViewport({ scale: 1 });
      paginas.push(await extrairPalavras(pagina, viewport));
    }
    if (paginasTemProblema(paginas)) return null;

    const resultado = processarPaginas(paginas);
    if (!/\[[^\]]+\]/.test(resultado)) return null; // nenhum acorde reconhecido

    return resultado;
  } finally {
    doc.destroy?.();
  }
}
