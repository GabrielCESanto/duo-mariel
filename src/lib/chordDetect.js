// Reconhecimento de acorde por áudio ao vivo, pra "rolagem inteligente" da
// cifra (acompanha o músico tocando, em vez de rolar em velocidade fixa).
//
// A abordagem não tenta identificar "qualquer acorde do mundo" — em vez
// disso, a cada instante, compara o som captado só com o acorde que a
// cifra espera agora e com o próximo, e decide qual dos dois bate melhor.
// Isso é bem mais confiável que reconhecimento genérico, porque a
// sequência de acordes da música já é conhecida (vem do .cho).
//
// Passo a passo: FFT (via AnalyserNode) -> "chroma" (energia agrupada nas
// 12 classes de nota, ignorando oitava) -> comparação por similaridade de
// cosseno com o "template" de cada acorde candidato.

import { dividirAcorde } from "./chordpro";

// Intervalos (em semitons a partir da fundamental) de cada qualidade de
// acorde reconhecida. Não cobre a especificação inteira de cifra — só o
// que aparece com frequência em cifra brasileira. Ordem importa (primeiro
// padrão que bater, vale), e por isso maj7/M7 vêm ANTES de m7: "M7" e "m7"
// são acordes bem diferentes (maior com sétima x menor com sétima) que só
// se distinguem pela maiúscula do M, então esses dois padrões precisam
// comparar com a grafia original (case-sensitive) em vez de normalizar
// tudo pra minúsculo, senão um viraria o outro.
const INTERVALOS_POR_QUALIDADE = [
  [/^(maj7|M7|Δ)/, [0, 4, 7, 11]],
  [/^7M/, [0, 4, 7, 11]], // notação alternativa comum ("C7M") pro mesmo maj7
  [/^(m7b5|m7-5|ø)/i, [0, 3, 6, 10]],
  [/^m9/i, [0, 3, 7, 10, 2]],
  [/^m7/i, [0, 3, 7, 10]],
  [/^m6/i, [0, 3, 7, 9]],
  [/^(dim7|°7)/i, [0, 3, 6, 9]],
  [/^(dim|°)/i, [0, 3, 6]],
  [/^m(?!aj)/i, [0, 3, 7]], // "m" sozinho = menor (mas não quando é começo de "maj")
  [/^(aug|\+)/i, [0, 4, 8]],
  [/^sus2/i, [0, 2, 7]],
  [/^sus4?/i, [0, 5, 7]], // "sus" sozinho também costuma significar sus4
  [/^add9/i, [0, 4, 7, 2]],
  [/^9/, [0, 4, 7, 10, 2]],
  [/^7/, [0, 4, 7, 10]],
  [/^6/, [0, 4, 7, 9]],
];

function intervalosDaQualidade(qualidade) {
  const achado = INTERVALOS_POR_QUALIDADE.find(([regex]) => regex.test(qualidade));
  return achado ? achado[1] : [0, 4, 7]; // sem sufixo reconhecido (ou vazio) = maior simples
}

// Vetor de 12 posições (uma por classe de nota), normalizado pra norma 1 —
// pronto pra comparar por produto escalar com um chroma também normalizado.
export function gerarTemplateAcorde(acorde) {
  const analisado = dividirAcorde(acorde);
  if (!analisado) return null;
  const intervalos = intervalosDaQualidade(analisado.qualidade);
  const template = new Array(12).fill(0);
  for (const semitom of intervalos) {
    template[(analisado.indice + semitom) % 12] = 1;
  }
  const norma = Math.sqrt(template.reduce((s, v) => s + v * v, 0)) || 1;
  return template.map((v) => v / norma);
}

// Faixa de frequência considerada: abaixo disso é só ruído/zumbido de
// ambiente, acima disso já são harmônicos que mais atrapalham do que
// ajudam a identificar a nota fundamental que está soando.
const FREQ_MIN = 80; // ~E2, a corda mais grave de um violão
const FREQ_MAX = 1200;
const DB_MINIMO = -85; // abaixo disso, é silêncio/ruído de fundo

// Lê o espectro atual do AnalyserNode e devolve o "chroma": energia
// relativa de cada uma das 12 classes de nota (C, C#, D...), normalizada
// pra somar 1 — ignora em qual oitava o som está, só a classe.
export function extrairChroma(analyser, sampleRate) {
  const bins = new Float32Array(analyser.frequencyBinCount);
  analyser.getFloatFrequencyData(bins);

  const chroma = new Array(12).fill(0);
  const freqPorBin = sampleRate / analyser.fftSize;

  for (let i = 0; i < bins.length; i++) {
    const freq = i * freqPorBin;
    if (freq < FREQ_MIN || freq > FREQ_MAX) continue;
    const db = bins[i];
    if (!Number.isFinite(db) || db < DB_MINIMO) continue;

    const magnitude = Math.pow(10, db / 20); // dBFS -> escala linear
    const nota = 69 + 12 * Math.log2(freq / 440); // nº MIDI fracionário (A4=69)
    const classe = ((Math.round(nota) % 12) + 12) % 12;
    chroma[classe] += magnitude;
  }

  const total = chroma.reduce((a, b) => a + b, 0) || 1;
  return chroma.map((v) => v / total);
}

// Produto escalar entre chroma e template (ambos normalizados) — 1 é
// combinação perfeita, 0 é nenhuma relação.
export function similaridadeChroma(chroma, template) {
  if (!template) return 0;
  let soma = 0;
  for (let i = 0; i < 12; i++) soma += chroma[i] * template[i];
  return soma;
}

// A partir dos `blocos` do .cho (parseChordPro), monta a lista, em ordem,
// de "passagens": cada ocorrência explícita de um acorde [Entre colchetes]
// no texto, com a referência de onde ela fica (pra rolar a tela até lá).
// Entre um token de acorde e o próximo, o acorde "em vigor" continua sendo
// o último marcado — é assim que cifra em texto normalmente indica "seguiu
// tocando o mesmo acorde" sem precisar repetir o símbolo em toda palavra.
export function construirPassagensDeAcorde(blocos) {
  const passagens = [];
  let acordeAtual = null;

  blocos.forEach((bloco, blocoIndex) => {
    if (bloco.tipo !== "linha") return;
    bloco.segmentos.forEach((seg, segIndex) => {
      if (seg.chord) {
        acordeAtual = seg.chord;
        passagens.push({ chord: acordeAtual, blocoIndex, segIndex });
      }
    });
  });

  return passagens;
}
