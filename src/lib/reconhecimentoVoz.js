// Reconhecimento de voz (Web Speech API — nativa do navegador, gratuita,
// mas só Chrome/Edge/Safari recente têm suporte decente; Firefox não
// implementa) pra resolver o que a detecção de acorde sozinha não
// consegue: quando o mesmo acorde se repete em vários versos, o áudio não
// sabe dizer em qual repetição o músico está — todos soam igual. A voz
// (o que está sendo cantado) dá essa posição; o acorde continua sendo
// usado pra saber o momento exato de trocar de linha dentro do trecho.

import { normalizarNome } from "./texto";

// Distância de edição (Levenshtein) entre duas strings já normalizadas —
// usada só pra tolerar quase-acertos (uma letra trocada, plural/singular,
// conjugação um pouco diferente do que a letra da música tem escrito),
// não pra achar a palavra "mais parecida" em geral.
function distanciaEdicao(a, b) {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;

  const linha = new Array(n + 1);
  for (let j = 0; j <= n; j++) linha[j] = j;

  for (let i = 1; i <= m; i++) {
    let anterior = linha[0];
    linha[0] = i;
    for (let j = 1; j <= n; j++) {
      const temp = linha[j];
      linha[j] = a[i - 1] === b[j - 1] ? anterior : 1 + Math.min(anterior, linha[j], linha[j - 1]);
      anterior = temp;
    }
  }
  return linha[n];
}

// Duas palavras "batem" se forem iguais ou bem parecidas — tolerância
// proporcional ao tamanho da palavra (uma letra errada numa palavra curta
// já é bastante folga; numa palavra longa, um pouco mais). Sem isso, a
// comparação ficava "ao pé da letra": bastava a voz reconhecer uma
// palavra um pouco diferente (plural, gíria, ruído) pra ela nunca contar
// como acerto, mesmo claramente sendo a mesma palavra cantada.
//
// Palavra com menos de 4 letras exige igualdade exata — abaixo disso a
// tolerância vira armadilha: "de" e "me" ficam a 1 letra de distância uma
// da outra, então QUALQUER palavra curta batia com QUALQUER outra palavra
// curta do texto alvo, causando saltos pra linha errada só por causa de
// preposições/artigos em comum ("hoje", "de", "me"...).
function palavrasParecidas(a, b) {
  if (a === b) return true;
  if (a.length < 4 || b.length < 4) return false;
  const tolerancia = Math.max(1, Math.floor(Math.max(a.length, b.length) * 0.3));
  return distanciaEdicao(a, b) <= tolerancia;
}

// Compara um trecho reconhecido por voz com o texto esperado de uma linha
// da cifra — cada palavra ouvida procura a palavra mais parecida ainda
// disponível no alvo (cada uma do alvo só conta uma vez, pra não inflar a
// pontuação com repetições).
export function pontuarSemelhancaTexto(reconhecido, alvo) {
  const palavrasOuvidas = normalizarNome(reconhecido).split(" ").filter(Boolean);
  if (palavrasOuvidas.length === 0) return 0;

  const disponiveis = normalizarNome(alvo).split(" ").filter(Boolean);
  let acertos = 0;
  for (const palavra of palavrasOuvidas) {
    const i = disponiveis.findIndex((candidata) => palavrasParecidas(palavra, candidata));
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
// tiver chamado `parar()`. `idioma` é o código BCP 47 (ex.: "pt-BR",
// "en-US", "es-ES") — normalmente vem de detectarIdioma(), aplicado na
// letra da própria música.
export function criarReconhecedorDeVoz({ idioma = "pt-BR", onTexto, onErro }) {
  if (!SpeechRecognitionAPI) return null;

  const reconhecimento = new SpeechRecognitionAPI();
  reconhecimento.lang = idioma;
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
