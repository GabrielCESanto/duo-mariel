// Reconhecimento de voz (Web Speech API — nativa do navegador, gratuita,
// mas só Chrome/Edge/Safari recente têm suporte decente; Firefox não
// implementa) pra resolver o que a detecção de acorde sozinha não
// consegue: quando o mesmo acorde se repete em vários versos, o áudio não
// sabe dizer em qual repetição o músico está — todos soam igual. A voz
// (o que está sendo cantado) dá essa posição; o acorde continua sendo
// usado pra saber o momento exato de trocar de linha dentro do trecho.

import { normalizarNome } from "./texto";

// Compara um trecho reconhecido por voz com o texto esperado de uma linha
// da cifra. Não usa nenhuma lib de fuzzy-match — só conta quantas das
// palavras ouvidas aparecem no trecho alvo (cada palavra do alvo só conta
// uma vez, pra não inflar a pontuação com repetições). Simples, mas
// suficiente aqui: frases curtas, vocabulário já conhecido de antemão pela
// letra da própria música.
export function pontuarSemelhancaTexto(reconhecido, alvo) {
  const palavrasOuvidas = normalizarNome(reconhecido).split(" ").filter(Boolean);
  if (palavrasOuvidas.length === 0) return 0;

  const disponiveis = normalizarNome(alvo).split(" ").filter(Boolean);
  let acertos = 0;
  for (const palavra of palavrasOuvidas) {
    const i = disponiveis.indexOf(palavra);
    if (i !== -1) {
      acertos++;
      disponiveis.splice(i, 1);
    }
  }
  return acertos / palavrasOuvidas.length;
}

const SpeechRecognitionAPI =
  typeof window !== "undefined" ? window.SpeechRecognition || window.webkitSpeechRecognition : null;

export const reconhecimentoDeVozSuportado = Boolean(SpeechRecognitionAPI);

// Envelope fino sobre a Web Speech API. Reinicia sozinho quando o
// navegador para de escutar por silêncio (comum no modo "continuous" do
// Chrome, que não é de fato contínuo o tempo todo), enquanto ninguém
// tiver chamado `parar()`.
export function criarReconhecedorDeVoz({ onTexto, onErro }) {
  if (!SpeechRecognitionAPI) return null;

  const reconhecimento = new SpeechRecognitionAPI();
  reconhecimento.lang = "pt-BR";
  reconhecimento.continuous = true;
  reconhecimento.interimResults = true;

  let deveEscutar = false;

  reconhecimento.onresult = (evento) => {
    let texto = "";
    for (let i = evento.resultIndex; i < evento.results.length; i++) {
      texto += evento.results[i][0].transcript;
    }
    onTexto(texto);
  };

  reconhecimento.onerror = (evento) => {
    // "no-speech" é só silêncio (comum entre versos) — não é erro de
    // verdade, e o onend já cuida de reiniciar a escuta sozinho.
    if (evento.error !== "no-speech") onErro?.(evento.error);
  };

  reconhecimento.onend = () => {
    if (!deveEscutar) return;
    try {
      reconhecimento.start();
    } catch {
      // já estava rodando (corrida entre onend e um start manual) — ignora
    }
  };

  return {
    iniciar: () => {
      deveEscutar = true;
      reconhecimento.start();
    },
    parar: () => {
      deveEscutar = false;
      reconhecimento.stop();
    },
  };
}
