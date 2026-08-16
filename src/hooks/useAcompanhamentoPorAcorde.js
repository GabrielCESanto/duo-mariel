import { useEffect, useMemo, useRef, useState } from "react";
import {
  construirPassagensDeAcorde,
  extrairChroma,
  gerarTemplateAcorde,
  similaridadeChroma,
} from "../lib/chordDetect";
import {
  criarReconhecedorDeVoz,
  pontuarSemelhancaTexto,
  reconhecimentoDeVozSuportado,
} from "../lib/reconhecimentoVoz";

// Só avança quando o próximo acorde bate MELHOR que o atual por essa
// margem — evita trocar de linha por causa de ruído/harmônico parecido.
const MARGEM_AVANCO = 0.1;
// E só depois de bater assim por esse tempo seguido — evita disparo em
// falso durante a troca de dedo/mão de um acorde pro outro.
const TEMPO_ESTAVEL_MS = 220;
// Abaixo disso, a semelhança é baixa demais pra confiar (silêncio, corda
// solta, ruído). Calibrado com teste real: comparar áudio de instrumento
// contra um "molde" puro de acorde raramente passa de ~40-50% mesmo
// acertando (o molde é um sinal idealizado, o instrumento tem harmônicos
// que o molde não prevê) — nos testes, acorde certo ficou em 35-40%,
// errado em ~15%. 0,5 como mínimo travava a rolagem inteira, mesmo
// acertando o acorde; 0,25 fica confortavelmente entre os dois patamares
// observados.
const SIMILARIDADE_MINIMA = 0.25;

// Só pula pra frente por causa da voz quando a frase batida tiver pelo
// menos essa fração das palavras ouvidas reconhecidas na linha alvo.
const LIMIAR_VOZ = 0.5;
// Até quantas passagens à frente da atual a voz pode procurar — limita
// tanto o custo (comparar contra a cifra inteira a cada frase ouvida)
// quanto o risco de uma frase parecida lá na frente disparar um salto
// longe demais por coincidência.
const LOOKAHEAD_VOZ = 25;

// Escuta o microfone e acompanha, sozinho, em qual ponto da cifra o
// músico está tocando/cantando agora — pra rolar a tela sem precisar de
// scroll manual nem de velocidade fixa. Combina dois sinais:
// - Acorde (sempre ativo): compara o som com o acorde atual/próximo
//   esperado — ótimo pra saber O QUANDO trocar de linha.
// - Voz (opcional, se o navegador suportar): compara o que está sendo
//   cantado com a letra de cada trecho — resolve O ONDE, em especial
//   quando o mesmo acorde se repete em vários versos (aí o áudio sozinho
//   não sabe dizer em qual repetição você está).
// `blocos` é o retorno de parseChordPro().
export function useAcompanhamentoPorAcorde(blocos, { usarVoz = true } = {}) {
  const passagens = useMemo(() => construirPassagensDeAcorde(blocos), [blocos]);

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
  }, [passagens]);

  const mudarIndice = (novo) => {
    const limitado = Math.max(0, Math.min(novo, passagens.length - 1));
    indiceRef.current = limitado;
    setIndice(limitado);
  };

  const laco = () => {
    const analyser = analyserRef.current;
    const ctx = contextoRef.current;
    if (!analyser || !ctx) return;

    const chroma = extrairChroma(analyser, ctx.sampleRate);
    const atual = passagens[indiceRef.current];
    const proxima = passagens[indiceRef.current + 1];
    const simAtual = similaridadeChroma(chroma, gerarTemplateAcorde(atual?.chord));
    const simProxima = proxima ? similaridadeChroma(chroma, gerarTemplateAcorde(proxima.chord)) : -1;
    setSimilaridade(simAtual);

    const bateMelhorQueAtual = simProxima > simAtual + MARGEM_AVANCO && simProxima > SIMILARIDADE_MINIMA;
    const agora = performance.now();
    if (bateMelhorQueAtual) {
      if (!estavelDesdeRef.current) estavelDesdeRef.current = agora;
      if (agora - estavelDesdeRef.current > TEMPO_ESTAVEL_MS) {
        mudarIndice(indiceRef.current + 1);
        estavelDesdeRef.current = 0;
      }
    } else {
      estavelDesdeRef.current = 0;
    }

    rafRef.current = requestAnimationFrame(laco);
  };

  // A cada frase (parcial ou final) reconhecida, procura à frente da
  // posição atual qual passagem tem a letra mais parecida com o que foi
  // ouvido. Só pula pra frente (nunca volta) — uma palavra mal reconhecida
  // batendo por acaso com um trecho anterior não deve fazer a tela voltar.
  const avaliarVoz = (texto) => {
    const inicio = indiceRef.current;
    const fim = Math.min(passagens.length, inicio + LOOKAHEAD_VOZ);
    let melhorIndice = -1;
    let melhorPontuacao = LIMIAR_VOZ;

    for (let i = inicio; i < fim; i++) {
      const pontuacao = pontuarSemelhancaTexto(texto, passagens[i].letra);
      if (pontuacao > melhorPontuacao) {
        melhorPontuacao = pontuacao;
        melhorIndice = i;
      }
    }

    if (melhorIndice > indiceRef.current) mudarIndice(melhorIndice);
  };

  const iniciar = async () => {
    if (passagens.length === 0) {
      setErro("Essa cifra não tem acordes marcados pra acompanhar.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      });
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const fonte = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 4096;
      analyser.smoothingTimeConstant = 0.4;
      fonte.connect(analyser);

      streamRef.current = stream;
      contextoRef.current = ctx;
      analyserRef.current = analyser;
      setErro(null);
      setOuvindo(true);
      rafRef.current = requestAnimationFrame(laco);

      if (usarVoz && reconhecimentoDeVozSuportado) {
        vozRef.current = criarReconhecedorDeVoz({
          onTexto: (texto) => {
            setTextoOuvido(texto);
            avaliarVoz(texto);
          },
          onErro: (codigo) => console.warn("Reconhecimento de voz:", codigo),
        });
        vozRef.current?.iniciar();
      }
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
    passagens,
    indice,
    passagemAtual: passagens[indice] ?? null,
    ouvindo,
    similaridade,
    textoOuvido,
    vozSuportada: reconhecimentoDeVozSuportado,
    erro,
    iniciar,
    parar,
    avancarManual: () => mudarIndice(indiceRef.current + 1),
    voltarManual: () => mudarIndice(indiceRef.current - 1),
  };
}
