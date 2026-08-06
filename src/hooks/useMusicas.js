import { useCallback, useEffect, useState } from "react";
import { supabase, supabaseConfigured } from "../lib/supabase";
import { REPERTORIO_DEMO } from "../data/repertorioDemo";
import { useOcultos } from "./useOcultos";

export function useMusicas() {
  const [todas, setTodas] = useState([]);
  const [carregandoMusicas, setCarregandoMusicas] = useState(true);
  const [erro, setErro] = useState(null);
  const { ocultos, carregando: carregandoOcultos } = useOcultos();

  const recarregar = useCallback(async () => {
    if (!supabaseConfigured) {
      setTodas(REPERTORIO_DEMO);
      setCarregandoMusicas(false);
      return;
    }

    setCarregandoMusicas(true);
    const { data, error } = await supabase
      .from("musicas")
      .select("id, nome, artista, estilo")
      .order("nome", { ascending: true })
      .order("artista", { ascending: true });

    if (error) {
      console.error("Erro ao carregar repertório:", error);
      setErro(error.message);
      setTodas([]);
    } else {
      setErro(null);
      setTodas(data ?? []);
    }
    setCarregandoMusicas(false);
  }, []);

  useEffect(() => {
    recarregar();
  }, [recarregar]);

  // Filtra o que estiver oculto agora (perfil ativo na aba Ocultar do
  // admin) — em memória, não no banco: o hook já busca o repertório
  // inteiro, e o conjunto oculto muda com pouca frequência (só quando a
  // dupla ativa/desativa um perfil antes de um show)
  const idsOcultos = new Set(ocultos.musicas_ids);
  const estilosOcultos = new Set(ocultos.estilos);
  const artistasOcultos = new Set(ocultos.artistas);
  const estaOculta = (m) =>
    idsOcultos.has(m.id) || estilosOcultos.has(m.estilo) || artistasOcultos.has(m.artista);

  const musicas = todas.filter((m) => !estaOculta(m));
  // Exposto pra SugestaoModal reconhecer quando alguém "sugere" uma música
  // que na verdade já é nossa, só está oculta no momento
  const musicasOcultas = todas.filter(estaOculta);

  // Só considera "pronto" quando os dois fetches terminam — sem isso, se o
  // repertório respondesse antes das ocultações ativas, a lista pública
  // mostrava por um instante uma música que deveria estar escondida
  const carregando = carregandoMusicas || carregandoOcultos;

  return { musicas, musicasOcultas, carregando, erro, recarregar };
}
