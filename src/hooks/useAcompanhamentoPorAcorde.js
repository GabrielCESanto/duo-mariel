import { useEffect, useMemo, useRef, useState } from "react";
import {
  construirFrases,
  extrairChroma,
  gerarTemplateAcorde,
  proximaFraseComAcordeDiferente,
  similaridadeChroma,
} from "../lib/chordDetect";
import { detectarIdioma } from "../lib/detectarIdioma";
import {
  criarReconhecedorDeVoz,
  pontuarSemelhancaTexto,
  reconhecimentoDeVozSuportado,
} from "../lib/reconhecimentoVoz";

// Só pula pra uma frase quando o texto ouvido bater pelo menos essa
// fração das palavras com o texto dela. Testado em 0,5 (rígido demais —
// bastava a voz reconhecer só metade errado de uma linha curta pra nunca
// passar) e depois em 0,4; ajustado pra 0,35 depois de mais testes reais.
const LIMIAR_VOZ = 0.35;
// Até quantas palavras (somando as próximas linhas) a busca por voz
// olha à frente — testado com janela fixa em linhas (5, depois 10) e deu
// problema: linha curta vira janela curta demais, linha longa vira janela
// longe demais, e numa 2ª estrofe/refrão idêntico ao primeiro, uma janela
// larga alcançava a repetição ERRADA lá na frente. Contar por palavra é
// mais consistente independente de como a letra foi quebrada em linhas.
// Reduzido de 20 pra 15 — 20 ainda deixava alcançar coincidências longe
// demais da posição real.
const PALAVRAS_JANELA_VOZ = 15;
// Quantas linhas pode voltar, além de avançar — testado só pra frente e
// dava problema: se um match errado empurrasse a posição adiante demais
// (ex.: bug de palavra curta batendo à toa, já corrigido), a busca nunca
// mais alcançava de volta a linha certa, mesmo reconhecendo tudo direito
// depois. Uma margem pequena pra trás permite se corrigir sozinho.
const RETROCESSO_LINHAS_VOZ = 2;
// Teto de segurança em linhas, mesmo se elas forem muito curtas (ex.:
// um trecho todo em "la la la") — sem isso, um monte de linhas curtas
// poderia esticar a janela de palavras bem mais longe do que deveria.
const LINHAS_MAX_JANELA_VOZ = 7;
// Quando confirma que uma linha foi cantada, mostra a de baixo (não a
// que acabou de confirmar) — o reconhecimento de voz tem uma latência
// inerente (leva um tempinho pra transcrever), então no momento em que a
// confirmação chega, quem está cantando já está uma linha à frente na
// prática. Sem essa antecipação, a tela sempre parecia mostrar a linha
// que "já passou", em vez da que precisa ser cantada agora.
const ANTECIPACAO_LINHAS_VOZ = 1;
// O Chrome, no modo "continuous", às vezes demora muito pra fechar uma
// frase como definitiva — enquanto isso, o resultado provisório vai
// crescendo (podendo acumular quase uma estrofe inteira) antes de dar um
// "isFinal". Comparar esse texto todo contra uma linha-alvo curta dilui a
// pontuação sem necessidade — por isso só as últimas palavras ouvidas
// entram na comparação (o que interessa é o que está sendo cantado
// AGORA, não o histórico da frase toda). Subido de 4 pra 6 — uma frase
// maior é evidência mais confiável e dispara o salto com menos frequência
// (o problema relatado foi "pula a cada trechinho reconhecido", ficando
// difícil de acompanhar de olho).
const PALAVRAS_RECENTES_VOZ = 6;

// Só avança por acorde quando o PRÓXIMO esperado passa desse limiar —
// testado antes como margem relativa ao atual (o próximo precisa bater
// X pontos melhor que o atual) e ficou restritivo demais quando os dois
// ficam próximos (teste real: errado ~50-55%, certo ~70-75% — só 20
// pontos de folga, a margem de 0,15 quase sempre falhava). Um limiar
// absoluto é mais direto. Baixado de 0,6 pra 0,5 depois de mais teste
// real: acorde certo às vezes só chegava a 50-55% e nunca passava de
// 60%, travando a rolagem — o efeito colateral é ficar bem em cima do
// teto do errado (~50%), então algum falso positivo ocasional é esperado
// como troca por destravar os acertos.
const LIMIAR_AVANCO_ACORDE = 0.5;
// E só depois de bater assim por esse tempo seguido — evita disparo em
// falso durante a troca de dedo/mão de um acorde pro outro.
const TEMPO_ESTAVEL_ACORDE_MS = 220;

// Escuta o microfone e acompanha, sozinho, em qual linha da cifra o
// músico está cantando agora — pra rolar a tela sem precisar de scroll
// manual nem de velocidade fixa.
//
// `modo` é "voz" (padrão) ou "acorde" — mutuamente exclusivos, nunca os
// dois ao mesmo tempo. Chegaram a rodar juntos (voz como sinal principal,
// acorde como reforço em segundo plano), mas testado na prática o
// resultado combinado ficava PIOR que qualquer um sozinho: a Web Speech
// API pede o microfone por conta própria, sem ser o mesmo stream usado
// pra analisar o acorde — duas capturas de áudio simultâneas do mesmo
// hardware disputando recurso, mesmo com a lógica achando que estava
// tudo coordenado. Mais simples e mais confiável escolher um dos dois.
//
// VOZ: compara o que está sendo cantado com a letra das próximas frases
// (janela pequena, sempre "pronta" a partir da posição atual) e segue a
// que bater. É o sinal mais confiável dos dois nos testes reais.
//
// ACORDE: compara o som captado com o acorde atual/próximo esperado da
// cifra. Precisou de bastante calibração manual e continua sendo o sinal
// mais fraco — útil principalmente quando não tem letra pra comparar
// (trecho instrumental) ou o navegador não suporta reconhecimento de voz.
//
// `blocos` é o retorno de parseChordPro().
export function useAcompanhamentoPorAcorde(blocos, { modo = "voz" } = {}) {
  const frases = useMemo(() => construirFrases(blocos), [blocos]);
  const idioma = useMemo(() => detectarIdioma(frases.map((f) => f.texto).join(" ")), [frases]);

  const [indice, setIndice] = useState(0);
  const [ouvindo, setOuvindo] = useState(false);
  const [similaridade, setSimilaridade] = useState(0);
  const [textoOuvido, setTextoOuvido] = useState("");
  const [erro, setErro] = useState(null);

  const indiceRef = useRef(0);
  const contextoRef = useRef(null);
  const analyserRef = useRef(null);
  const streamRef = useRef(null);
  const rafRef = useRef(null);
  const estavelDesdeRef = useRef(0);
  const vozRef = useRef(null);

  // Muda de música (ou a cifra foi editada) — recomeça do início
  useEffect(() => {
    indiceRef.current = 0;
    setIndice(0);
  }, [frases]);

  const mudarIndice = (novo) => {
    const limitado = Math.max(0, Math.min(novo, frases.length - 1));
    indiceRef.current = limitado;
    setIndice(limitado);
  };

  // A cada frase (parcial ou final) reconhecida, procura na janela das
  // próximas frases (e um pouco pra trás, ver RETROCESSO_LINHAS_VOZ) qual
  // texto bate melhor com o que foi ouvido.
  const avaliarVoz = (texto) => {
    // Só as últimas palavras — ver comentário de PALAVRAS_RECENTES_VOZ
    const recorte = texto.trim().split(/\s+/).filter(Boolean).slice(-PALAVRAS_RECENTES_VOZ).join(" ");

    const inicio = Math.max(0, indiceRef.current - RETROCESSO_LINHAS_VOZ);
    let fim = indiceRef.current;
    let palavrasNaJanela = 0;
    while (fim < frases.length && fim - indiceRef.current < LINHAS_MAX_JANELA_VOZ) {
      palavrasNaJanela += frases[fim].texto.split(/\s+/).filter(Boolean).length;
      fim++;
      if (palavrasNaJanela >= PALAVRAS_JANELA_VOZ) break;
    }
    let melhorIndice = -1;
    let melhorPontuacao = LIMIAR_VOZ;

    for (let i = inicio; i < fim; i++) {
      const pontuacao = pontuarSemelhancaTexto(recorte, frases[i].contextoTexto);
      if (pontuacao > melhorPontuacao) {
        melhorPontuacao = pontuacao;
        melhorIndice = i;
      }
    }

    // Pula pra qualquer match que bater o suficiente — pra frente (o
    // normal) ou pra trás dentro da margem de RETROCESSO_LINHAS_VOZ (se
    // uma detecção anterior avançou longe demais, isso se autocorrige).
    // Sempre com ANTECIPACAO_LINHAS_VOZ à frente do que foi confirmado
    // (ver comentário da constante).
    if (melhorIndice !== -1) {
      mudarIndice(melhorIndice + ANTECIPACAO_LINHAS_VOZ);
    }
  };

  const lacoAcorde = () => {
    const analyser = analyserRef.current;
    const ctx = contextoRef.current;
    if (!analyser || !ctx) return;

    const chroma = extrairChroma(analyser, ctx.sampleRate);
    const atual = frases[indiceRef.current];
    const proximoIndice = proximaFraseComAcordeDiferente(frases, indiceRef.current);
    const proxima = proximoIndice !== -1 ? frases[proximoIndice] : null;
    const simAtual = similaridadeChroma(chroma, gerarTemplateAcorde(atual?.chord));
    const simProxima = proxima ? similaridadeChroma(chroma, gerarTemplateAcorde(proxima.chord)) : -1;
    setSimilaridade(simAtual);

    const passouDoLimiar = simProxima > LIMIAR_AVANCO_ACORDE;
    const agora = performance.now();
    if (passouDoLimiar) {
      if (!estavelDesdeRef.current) estavelDesdeRef.current = agora;
      if (agora - estavelDesdeRef.current > TEMPO_ESTAVEL_ACORDE_MS) {
        mudarIndice(proximoIndice);
        estavelDesdeRef.current = 0;
      }
    } else {
      estavelDesdeRef.current = 0;
    }

    rafRef.current = requestAnimationFrame(lacoAcorde);
  };

  const iniciar = async () => {
    if (frases.length === 0) {
      setErro("Essa cifra não tem letra pra acompanhar.");
      return;
    }
    if (modo === "voz" && !reconhecimentoDeVozSuportado) {
      setErro("Esse navegador não suporta reconhecimento de voz.");
      return;
    }

    try {
      setErro(null);

      if (modo === "acorde") {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
        });
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const fonte = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        // 8192 (em vez de 4096) dá bins mais finos nos graves — importante
        // pra mirar certo nas frequências do violão (E2 a ~82Hz), que com
        // menos resolução caem num bin muito largo. Mesmo valor que o
        // Chromagram do Adam Stark usa por padrão (chord_detector).
        analyser.fftSize = 8192;
        // O ReChord (belovm96/chord-detection) usa um CRF por cima da rede
        // neural pra suavizar a sequência de acordes prevista em vez de
        // confiar em cada frame isolado — pesado demais pra replicar aqui
        // (precisa de treino, GPU), mas o princípio (não decidir em cima
        // de um instante só) dá pra pegar de graça: o próprio AnalyserNode
        // já faz média móvel entre frames antes de a gente nem ler o
        // espectro. Subi de 0,4 pra 0,6 pra amortecer melhor o ataque da
        // palhetada (ruído de banda larga que dura só uma fração de
        // segundo) sem deixar a resposta lenta demais.
        analyser.smoothingTimeConstant = 0.6;
        fonte.connect(analyser);

        streamRef.current = stream;
        contextoRef.current = ctx;
        analyserRef.current = analyser;
        rafRef.current = requestAnimationFrame(lacoAcorde);
      } else {
        vozRef.current = criarReconhecedorDeVoz({
          idioma,
          onTexto: (texto) => {
            setTextoOuvido(texto);
            avaliarVoz(texto);
          },
          onErro: (codigo) => console.warn("Reconhecimento de voz:", codigo),
        });
        vozRef.current?.iniciar();
      }

      setOuvindo(true);
    } catch {
      setErro("Não deu pra acessar o microfone — verifique a permissão do navegador.");
    }
  };

  const parar = () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    contextoRef.current?.close();
    contextoRef.current = null;
    analyserRef.current = null;
    vozRef.current?.parar();
    vozRef.current = null;
    setTextoOuvido("");
    setOuvindo(false);
  };

  // Solta o microfone (e a escuta de voz) se o usuário sair da tela sem
  // clicar em "Parar"
  useEffect(() => () => parar(), []);

  return {
    frases,
    indice,
    fraseAtual: frases[indice] ?? null,
    ouvindo,
    similaridade,
    textoOuvido,
    idioma,
    vozSuportada: reconhecimentoDeVozSuportado,
    erro,
    iniciar,
    parar,
    avancarManual: () => mudarIndice(indiceRef.current + 1),
    voltarManual: () => mudarIndice(indiceRef.current - 1),
  };
}
