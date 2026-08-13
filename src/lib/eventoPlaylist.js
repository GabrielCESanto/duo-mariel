import { PEDIDO_FUNCTION_URL, anonKey, supabaseConfigured } from "./supabase";

// Playlist de evento (cliente contratante, protegida por senha) — tudo
// passa pela Edge Function "pedido" (tipo evento_*), que confere a senha
// no servidor com a service role. Sem sessão/token: cada chamada manda
// evento_id + senha de novo (guardados no navegador depois do login).
async function chamar(tipo, body) {
  if (!supabaseConfigured) throw new Error("Supabase não configurado");

  const resp = await fetch(PEDIDO_FUNCTION_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
    },
    body: JSON.stringify({ tipo, ...body }),
  });

  const dados = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(dados.error || `Erro ${resp.status}`);
  return dados;
}

export const loginEvento = (evento_id, senha) => chamar("evento_login", { evento_id, senha });

export const listarPlaylistEvento = (evento_id, senha) =>
  chamar("evento_lista", { evento_id, senha });

export const adicionarMusicaEvento = (evento_id, senha, musica) =>
  chamar("evento_add", { evento_id, senha, musica });

export const removerMusicaEvento = (evento_id, senha, id) =>
  chamar("evento_remover", { evento_id, senha, id });
