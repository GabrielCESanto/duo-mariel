import { useEffect, useMemo, useRef, useState } from "react";
import {
  construirPassagensDeAcorde,
  extrairChroma,
  gerarTemplateAcorde,
  similaridadeChroma,
} from "../lib/chordDetect";

// Só avança quando o próximo acorde bate MELHOR que o atual por essa
// margem — evita trocar de linha por causa de ruído/harmônico parecido.
const MARGEM_AVANCO = 0.12;
// E só depois de bater assim por esse tempo seguido — evita disparo em
// falso durante a troca de dedo/mão de um acorde pro outro.
const TEMPO_ESTAVEL_MS = 220;
// Abaixo disso, a semelhança é baixa demais pra confiar (silêncio, corda
// solta, ruído) — mesmo que seja "a melhor opção entre as duas".
const SIMILARIDADE_MINIMA = 0.5;

// Escuta o microfone e acompanha, sozinho, em qual acorde da cifra o
// músico está tocando agora — pra rolar a tela sem precisar de scroll
// manual nem de velocidade fixa. `blocos` é o retorno de parseChordPro().
export function useAcompanhamentoPorAcorde(blocos) {
  const passagens = useMemo(() => construirPassagensDeAcorde(blocos), [blocos]);

  const [indice, setIndice] = useState(0);
  const [ouvindo, setOuvindo] = useState(false);
  const [similaridade, setSimilaridade] = useState(0);
  const [erro, setErro] = useState(null);

  const indiceRef = useRef(0);
  const contextoRef = useRef(null);
  const analyserRef = useRef(null);
  const streamRef = useRef(null);
  const rafRef = useRef(null);
  const estavelDesdeRef = useRef(0);

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
    setOuvindo(false);
  };

  // Solta o microfone se o usuário sair da tela sem clicar em "Parar"
  useEffect(() => () => parar(), []);

  return {
    passagens,
    indice,
    passagemAtual: passagens[indice] ?? null,
    ouvindo,
    similaridade,
    erro,
    iniciar,
    parar,
    avancarManual: () => mudarIndice(indiceRef.current + 1),
    voltarManual: () => mudarIndice(indiceRef.current - 1),
  };
}
