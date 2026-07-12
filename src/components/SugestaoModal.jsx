import { useEffect, useState } from "react";
import { PEDIDO_FUNCTION_URL, anonKey, supabaseConfigured } from "../lib/supabase";

export default function SugestaoModal({ aberto, musicaInicial, onFechar }) {
  const [musica, setMusica] = useState("");
  const [artista, setArtista] = useState("");
  const [mensagem, setMensagem] = useState("");
  const [status, setStatus] = useState("");
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    if (aberto) {
      setMusica(musicaInicial || "");
      setArtista("");
      setMensagem("");
      setStatus("");
    }
  }, [aberto, musicaInicial]);

  if (!aberto) return null;

  const enviar = async () => {
    if (!musica.trim()) return;

    if (!supabaseConfigured) {
      setStatus("⚠️ Sugestões ainda não configuradas. Fale conosco pelo WhatsApp!");
      return;
    }

    try {
      setEnviando(true);
      setStatus("⏳ Enviando sugestão...");

      const resp = await fetch(PEDIDO_FUNCTION_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: anonKey,
          Authorization: `Bearer ${anonKey}`,
        },
        body: JSON.stringify({
          tipo: "aprender",
          musica: musica.trim(),
          artista: artista.trim(),
          mensagem: mensagem.trim(),
        }),
      });

      if (!resp.ok) throw new Error(await resp.text());

      setStatus("✅ Sugestão enviada! Quem sabe ela entra no repertório 🎶");
      setTimeout(onFechar, 1400);
    } catch (e) {
      console.error("Erro ao enviar sugestão:", e);
      setStatus("❌ Falha ao enviar. Tente novamente.");
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="w-full max-w-md rounded-2xl border border-noir-700 bg-noir-900 p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h3 className="section-title text-base">Sugerir para o repertório</h3>
            <p className="text-cream-muted text-xs mt-1">
              Não achou a música? Sugira e o duo pode aprender para o próximo show!
            </p>
          </div>
          <button
            onClick={onFechar}
            aria-label="Fechar"
            className="text-cream-muted hover:text-cream text-lg leading-none"
          >
            ✕
          </button>
        </div>

        <input
          className="input-noir mt-4"
          placeholder="Nome da música *"
          value={musica}
          onChange={(e) => setMusica(e.target.value)}
          maxLength={200}
        />

        <input
          className="input-noir mt-3"
          placeholder="Artista (se souber)"
          value={artista}
          onChange={(e) => setArtista(e.target.value)}
          maxLength={120}
        />

        <textarea
          className="input-noir mt-3 resize-none"
          rows={2}
          placeholder="Mensagem opcional"
          value={mensagem}
          onChange={(e) => setMensagem(e.target.value)}
          maxLength={300}
        />

        {status && <div className="mt-3 text-sm text-cream">{status}</div>}

        <div className="mt-5 flex gap-3 justify-end">
          <button
            className="px-4 py-2 rounded-xl bg-noir-800 border border-noir-700 hover:bg-noir-700 text-sm transition"
            onClick={onFechar}
          >
            Cancelar
          </button>
          <button
            className="btn-gold px-5 py-2 rounded-xl text-sm"
            onClick={enviar}
            disabled={enviando || !musica.trim()}
          >
            Enviar sugestão
          </button>
        </div>
      </div>
    </div>
  );
}
