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
// ambiente, acima disso já é região que mais atrapalha (ruído, harmônicos
// distantes) do que ajuda a identificar o que está soando.
const FREQ_MIN = 65; // ~C2, uma margem abaixo do E2 (corda mais grave do violão em afinação padrão)
const FREQ_MAX = 1050; // um pouco acima do E5 — cobre acorde aberto/1ª posição com folga
const DB_MINIMO = -85; // abaixo disso, é silêncio/ruído de fundo

const NOTA_BASE_HZ = 130.81; // C3
// Oitavas buscadas a partir de C3, pra cada uma das 12 classes — cobre
// aproximadamente C2 até C6, a faixa onde um violão em afinação padrão
// concentra a fundamental dos acordes abertos/1ª posição (o repertório
// mais comum de show).
const OITAVAS_BUSCADAS = [-1, 0, 1, 2];
// Fundamental (1) e 1º harmônico/oitava acima (2) — o harmônico conta
// como evidência mais fraca (dividido por ele mesmo), útil quando a
// fundamental em si está fraca (corda grave captada por um microfone
// fraco, por exemplo) mas o harmônico aparece bem.
const HARMONICOS_BUSCADOS = [1, 2];

function paraLinear(db) {
  return Number.isFinite(db) && db > DB_MINIMO ? Math.pow(10, db / 20) : 0;
}

// Lê o espectro atual do AnalyserNode e devolve o "chroma": energia
// relativa de cada uma das 12 classes de nota (C, C#, D...), normalizada
// pra somar 1 — ignora em qual oitava o som está, só a classe.
//
// Em vez de despejar TODA energia do espectro no pitch-class mais próximo
// de cada bin (o que fazia ruído de banda larga — como o ataque de uma
// palhetada — contaminar os 12 bins quase por igual), procura, nota por
// nota, só nas frequências que o violão realmente usa (ver
// OITAVAS_BUSCADAS) e pega o PICO numa janelinha em volta de cada uma —
// a mesma ideia do Chromagram do Adam Stark (chord_detector/
// Chord-Detector-and-Chromagram), adaptada aqui sem depender de FFT em
// C++/WASM, só reorganizando como já lemos o AnalyserNode nativo.
export function extrairChroma(analyser, sampleRate) {
  const bins = new Float32Array(analyser.frequencyBinCount);
  analyser.getFloatFrequencyData(bins);
  const freqPorBin = sampleRate / analyser.fftSize;

  const chroma = new Array(12).fill(0);

  for (let classe = 0; classe < 12; classe++) {
    const freqClasse = NOTA_BASE_HZ * 2 ** (classe / 12);
    let soma = 0;

    for (const oitava of OITAVAS_BUSCADAS) {
      for (const harmonico of HARMONICOS_BUSCADOS) {
        const freqAlvo = freqClasse * 2 ** oitava * harmonico;
        if (freqAlvo < FREQ_MIN || freqAlvo > FREQ_MAX) continue;

        const binCentral = Math.round(freqAlvo / freqPorBin);
        let pico = 0;
        for (let d = -1; d <= 1; d++) {
          const idx = binCentral + d;
          if (idx >= 0 && idx < bins.length) pico = Math.max(pico, paraLinear(bins[idx]));
        }
        soma += pico / harmonico;
      }
    }

    chroma[classe] = soma;
  }

  const total = chroma.reduce((a, b) => a + b, 0) || 1;
  return chroma.map((v) => v / total);
}

// Quanto penalizar energia detectada FORA das notas do acorde candidato —
// ideia do ChordDetector do Adam Stark (chord_detector/
// Chord-Detector-and-Chromagram): ele pontua um acorde pelo tanto de
// energia que "vaza" pras notas que não são dele (menos vazamento =
// melhor candidato), em vez de só somar o que bate.
const PESO_PENALIDADE_FORA_DO_ACORDE = 0.5;

// Fração de "quanto da energia dentro+fora do acorde está de fato dentro"
// — vai de 0 (nada bate) a 1 (toda energia relevante está nas notas do
// acorde). Testada primeiro como subtração direta (dentro - peso*fora) e
// deu números sem sentido pra calibrar: acorde tocado certinho (testado
// com "O Sol", Jota Quest — notas limpas e sustentadas) ficava perto de
// 0% e o errado ia a -40%. A proporção resolve isso mantendo a mesma
// discriminação (a diferença real, em quanto da energia cai dentro vs
// fora do acorde, continua enorme) só com uma escala 0-100% que dá pra
// calibrar e mostrar na tela sem ficar negativo.
export function similaridadeChroma(chroma, template) {
  if (!template) return 0;
  let dentro = 0;
  let fora = 0;
  for (let i = 0; i < 12; i++) {
    if (template[i] > 0) dentro += chroma[i] * template[i];
    else fora += chroma[i];
  }
  return dentro / (dentro + PESO_PENALIDADE_FORA_DO_ACORDE * fora || 1);
}

// A partir dos `blocos` do .cho (parseChordPro), monta a lista, em ordem,
// de "frases": uma por linha de letra, com o acorde em vigor naquele
// ponto (o último marcado até ali — cifra em texto normalmente indica
// "segue tocando o mesmo acorde" sem repetir o símbolo em toda linha) e
// a referência de onde a linha fica (pra rolar a tela até lá).
//
// É a unidade usada pro casamento por voz: comparar o que está sendo
// cantado com a letra de cada frase, numa janela pequena das próximas
// frases, resolve em qual repetição de uma linha/acorde o músico está —
// o acorde sozinho não consegue, porque o mesmo acorde (ou até a mesma
// linha) pode se repetir em vários versos.
export function construirFrases(blocos) {
  const frases = [];
  let acordeAtual = null;

  blocos.forEach((bloco, blocoIndex) => {
    if (bloco.tipo !== "linha") return;
    for (const seg of bloco.segmentos) {
      if (seg.chord) acordeAtual = seg.chord;
    }
    const texto = bloco.segmentos.map((s) => s.texto).join("").trim();
    frases.push({ blocoIndex, texto, chord: acordeAtual });
  });

  // Linhas curtas (poucas palavras, comum em cifra que quebra a letra em
  // versos pequenos) não dão contexto suficiente pro casamento por voz —
  // complementa com a linha seguinte só pra fins de comparação; o texto
  // exibido na tela continua sendo só o da própria linha.
  frases.forEach((frase, i) => {
    const nPalavras = frase.texto.split(/\s+/).filter(Boolean).length;
    frase.contextoTexto =
      nPalavras < 3 && frases[i + 1] ? `${frase.texto} ${frases[i + 1].texto}`.trim() : frase.texto;
  });

  return frases;
}

// A primeira frase, a partir de `indiceAtual` (exclusive), em que o
// acorde em vigor é diferente do atual — usado pelo reconhecimento por
// áudio (secundário/opcional) pra saber pra onde pular quando detecta uma
// troca de acorde real, em vez de avançar uma frase de cada vez mesmo
// quando várias seguidas compartilham o mesmo acorde.
export function proximaFraseComAcordeDiferente(frases, indiceAtual) {
  const acordeAtual = frases[indiceAtual]?.chord;
  for (let i = indiceAtual + 1; i < frases.length; i++) {
    if (frases[i].chord !== acordeAtual) return i;
  }
  return -1;
}
