import { useEffect, useState } from "react";
import { supabase, supabaseConfigured } from "../lib/supabase";

const VAZIO = { musicas_ids: [], estilos: [], artistas: [] };

// O que está oculto do repertório público AGORA (perfil ativo na aba
// Ocultar do admin, se algum). A view "ocultos_ativos" já resolve a
// expiração por prazo (em dias) no próprio banco — aqui é só ler.
//
// Expõe "carregando" pra quem usa isso (useMusicas) poder esperar essa
// busca terminar antes de considerar o repertório "pronto pra mostrar" —
// sem isso, se o fetch de músicas responder antes deste, a página pública
// mostrava por um instante músicas que deveriam estar ocultas, o que vai
// contra o próprio propósito da funcionalidade (esconder uma música-
// surpresa antes de um show).
export function useOcultos() {
  const [ocultos, setOcultos] = useState(VAZIO);
  const [carregando, setCarregando] = useState(supabaseConfigured);

  useEffect(() => {
    if (!supabaseConfigured) return;
    supabase
      .from("ocultos_ativos")
      .select("musicas_ids, estilos, artistas")
      .maybeSingle()
      .then(({ data, error }) => {
        if (error) {
          console.error("Erro ao carregar ocultações ativas:", error);
        } else {
          setOcultos(data ?? VAZIO);
        }
        setCarregando(false);
      });
  }, []);

  return { ocultos, carregando };
}
