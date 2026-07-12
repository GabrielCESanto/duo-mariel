import { useState } from "react";
import { INSTAGRAM_URL, WHATSAPP_CONTATOS } from "../config";

const linkClass =
  "p-3 rounded-xl border border-noir-700 text-gold-300 hover:border-gold-500 hover:text-gold-200 transition";

export default function SocialLinks() {
  const [whatsAberto, setWhatsAberto] = useState(false);

  return (
    <>
      <div className="flex gap-3 justify-center">
        <a
          href={INSTAGRAM_URL}
          target="_blank"
          rel="noreferrer"
          aria-label="Instagram"
          className={linkClass}
        >
          <svg viewBox="0 0 24 24" className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="1.6">
            <rect x="3" y="3" width="18" height="18" rx="5" />
            <circle cx="12" cy="12" r="4" />
            <circle cx="17.2" cy="6.8" r="0.9" fill="currentColor" stroke="none" />
          </svg>
        </a>

        <button
          onClick={() => setWhatsAberto(true)}
          aria-label="WhatsApp"
          className={linkClass}
        >
          <WhatsIcon className="w-6 h-6" />
        </button>
      </div>

      {whatsAberto && (
        <div
          className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center z-50 p-4"
          onClick={() => setWhatsAberto(false)}
        >
          <div
            className="w-full max-w-xs rounded-2xl border border-noir-700 bg-noir-900 p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4 mb-5">
              <h3 className="section-title text-base">Falar com quem?</h3>
              <button
                onClick={() => setWhatsAberto(false)}
                aria-label="Fechar"
                className="text-cream-muted hover:text-cream text-lg leading-none"
              >
                ✕
              </button>
            </div>

            <div className="flex flex-col gap-3">
              {WHATSAPP_CONTATOS.map((c) => (
                <a
                  key={c.numero}
                  href={`https://wa.me/${c.numero}`}
                  target="_blank"
                  rel="noreferrer"
                  onClick={() => setWhatsAberto(false)}
                  className="flex items-center justify-center gap-2 btn-gold px-5 py-3 rounded-xl text-sm"
                >
                  <WhatsIcon className="w-4 h-4" />
                  Falar com {c.nome === "Mari" ? "a" : "o"} {c.nome}
                </a>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function WhatsIcon({ className }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor">
      <path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5.1-1.3A10 10 0 1 0 12 2Zm0 18.2c-1.5 0-3-.4-4.3-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2Zm4.6-6.1c-.3-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1-.2.3-.6.8-.8 1-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.4-3c-.3-.4 0-.5.1-.7l.4-.5c.1-.2.1-.3 0-.5l-.8-1.9c-.2-.5-.4-.4-.6-.4h-.5c-.2 0-.5.1-.7.3-.2.3-.9.9-.9 2.2s.9 2.5 1 2.7c.1.2 1.8 2.8 4.4 3.9.6.3 1.1.4 1.5.5.6.2 1.2.2 1.6.1.5-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.1-1.2 0-.1-.2-.2-.4-.3Z" />
    </svg>
  );
}
