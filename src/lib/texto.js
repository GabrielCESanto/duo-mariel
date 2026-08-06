// Compara nomes (de música, artista etc.) ignorando acentos, caixa e
// pontuação — usado tanto no admin (casar pedido de texto livre com uma
// música cadastrada) quanto no site público (detectar se o que a pessoa
// procurou é uma música oculta, não uma desconhecida de verdade).
export const normalizarNome = (s) =>
  String(s ?? "")
    .toLowerCase()
    .normalize("NFD")
    // Remove os acentos (as marcas combinantes que o NFD separa das letras),
    // usando os pontos de código Unicode por extenso em vez de caracteres
    // combinantes literais no fonte — esses são invisíveis no editor e
    // quebrariam silenciosamente se alguma ferramenta reescrever o arquivo.
    .replace(new RegExp("[\\u0300-\\u036f]", "g"), "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
