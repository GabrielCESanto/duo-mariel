// Detecta o idioma da letra pra apontar o reconhecimento de voz pro
// idioma certo (Web Speech API precisa saber de antemão — um modelo em
// pt-BR ouvindo uma letra em inglês erra muito mais do que ouvindo
// português). Não usa nenhuma lib de detecção de idioma: só conta, no
// texto já normalizado (sem acento — ver normalizarNome), quantas
// palavras batem com uma lista de palavras bem características de cada
// idioma. Simples, mas não precisa ser perfeito: só precisa acertar o
// suficiente pra escolher o modelo de reconhecimento certo.

import { normalizarNome } from "./texto";

const PALAVRAS_POR_IDIOMA = {
  "pt-BR": [
    "nao", "voce", "esta", "muito", "entao", "porque", "coracao", "pra",
    "isso", "aqui", "hoje", "assim", "quando", "onde", "nos", "ele", "ela",
    "mas", "so", "voces", "tambem", "sao", "estou", "fico", "ficou",
    "vida", "gente", "tudo", "bem", "sempre", "nunca", "quero", "saudade",
  ],
  "en-US": [
    "the", "and", "you", "your", "with", "for", "that", "this", "have",
    "just", "know", "love", "will", "are", "was", "were", "dont", "im",
    "its", "yeah", "baby", "cause", "never", "always", "heart", "time",
    "night", "want", "when", "what",
  ],
  "es-ES": [
    "el", "la", "los", "las", "que", "es", "yo", "tu", "esta", "muy",
    "pero", "para", "con", "amor", "corazon", "asi", "mas", "como",
    "cuando", "donde", "eres", "estoy", "vida", "siempre", "nunca",
    "quiero", "solo", "nada", "todo",
  ],
};

const IDIOMA_PADRAO = "pt-BR";
// Exige um mínimo de palavras DIFERENTES batendo antes de confiar na
// detecção — um refrão tipo "la la la" ou "na na na" não pode decidir o
// idioma sozinho só porque a mesma palavra curta se repete várias vezes.
const EVIDENCIA_MINIMA = 3;

export function detectarIdioma(texto) {
  const palavras = normalizarNome(texto).split(" ").filter(Boolean);
  const distintas = { "pt-BR": new Set(), "en-US": new Set(), "es-ES": new Set() };

  for (const palavra of palavras) {
    for (const [idioma, lista] of Object.entries(PALAVRAS_POR_IDIOMA)) {
      if (lista.includes(palavra)) distintas[idioma].add(palavra);
    }
  }

  const [melhorIdioma, melhorSet] = Object.entries(distintas).sort((a, b) => b[1].size - a[1].size)[0];
  return melhorSet.size >= EVIDENCIA_MINIMA ? melhorIdioma : IDIOMA_PADRAO;
}
