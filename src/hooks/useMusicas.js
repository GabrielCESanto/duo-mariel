import { useCallback, useEffect, useState } from "react";
import { supabase, supabaseConfigured } from "../lib/supabase";
import { REPERTORIO_DEMO } from "../data/repertorioDemo";

export function useMusicas() {
  const [musicas, setMusicas] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState(null);

  const recarregar = useCallback(async () => {
    if (!supabaseConfigured) {
      setMusicas(REPERTORIO_DEMO);
      setCarregando(false);
      return;
    }

    setCarregando(true);
    const { data, error } = await supabase
      .from("musicas")
      .select("id, nome, artista, estilo")
      .order("artista", { ascending: true })
      .order("nome", { ascending: true });

    if (error) {
      console.error("Erro ao carregar repertório:", error);
      setErro(error.message);
      setMusicas([]);
    } else {
      setErro(null);
      setMusicas(data ?? []);
    }
    setCarregando(false);
  }, []);

  useEffect(() => {
    recarregar();
  }, [recarregar]);

  return { musicas, carregando, erro, recarregar };
}
