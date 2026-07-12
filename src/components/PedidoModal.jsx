import { useState } from "react";
import { PEDIDO_FUNCTION_URL, anonKey, supabaseConfigured } from "../lib/supabase";

export default function PedidoModal({ pedido, onFechar }) {
  const [mensagem, setMensagem] = useState("");
  const [status, setStatus] = useState("");
  const [enviando, setEnviando] = useState(false);

  if (!pedido) return null;

  const enviar = async () => {
    if (!supabaseConfigured) {
      setStatus("⚠️ Pedidos ainda não configurados. Fale conosco pelo WhatsApp!");
      return;
    }

    try {
      setEnviando(true);
      setStatus("⏳ Enviando pedido...");

      const resp = await fetch(PEDIDO_FUNCTION_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: anonKey,
          Authorization: `Bearer ${anonKey}`,
        },
        body: JSON.stringify({
          pedido: pedido.musicaFinal,
          mensagem,
        }),
      });

      if (!resp.ok) throw new Error(await resp.text());

      setStatus("✅ Pedido enviado!");
      setTimeout(onFechar, 900);
    } catch (e) {
      console.error("Erro ao enviar pedido:", e);
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
            <h3 className="section-title text-base">Confirmar pedido</h3>
            <p className="text-cream mt-2 break-words">{pedido.musicaFinal}</p>
            {pedido.detalhe && (
              <p className="text-cream-muted text-xs mt-1">{pedido.detalhe}</p>
            )}
          </div>
          <button
            onClick={onFechar}
            aria-label="Fechar"
            className="text-cream-muted hover:text-cream text-lg leading-none"
          >
            ✕
          </button>
        </div>

        <textarea
          className="input-noir mt-4 resize-none"
          rows={3}
          placeholder="Mensagem opcional (ex.: mesa 3, aniversário, pedido de casamento...)"
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
            disabled={enviando}
          >
            Enviar pedido
          </button>
        </div>
      </div>
    </div>
  );
}
