import { useCallback, useEffect, useState } from "react";
import { supabase, supabaseConfigured } from "../lib/supabase";

// Config única de gorjeta (chave pix + qrcode + liga/desliga), configurada
// pela dupla na aba Gorjeta do admin. Sem Supabase (modo demonstração) ou
// sem a linha configurada, devolve null — quem consome já trata isso como
// "gorjeta desativada".
export function useGorjeta() {
  const [gorjeta, setGorjeta] = useState(null);
  const [carregando, setCarregando] = useState(true);

  const recarregar = useCallback(async () => {
    if (!supabaseConfigured) {
      setGorjeta(null);
      setCarregando(false);
      return;
    }

    setCarregando(true);
    const { data, error } = await supabase
      .from("gorjeta")
      .select("pix_chave, pix_qrcode_path, ativo")
      .eq("id", true)
      .maybeSingle();

    if (error || !data) {
      setGorjeta(null);
    } else {
      const qrcodeUrl = data.pix_qrcode_path
        ? supabase.storage.from("gorjeta").getPublicUrl(data.pix_qrcode_path).data.publicUrl
        : null;
      setGorjeta({ ...data, qrcodeUrl });
    }
    setCarregando(false);
  }, []);

  useEffect(() => {
    recarregar();
  }, [recarregar]);

  return { gorjeta, carregando, recarregar };
}
