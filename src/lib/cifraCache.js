import { supabase } from "./supabase";

// Estado do download de cifras num módulo (não num componente): assim ele
// sobrevive à troca de aba dentro do admin (a aba Cifras desmonta/remonta a
// cada troca) — é o que permite o botão "rodar em segundo plano" funcionar
// de verdade, e não só fingir.
let estado = { baixando: false, feito: 0, total: 0, ok: 0, cancelado: false };
let controller = null;
const ouvintes = new Set();

function notificar() {
  for (const fn of ouvintes) fn(estado);
}

// Assina mudanças de estado; retorna a função de cancelar a assinatura
export function assinarDownloadCifras(fn) {
  ouvintes.add(fn);
  fn(estado);
  return () => ouvintes.delete(fn);
}

export function estadoDownloadCifras() {
  return estado;
}

export async function baixarCifrasEmCache(musicas) {
  if (estado.baixando) return; // já em andamento — não duplica

  controller = new AbortController();
  estado = { baixando: true, feito: 0, total: musicas.length, ok: 0, cancelado: false };
  notificar();

  for (const m of musicas) {
    if (estado.cancelado) break;
    try {
      const { data: pub } = supabase.storage.from("cifras").getPublicUrl(m.cifra_path);
      const resp = await fetch(pub.publicUrl, { cache: "force-cache", signal: controller.signal });
      if (resp.ok) estado = { ...estado, ok: estado.ok + 1 };
    } catch (e) {
      if (e?.name !== "AbortError") console.error(`Falha ao baixar cifra de "${m.nome}":`, e);
    }
    estado = { ...estado, feito: estado.feito + 1 };
    notificar();
  }

  estado = { ...estado, baixando: false };
  notificar();
}

export function cancelarDownloadCifras() {
  estado = { ...estado, cancelado: true };
  controller?.abort();
  notificar();
}
