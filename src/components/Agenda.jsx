import { useEffect, useRef, useState } from "react";
import { supabase, supabaseConfigured } from "../lib/supabase";

const MESES_ABREV = [
  "Jan", "Fev", "Mar", "Abr", "Mai", "Jun",
  "Jul", "Ago", "Set", "Out", "Nov", "Dez",
];

const INTERVALO_AUTOPLAY = 5000;

const EVENTOS_DEMO = [
  {
    id: "demo-1",
    titulo: "Show acústico",
    subtitulo: "Bossa & MPB ao vivo",
    local: "Café Demonstração",
    data: dataDaqui(5),
    hora: "20:00:00",
    observacao: null,
  },
  {
    id: "demo-2",
    titulo: "Casamento (fechado)",
    subtitulo: "Cerimônia + festa",
    local: "Espaço Exemplo",
    data: dataDaqui(12),
    hora: "18:30:00",
    observacao: "Evento privado",
  },
];

function dataDaqui(dias) {
  const d = new Date();
  d.setDate(d.getDate() + dias);
  return d.toISOString().slice(0, 10);
}

// Evita deslocamento de fuso ao converter "YYYY-MM-DD" para Date
function dataLocal(iso) {
  const [ano, mes, dia] = iso.split("-").map(Number);
  return new Date(ano, mes - 1, dia);
}

function formatarHora(hora) {
  if (!hora) return null;
  return hora.slice(0, 5).replace(":", "h");
}

export default function Agenda() {
  const [proximos, setProximos] = useState([]);
  const [realizados, setRealizados] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [verRealizados, setVerRealizados] = useState(false);

  useEffect(() => {
    if (!supabaseConfigured) {
      setProximos(EVENTOS_DEMO);
      setCarregando(false);
      return;
    }
    const hoje = dataDaqui(0);
    Promise.all([
      supabase
        .from("eventos")
        .select("id, titulo, subtitulo, local, data, hora, observacao")
        .gte("data", hoje)
        .order("data")
        .order("hora"),
      // Mostra os shows já realizados também — dá pra quem visita ver que o
      // duo realmente toca por aí, não só os próximos compromissos
      supabase
        .from("eventos")
        .select("id, titulo, subtitulo, local, data, hora, observacao")
        .lt("data", hoje)
        .order("data", { ascending: false })
        .order("hora", { ascending: false })
        .limit(5),
    ]).then(([{ data: prox, error: e1 }, { data: real, error: e2 }]) => {
      if (!e1) setProximos(prox ?? []);
      if (!e2) setRealizados(real ?? []);
      setCarregando(false);
    });
  }, []);

  // Sem show nenhum (nem futuro, nem passado), a seção não aparece
  if (!carregando && proximos.length === 0 && realizados.length === 0) return null;

  const mostrarToggle = realizados.length > 0;
  const eventosProximos = proximos.slice(0, 8);
  const eventosRealizados = realizados.slice(0, 5);

  return (
    <section className="border border-noir-700 rounded-2xl p-6 mt-10 bg-noir-900/50">
      <div className="flex items-center justify-between gap-4 mb-5 flex-wrap">
        <h2 className="section-title text-lg">Agenda de shows</h2>
        {mostrarToggle && (
          <div className="flex gap-2">
            <button
              onClick={() => setVerRealizados(false)}
              className={`px-3 py-1.5 rounded-full text-xs tracking-wide transition border ${
                !verRealizados
                  ? "btn-gold border-transparent"
                  : "border-noir-700 text-cream-muted hover:text-cream"
              }`}
            >
              Próximos
            </button>
            <button
              onClick={() => setVerRealizados(true)}
              className={`px-3 py-1.5 rounded-full text-xs tracking-wide transition border ${
                verRealizados
                  ? "btn-gold border-transparent"
                  : "border-noir-700 text-cream-muted hover:text-cream"
              }`}
            >
              Já tocamos
            </button>
          </div>
        )}
      </div>

      {carregando ? (
        <p className="text-cream-muted text-sm py-4">Carregando agenda...</p>
      ) : verRealizados ? (
        eventosRealizados.length === 0 ? (
          <p className="text-cream-muted text-sm py-4">Nenhum show realizado ainda.</p>
        ) : (
          <ListaRealizados eventos={eventosRealizados} />
        )
      ) : eventosProximos.length === 0 ? (
        <p className="text-cream-muted text-sm py-4">Nenhum show marcado no momento.</p>
      ) : (
        <Carrossel eventos={eventosProximos} />
      )}
    </section>
  );
}

/* ------------------------- LISTA (JÁ TOCAMOS) ------------------------- */

function ListaRealizados({ eventos }) {
  return (
    <ul className="divide-y divide-noir-800">
      {eventos.map((ev) => {
        const d = dataLocal(ev.data);
        return (
          <li key={ev.id} className="py-3 flex items-center gap-4">
            <div className="shrink-0 w-14 text-center rounded-xl border border-noir-800 py-1.5">
              <p className="text-lg leading-none font-display text-cream-muted">{d.getDate()}</p>
              <p className="text-cream-muted text-[10px] uppercase tracking-wider mt-0.5">
                {MESES_ABREV[d.getMonth()]}/{String(d.getFullYear()).slice(2)}
              </p>
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-cream-muted">{ev.titulo}</p>
              {ev.subtitulo && (
                <p className="text-cream-muted/70 text-xs truncate italic">{ev.subtitulo}</p>
              )}
              <p className="text-cream-muted text-sm truncate">
                {[ev.local, formatarHora(ev.hora)].filter(Boolean).join(" • ")}
              </p>
              {ev.observacao && (
                <p className="text-cream-muted/70 text-xs truncate">{ev.observacao}</p>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/* ------------------------- CARROSSEL (PRÓXIMOS) ------------------------- */

// Sempre 3 clones de cada lado (mais do que o suficiente pra cobrir até 3
// cards visíveis ao mesmo tempo) — índices "por fora" da lista real usam
// módulo, então mesmo com poucos shows cadastrados o clone continua válido
// (só repete algum show, o que é esperado num carrossel em loop).
const CLONES = 3;
const itemCiclo = (eventos, i) => eventos[((i % eventos.length) + eventos.length) % eventos.length];

// Quantos cards cabem lado a lado, de acordo com a largura da tela —
// recalcula sozinho ao redimensionar a janela
function useCardsVisiveis() {
  const calcular = () => {
    if (typeof window === "undefined") return 1;
    if (window.innerWidth >= 768) return 3;
    if (window.innerWidth >= 640) return 2;
    return 1;
  };
  const [cardsVisiveis, setCardsVisiveis] = useState(calcular);
  useEffect(() => {
    const aoRedimensionar = () => setCardsVisiveis(calcular());
    window.addEventListener("resize", aoRedimensionar);
    return () => window.removeEventListener("resize", aoRedimensionar);
  }, []);
  return cardsVisiveis;
}

// Carrossel infinito e automático, sem depender de lib nenhuma: clones do
// fim entram no início e clones do início entram no fim — ao passar por um
// clone, o carrossel "teleporta" pro item real correspondente com a
// transição desligada por um frame, o que dá a ilusão de loop contínuo.
function Carrossel({ eventos }) {
  const N = eventos.length;
  const loop = N > 1;
  const cardsVisiveis = useCardsVisiveis();

  const estendida = loop
    ? [
        ...Array.from({ length: CLONES }, (_, i) => itemCiclo(eventos, N - CLONES + i)),
        ...eventos,
        ...Array.from({ length: CLONES }, (_, i) => itemCiclo(eventos, i)),
      ]
    : eventos;
  const inicioReal = loop ? CLONES : 0;

  const [indice, setIndice] = useState(inicioReal);
  const [comTransicao, setComTransicao] = useState(true);
  const [arrastoPx, setArrastoPx] = useState(0);

  const containerRef = useRef(null);
  const arrastoRef = useRef(null);
  const timerRef = useRef(null);

  const pararAutoplay = () => clearInterval(timerRef.current);
  const iniciarAutoplay = () => {
    pararAutoplay();
    if (!loop) return;
    timerRef.current = setInterval(() => {
      setComTransicao(true);
      setIndice((i) => i + 1);
    }, INTERVALO_AUTOPLAY);
  };

  useEffect(() => {
    iniciarAutoplay();
    return pararAutoplay;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [N]);

  // Reativa a transição um frame depois do "teleporte" silencioso, já com a
  // posição nova pintada na tela
  useEffect(() => {
    if (comTransicao) return;
    const raf = requestAnimationFrame(() => setComTransicao(true));
    return () => cancelAnimationFrame(raf);
  }, [comTransicao]);

  const aoTransicionar = () => {
    if (!loop) return;
    if (indice >= inicioReal + N) {
      setComTransicao(false);
      setIndice(indice - N);
    } else if (indice < inicioReal) {
      setComTransicao(false);
      setIndice(indice + N);
    }
  };

  const proximo = () => {
    setComTransicao(true);
    setIndice((i) => i + 1);
    iniciarAutoplay();
  };
  const anterior = () => {
    setComTransicao(true);
    setIndice((i) => i - 1);
    iniciarAutoplay();
  };
  const irPara = (i) => {
    setComTransicao(true);
    setIndice(inicioReal + i);
    iniciarAutoplay();
  };

  // Arraste por mouse/toque — segue o dedo em tempo real; ao soltar, decide
  // se troca de card (passou de meia largura de card) ou volta pro lugar
  const aoPressionar = (e) => {
    pararAutoplay();
    arrastoRef.current = { x: e.clientX, largura: containerRef.current.clientWidth };
    containerRef.current.setPointerCapture(e.pointerId);
  };
  const aoMover = (e) => {
    if (!arrastoRef.current) return;
    setArrastoPx(e.clientX - arrastoRef.current.x);
  };
  const aoSoltar = () => {
    if (!arrastoRef.current) return;
    const { largura } = arrastoRef.current;
    const limiar = largura / cardsVisiveis / 2;
    if (arrastoPx < -limiar) proximo();
    else if (arrastoPx > limiar) anterior();
    else iniciarAutoplay();
    setArrastoPx(0);
    arrastoRef.current = null;
  };

  const ativo = loop ? (((indice - inicioReal) % N) + N) % N : indice;
  // Com só 1 show cadastrado não faz sentido dividir a fileira em 3 fatias
  // vazias — o card único ocupa a largura toda
  const passoPercentual = loop ? 100 / cardsVisiveis : 100;

  return (
    <div>
      <div className="relative" onMouseEnter={pararAutoplay} onMouseLeave={() => !arrastoRef.current && iniciarAutoplay()}>
        <div
          ref={containerRef}
          className="overflow-hidden select-none"
          style={{ touchAction: "pan-y" }}
          onPointerDown={aoPressionar}
          onPointerMove={aoMover}
          onPointerUp={aoSoltar}
          onPointerCancel={aoSoltar}
        >
          <div
            className={`flex ${comTransicao ? "transition-transform duration-500 ease-out" : ""}`}
            style={{ transform: `translateX(calc(${-indice * passoPercentual}% + ${arrastoPx}px))` }}
            onTransitionEnd={aoTransicionar}
          >
            {estendida.map((ev, i) => (
              <div
                key={`${ev.id}-${i}`}
                className="shrink-0 px-1.5"
                style={{ flexBasis: `${passoPercentual}%` }}
              >
                <CardEvento ev={ev} />
              </div>
            ))}
          </div>
        </div>

        {N > 1 && (
          <>
            <button
              onClick={anterior}
              aria-label="Show anterior"
              className="hidden sm:flex items-center justify-center absolute left-0 top-1/2 -translate-y-1/2 -translate-x-4 w-9 h-9 rounded-full border border-gold-600/60 bg-noir-900 text-gold-300 hover:bg-noir-800 transition"
            >
              <IconeSeta />
            </button>
            <button
              onClick={proximo}
              aria-label="Próximo show"
              className="hidden sm:flex items-center justify-center absolute right-0 top-1/2 -translate-y-1/2 translate-x-4 w-9 h-9 rounded-full border border-gold-600/60 bg-noir-900 text-gold-300 hover:bg-noir-800 transition"
            >
              <IconeSeta className="rotate-180" />
            </button>
          </>
        )}
      </div>

      {N > 1 && (
        <div className="flex justify-center gap-1.5 mt-4">
          {eventos.map((_, i) => (
            <button
              key={i}
              onClick={() => irPara(i)}
              aria-label={`Ir para o show ${i + 1}`}
              className={`h-1.5 rounded-full transition-all ${
                i === ativo ? "w-5 bg-gold-400" : "w-1.5 bg-noir-700"
              }`}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function IconeSeta({ className = "" }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`w-4 h-4 ${className}`}
    >
      <polyline points="15 6 9 12 15 18" />
    </svg>
  );
}

/* ------------------------- CARD PADRÃO ------------------------- */

// Design fixo (o mesmo "molde" pra todos os shows) — só título, subtítulo,
// data/local/hora e detalhes mudam de um card pro outro. Compacto de
// propósito, pra caber até 3 lado a lado. Paleta noir + dourado da
// identidade do duo.
function CardEvento({ ev }) {
  const d = dataLocal(ev.data);
  return (
    <article className="h-full rounded-xl border border-gold-600/40 bg-gradient-to-b from-noir-900 to-noir-950 px-3 py-4 text-center relative overflow-hidden">
      <span className="pointer-events-none absolute top-2 left-2 text-gold-500/40 text-[10px]">✦</span>
      <span className="pointer-events-none absolute top-2 right-2 text-gold-500/40 text-[10px]">✦</span>

      <p className="text-[9px] tracking-[0.25em] uppercase text-gold-500/80">Próximo show</p>

      <h3 className="font-display text-base tracking-wide leading-snug mt-2 break-words text-gold-300">
        {ev.titulo}
      </h3>
      {ev.subtitulo && (
        <p className="text-cream-muted italic text-xs mt-1 break-words">{ev.subtitulo}</p>
      )}

      <div className="gold-rule my-3" />

      <div className="flex items-center justify-center gap-1.5">
        <span className="font-display text-2xl leading-none text-cream">{d.getDate()}</span>
        <span className="flex flex-col items-start text-left leading-tight">
          <span className="text-gold-300 text-[11px] uppercase tracking-wider">
            {MESES_ABREV[d.getMonth()]}
          </span>
          <span className="text-cream-muted text-[10px]">{d.getFullYear()}</span>
        </span>
      </div>

      <p className="text-cream text-xs mt-2 break-words">
        {[ev.local, formatarHora(ev.hora)].filter(Boolean).join(" • ")}
      </p>
      {ev.observacao && (
        <p className="text-cream-muted/70 text-[11px] mt-1.5 break-words">{ev.observacao}</p>
      )}

      <span className="pointer-events-none absolute bottom-2 left-2 text-gold-500/40 text-[10px]">✦</span>
      <span className="pointer-events-none absolute bottom-2 right-2 text-gold-500/40 text-[10px]">✦</span>
    </article>
  );
}
