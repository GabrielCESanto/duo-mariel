import { useEffect, useState } from "react";
import { supabase, supabaseConfigured } from "../lib/supabase";

const VAZIO = { musicas_ids: [], estilos: [], artistas: [] };

// O que está oculto do repertório público AGORA (perfil ativo na aba
// Ocultar do admin, se algum). A view "ocultos_ativos" já resolve a
// expiração por prazo (em dias) no próprio banco — aqui é só ler.
export function useOcultos() {
  const [ocultos, setOcultos] = useState(VAZIO);

  useEffect(() => {
    if (!supabaseConfigured) return;
    supabase
      .from("ocultos_ativos")
      .select("musicas_ids, estilos, artistas")
      .maybeSingle()
      .then(({ data, error }) => {
        if (error) {
          console.error("Erro ao carregar ocultações ativas:", error);
          return;
        }
        setOcultos(data ?? VAZIO);
      });
  }, []);

  return ocultos;
}
