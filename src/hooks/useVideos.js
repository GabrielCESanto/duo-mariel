import { useCallback, useEffect, useState } from "react";
import { supabase, supabaseConfigured } from "../lib/supabase";
import { VIDEOS } from "../config";

export function useVideos() {
  const [videos, setVideos] = useState([]);
  const [carregando, setCarregando] = useState(true);

  const recarregar = useCallback(async () => {
    if (!supabaseConfigured) {
      // Modo demonstração: usa a lista fixa do config.js
      setVideos(
        VIDEOS.map((v, i) => ({ id: `demo-${i}`, titulo: v.title, youtube_id: v.youtubeId }))
      );
      setCarregando(false);
      return;
    }

    setCarregando(true);
    const { data, error } = await supabase
      .from("videos")
      .select("id, titulo, youtube_id")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Erro ao carregar vídeos:", error);
      setVideos([]);
    } else {
      setVideos(data ?? []);
    }
    setCarregando(false);
  }, []);

  useEffect(() => {
    recarregar();
  }, [recarregar]);

  return { videos, carregando, recarregar };
}
