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
const PALAVRAS_JANELA_VOZ = 30;
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
// AGORA, não o histórico da frase toda).
const PALAVRAS_RECENTES_VOZ = 4;

// Só avança por acorde quando o PRÓXIMO esperado passa desse limiar —
// testado antes como margem relativa ao atual (o próximo precisa bater
// X pontos melhor que o atual) e ficou restritivo demais quando os dois
// ficam próximos (teste real: errado ~50-55%, certo ~70-75% — só 20
// pontos de folga, a margem de 0,15 quase sempre falhava). Um limiar
// absoluto é mais direto: passou de 60%, é o próximo acorde de verdade.
const LIMIAR_AVANCO_ACORDE = 0.6;
// E só depois de bater assim por esse tempo seguido — evita disparo em
// falso durante a troca de dedo/mão de um acorde pro outro.
const TEMPO_ESTAVEL_ACORDE_MS = 220;
// Enquanto a voz estiver ativa e tiver ouvido algo há pouco tempo, o
// acorde não deve tentar avançar sozinho — testado com os dois ligados
// juntos e, tocando o ritmo (não uma nota sustentada), o acorde errava
// mais e "brigava" com a posição que a voz já tinha acertado. O acorde só
// assume de novo depois de um tempo sem voz nenhuma (silêncio real, ex.:
// trecho instrumental).
const SILENCIO_VOZ_PARA_ACORDE_MS = 2000;

// Escuta o microfone e acompanha, sozinho, em qual linha da cifra o
// músico está cantando agora — pra rolar a tela sem precisar de scroll
// manual nem de velocidade fixa.
//
// O sinal principal é a VOZ: compara o que está sendo cantado com a letra
// das próximas frases (janela pequena, sempre "pronta" a partir da
// posição atual) e segue a que bater. É mais direto que tentar reconhecer
// o acorde tocado — decidir "qual das próximas linhas é essa" a partir do
// que foi dito é mais barato e mais confiável do que casar o timbre real
// de um instrumento contra um molde matemático de acorde.
//
// O ACORDE (opcional, `usarAcorde`) fica como reforço: útil só quando não
// tem letra pra comparar (trecho instrumental) ou o navegador não suporta
// reconhecimento de voz — mas nos testes reais precisou de calibração
// manual e ainda assim é o sinal mais fraco dos dois, por isso começa
// desligado.
//
// `blocos` é o retorno de parseChordPro().
export function useAcompanhamentoPorAcorde(blocos, { usarVoz = true, usarAcorde = false } = {}) {
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
  const ultimaVozEmRef = useRef(0);

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
  // próximas frases qual texto bate melhor com o que foi ouvido. Só pula
  // pra frente (nunca volta) — uma palavra mal reconhecida batendo por
  // acaso com um trecho anterior não deve fazer a tela voltar.
  const avaliarVoz = (texto) => {
    ultimaVozEmRef.current = performance.now();

    // Só as últimas palavras — ver comentário de PALAVRAS_RECENTES_VOZ
    const recorte = texto.trim().split(/\s+/).filter(Boolean).slice(-PALAVRAS_RECENTES_VOZ).join(" ");

    const inicio = indiceRef.current;
    let fim = inicio;
    let palavrasNaJanela = 0;
    while (fim < frases.length && fim - inicio < LINHAS_MAX_JANELA_VOZ) {
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

    // Só conta como progresso de verdade se o match achado for além da
    // posição atual — aí sim pula, mas pra ANTECIPACAO_LINHAS_VOZ à frente
    // do que foi confirmado (ver comentário da constante)
    if (melhorIndice > indiceRef.current) {
      mudarIndice(melhorIndice + ANTECIPACAO_LINHAS_VOZ);
    }
  };

  const lacoAcorde = () => {
    const analyser = analyserRef.current;
    const ctx = contextoRef.current;
    if (!analyser || !ctx) return;

    // A voz tem prioridade: se ela estiver ativa e ouviu algo há pouco,
    // deixa o acorde de lado (ver SILENCIO_VOZ_PARA_ACORDE_MS)
    const vozAtivaAgora =
      usarVoz && reconhecimentoDeVozSuportado && performance.now() - ultimaVozEmRef.current < SILENCIO_VOZ_PARA_ACORDE_MS;
    if (vozAtivaAgora) {
      estavelDesdeRef.current = 0;
      rafRef.current = requestAnimationFrame(lacoAcorde);
      return;
    }

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
    if (!usarVoz && !usarAcorde) {
      setErro("Ative pelo menos um sinal (voz ou acorde) pra acompanhar.");
      return;
    }

    try {
      setErro(null);

      if (usarAcorde) {
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
      }

      if (usarVoz && reconhecimentoDeVozSuportado) {
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
