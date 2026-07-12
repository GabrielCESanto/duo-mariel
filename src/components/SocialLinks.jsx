import { INSTAGRAM_URL, WHATSAPP_URL } from "../config";

const linkClass =
  "p-3 rounded-xl border border-noir-700 text-gold-300 hover:border-gold-500 hover:text-gold-200 transition";

export default function SocialLinks() {
  return (
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

      <a
        href={WHATSAPP_URL}
        target="_blank"
        rel="noreferrer"
        aria-label="WhatsApp"
        className={linkClass}
      >
        <svg viewBox="0 0 24 24" className="w-6 h-6" fill="currentColor">
          <path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5.1-1.3A10 10 0 1 0 12 2Zm0 18.2c-1.5 0-3-.4-4.3-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2Zm4.6-6.1c-.3-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1-.2.3-.6.8-.8 1-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.4-3c-.3-.4 0-.5.1-.7l.4-.5c.1-.2.1-.3 0-.5l-.8-1.9c-.2-.5-.4-.4-.6-.4h-.5c-.2 0-.5.1-.7.3-.2.3-.9.9-.9 2.2s.9 2.5 1 2.7c.1.2 1.8 2.8 4.4 3.9.6.3 1.1.4 1.5.5.6.2 1.2.2 1.6.1.5-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.1-1.2 0-.1-.2-.2-.4-.3Z" />
        </svg>
      </a>
    </div>
  );
}
