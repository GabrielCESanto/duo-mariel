import { useState } from "react";

// Bloco de convite à gorjeta — reaproveitado tanto na última etapa do
// PedidoModal quanto no modal próprio aberto pelo botão da página
// principal. Sutil de propósito: tom itálico, sem gritar "doe", deixando
// claro que é opcional.
export function GorjetaConteudo({ gorjeta }) {
  const [copiado, setCopiado] = useState(false);

  const copiarChave = async () => {
    if (!gorjeta.pix_chave) return;
    try {
      await navigator.clipboard.writeText(gorjeta.pix_chave);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      // Clipboard indisponível (ex.: contexto sem HTTPS) — sem problema, a
      // chave já está visível na tela pra copiar manualmente
    }
  };

  return (
    <div className="text-center">
      <p className="text-cream-muted text-sm italic">
        Que tal uma gorjeta para o duo? Totalmente opcional — qualquer valor é
        muito bem-vindo 💛
      </p>

      {gorjeta.qrcodeUrl && (
        <img
          src={gorjeta.qrcodeUrl}
          alt="QR code Pix do Duo Mariel"
          className="w-40 h-40 mx-auto mt-4 rounded-xl border border-noir-700 bg-white p-2"
        />
      )}

      {gorjeta.pix_chave && (
        <button
          onClick={copiarChave}
          className="mt-3 mx-auto flex items-center gap-2 px-4 py-2 rounded-xl border border-noir-700 text-sm text-cream-muted hover:text-gold-300 hover:border-gold-600 transition"
        >
          {copiado ? "✓ Chave copiada!" : `Pix: ${gorjeta.pix_chave}`}
        </button>
      )}
    </div>
  );
}

// Modal próprio, aberto pelo botão de gorjeta da página principal (fora do
// fluxo de pedido) — mesma moldura visual dos outros modais do site.
export function GorjetaModal({ aberto, gorjeta, onFechar }) {
  if (!aberto || !gorjeta) return null;

  return (
    <div
      className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={onFechar}
    >
      <div
        className="w-full max-w-sm rounded-2xl border border-noir-700 bg-noir-900 p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <h3 className="section-title text-base">Gorjeta para o duo</h3>
          <button
            onClick={onFechar}
            aria-label="Fechar"
            className="text-cream-muted hover:text-cream text-lg leading-none"
          >
            ✕
          </button>
        </div>

        <div className="mt-4">
          <GorjetaConteudo gorjeta={gorjeta} />
        </div>
      </div>
    </div>
  );
}
