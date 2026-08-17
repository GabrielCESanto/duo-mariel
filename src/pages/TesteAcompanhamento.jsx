import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { parseChordPro } from "../lib/chordpro";
import { normalizarNome } from "../lib/texto";
import { useAcompanhamentoPorAcorde } from "../hooks/useAcompanhamentoPorAcorde";

const BASE = import.meta.env.BASE_URL;

const ZOOM_MIN = 0.6;
const ZOOM_MAX = 2.5;
const VELOCIDADE_MIN = 5; // px/s
const VELOCIDADE_MAX = 120;
const VELOCIDADE_PASSO = 5;

// Mesmo truque da tela de Cifra: "dvh" acompanha a barra de endereço
// sumindo/aparecendo no celular; "vh" tradicional é o fallback pra
// navegador sem suporte.
const ALTURA_TELA_CLASSE =
  typeof CSS !== "undefined" && CSS.supports?.("height", "100dvh") ? "h-dvh" : "h-screen";

// Página no mesmo estilo visual da tela de Cifra (cabeçalho, zoom, rolagem
// dedicada), mas com uma linha central fixa ("delimitador") marcando onde
// está a leitura — o texto rola por baixo dela, ela não se move. Quatro
// jeitos de mover a tela:
// - Manual: só o dedo, sem nada automático.
// - Automático: velocidade constante (igual à tela de Cifra hoje).
// - Voz / Acorde: acompanhamento por reconhecimento (ver
//   useAcompanhamentoPorAcorde) — o delimitador central passa a marcar a
//   linha que o sistema está reconhecendo agora.
// Não está linkada em nenhum menu do site público — acesse pelo Menu do
// admin ("Acompanhamento (teste)") ou direto por /#/teste-acompanhamento.
export default function TesteAcompanhamento() {
  const { id } = useParams();

  if (id) return <Viewer id={id} />;

  return (
    <div className="min-h-screen">
      <div className="max-w-2xl mx-auto px-5 py-8">
        <header className="flex items-center gap-3 mb-6">
          <Link to="/" className="flex items-center gap-3 group shrink-0">
            <img
              src={`${BASE}img/logo-circle.png`}
              alt="Duo Mariel"
              className="w-10 h-10 rounded-full border border-noir-700 group-hover:border-gold-500 transition"
            />
          </Link>
          <div className="min-w-0 flex-1">
            <span className="section-title text-sm block">Acompanhamento por acorde</span>
            <span className="text-cream-muted text-xs">
              protótipo experimental — só escuta, não grava nem envia áudio
            </span>
          </div>
          <Link
            to="/admin"
            className="shrink-0 px-3 py-1.5 rounded-lg border border-noir-700 text-xs text-cream-muted hover:text-gold-300 hover:border-gold-600 transition"
          >
            ‹ Menu
          </Link>
        </header>

        <Selecionar />
      </div>
    </div>
  );
}

function Selecionar() {
  const [musicas, setMusicas] = useState(null);
  const [filtro, setFiltro] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    supabase
      .from("musicas")
      .select("id, nome, artista")
      .not("cifra_cho", "is", null)
      .order("nome")
      .then(({ data, error }) => setMusicas(error ? [] : data ?? []));
  }, []);

  const visiveis = useMemo(() => {
    if (!musicas) return [];
    const q = normalizarNome(filtro);
    if (!q) return musicas;
    return musicas.filter((m) => normalizarNome(`${m.nome} ${m.artista}`).includes(q));
  }, [musicas, filtro]);

  return (
    <div className="border border-noir-700 rounded-2xl p-5 bg-noir-900/50">
      <h2 className="section-title text-sm mb-3">Escolha uma cifra (só em ChordPro)</h2>
      <input
        className="input-noir mb-3"
        placeholder="Buscar por nome ou artista..."
        value={filtro}
        onChange={(e) => setFiltro(e.target.value)}
        autoFocus
      />
      {musicas === null ? (
        <p className="text-cream-muted text-sm py-4">Carregando...</p>
      ) : (
        <ul className="divide-y divide-noir-800 max-h-[480px] overflow-y-auto">
          {visiveis.map((m) => (
            <li key={m.id}>
              <button
                onClick={() => navigate(`/teste-acompanhamento/${m.id}`)}
                className="w-full text-left py-3 px-2 -mx-2 rounded-lg hover:bg-noir-800/50 transition"
              >
                <p className="text-cream truncate">{m.nome}</p>
                <p className="text-cream-muted text-sm truncate">{m.artista}</p>
              </button>
            </li>
          ))}
          {visiveis.length === 0 && (
            <li className="py-4 text-cream-muted text-sm">
              Nenhuma cifra em ChordPro encontrada (essa técnica só funciona com cifra em texto, não PDF/imagem).
            </li>
          )}
        </ul>
      )}
    </div>
  );
}

function Viewer({ id }) {
  const [musica, setMusica] = useState(undefined); // undefined = carregando, null = não achou
  const [zoom, setZoom] = useState(1.8);
  // "manual" (só dedo), "automatico" (velocidade constante, como a tela de
  // Cifra hoje), "voz" e "acorde" (acompanhamento por reconhecimento) —
  // mutuamente exclusivos, só um jeito de mover a tela por vez.
  const [modo, setModo] = useState("voz");
  const [velocidade, setVelocidade] = useState(15);
  const [rodandoAuto, setRodandoAuto] = useState(false);

  const scrollRef = useRef(null);
  const rodandoAutoRef = useRef(false);
  const velocidadeRef = useRef(velocidade);
  rodandoAutoRef.current = rodandoAuto;
  velocidadeRef.current = velocidade;

  useEffect(() => {
    supabase
      .from("musicas")
      .select("id, nome, artista, cifra_cho")
      .eq("id", id)
      .single()
      .then(({ data, error }) => setMusica(error ? null : data));
  }, [id]);

  const blocos = useMemo(
    () => (musica?.cifra_cho ? parseChordPro(musica.cifra_cho).blocos : []),
    [musica]
  );

  const {
    frases,
    fraseAtual,
    ouvindo,
    similaridade,
    textoOuvido,
    idioma,
    vozSuportada,
    erro,
    iniciar,
    parar,
    avancarManual,
    voltarManual,
  } = useAcompanhamentoPorAcorde(blocos, { modo: modo === "acorde" ? "acorde" : "voz" });

  const modoReconhecimento = modo === "voz" || modo === "acorde";
  const emAndamento = modo === "automatico" ? rodandoAuto : modoReconhecimento && ouvindo;

  // --- Loop da rolagem automática (velocidade constante) ---
  useEffect(() => {
    if (modo !== "automatico") return;
    let rafId;
    let ultimoT = null;
    let acumulado = 0;

    const passo = (t) => {
      if (ultimoT !== null && rodandoAutoRef.current && scrollRef.current) {
        const dt = (t - ultimoT) / 1000;
        const el = scrollRef.current;
        acumulado += velocidadeRef.current * dt;
        const inteiro = Math.floor(acumulado);
        if (inteiro >= 1) {
          el.scrollTop += inteiro;
          acumulado -= inteiro;
        }
        if (el.scrollTop + el.clientHeight >= el.scrollHeight - 2) setRodandoAuto(false);
      }
      ultimoT = t;
      rafId = requestAnimationFrame(passo);
    };
    rafId = requestAnimationFrame(passo);
    return () => cancelAnimationFrame(rafId);
  }, [modo]);

  // --- Tela sempre acesa enquanto algo estiver rolando sozinho ---
  useEffect(() => {
    let wakeLock = null;
    if (emAndamento && navigator.wakeLock) {
      navigator.wakeLock.request("screen").then((wl) => (wakeLock = wl)).catch(() => {});
    }
    return () => wakeLock?.release?.().catch(() => {});
  }, [emAndamento]);

  const trocarModo = (novo) => {
    if (ouvindo) parar();
    setRodandoAuto(false);
    setModo(novo);
  };

  const alternarAndamento = () => {
    if (modo === "automatico") setRodandoAuto((r) => !r);
    else if (modoReconhecimento) (ouvindo ? parar() : iniciar());
  };

  if (musica === undefined) return <p className="text-cream-muted text-center py-20">Carregando...</p>;
  if (musica === null || !musica.cifra_cho) {
    return (
      <p className="text-cream-muted text-center py-20">
        Cifra não encontrada ou não está em ChordPro.{" "}
        <Link to="/teste-acompanhamento" className="text-gold-300">
          Escolher outra
        </Link>
      </p>
    );
  }

  return (
    <div className={`${ALTURA_TELA_CLASSE} flex flex-col`}>
      <header className="border-b border-noir-800 bg-noir-900/90 shrink-0 px-3 py-3 md:px-6 md:py-4">
        <div className="grid grid-cols-3 items-center gap-2">
          <Link
            to="/admin"
            className="justify-self-start px-4 py-2.5 rounded-xl border border-noir-700 text-cream-muted text-sm hover:text-gold-300 hover:border-gold-600 transition"
          >
            ‹ Menu
          </Link>
          <div className="justify-self-center min-w-0 text-center">
            <p className="text-cream truncate">{musica.nome}</p>
            <p className="text-cream-muted text-xs truncate">{musica.artista}</p>
          </div>
          <div className="justify-self-end flex items-center gap-1.5">
            <button
              onClick={() => setZoom((z) => Math.max(ZOOM_MIN, +(z - 0.15).toFixed(2)))}
              aria-label="Diminuir zoom"
              className="w-9 h-9 rounded-lg border border-noir-700 text-cream text-sm hover:border-gold-600 transition"
            >
              A−
            </button>
            <button
              onClick={() => setZoom((z) => Math.min(ZOOM_MAX, +(z + 0.15).toFixed(2)))}
              aria-label="Aumentar zoom"
              className="w-9 h-9 rounded-lg border border-noir-700 text-cream text-sm hover:border-gold-600 transition"
            >
              A+
            </button>
          </div>
        </div>

        <div className="gold-rule my-2.5" />

        <div className="flex flex-wrap items-center justify-center gap-1.5">
          {[
            ["manual", "Manual"],
            ["automatico", "Automático"],
            ["voz", "Voz"],
            ["acorde", "Acorde"],
          ].map(([valor, rotulo]) => (
            <button
              key={valor}
              onClick={() => trocarModo(valor)}
              className={`px-3 py-1.5 rounded-full text-xs tracking-wide transition border ${
                modo === valor
                  ? "btn-gold border-transparent"
                  : "border-noir-700 text-cream-muted hover:text-cream"
              }`}
            >
              {rotulo}
            </button>
          ))}
        </div>

        {modo === "automatico" && (
          <div className="flex items-center justify-center gap-3 mt-2.5">
            <button
              onClick={() => setVelocidade((v) => Math.max(VELOCIDADE_MIN, v - VELOCIDADE_PASSO))}
              aria-label="Mais devagar"
              className="w-9 h-9 rounded-lg border border-noir-700 text-cream text-lg hover:border-gold-600 transition"
            >
              −
            </button>
            <button
              onClick={alternarAndamento}
              aria-label={rodandoAuto ? "Pausar" : "Rolar"}
              className="btn-gold w-20 h-9 rounded-xl text-xl"
            >
              {rodandoAuto ? "❚❚" : "▶"}
            </button>
            <button
              onClick={() => setVelocidade((v) => Math.min(VELOCIDADE_MAX, v + VELOCIDADE_PASSO))}
              aria-label="Mais rápido"
              className="w-9 h-9 rounded-lg border border-noir-700 text-cream text-lg hover:border-gold-600 transition"
            >
              +
            </button>
            <span className="text-cream-muted text-xs">{velocidade}px/s</span>
          </div>
        )}

        {modoReconhecimento && (
          <div className="mt-2.5">
            <div className="flex items-center justify-center gap-2 flex-wrap">
              <button
                onClick={alternarAndamento}
                className={`px-5 py-2 rounded-xl text-sm ${
                  ouvindo
                    ? "border border-red-800 text-red-300 hover:bg-noir-800 transition"
                    : "btn-gold"
                }`}
              >
                {ouvindo ? "⏹ Parar" : "🎤 Iniciar escuta"}
              </button>
              <button
                onClick={voltarManual}
                className="w-9 h-9 rounded-lg border border-noir-700 text-sm text-cream-muted hover:text-cream transition"
              >
                ◀
              </button>
              <button
                onClick={avancarManual}
                className="w-9 h-9 rounded-lg border border-noir-700 text-sm text-cream-muted hover:text-cream transition"
              >
                ▶
              </button>
              <span className="text-cream-muted text-xs">
                {frases.length === 0
                  ? "sem letra"
                  : `linha ${Math.min(frases.indexOf(fraseAtual) + 1, frases.length)}/${frases.length}`}
              </span>
            </div>

            {modo === "voz" && (
              <p className="text-cream-muted/60 text-xs text-center mt-1.5">
                idioma detectado: <span className="text-gold-300">{idioma}</span>
                {!vozSuportada && (
                  <span className="text-amber-400/80"> — navegador sem suporte a voz (use Chrome/Edge)</span>
                )}
              </p>
            )}

            {erro && <p className="text-red-400 text-xs text-center mt-1.5">{erro}</p>}

            {ouvindo && modo === "acorde" && (
              <div className="max-w-xs mx-auto mt-2">
                <p className="text-cream-muted text-xs mb-1 text-center">
                  esperando <span className="text-gold-300">{fraseAtual?.chord}</span> —{" "}
                  {Math.round(similaridade * 100)}%
                </p>
                <div className="h-1.5 rounded-full bg-noir-800 overflow-hidden">
                  <div
                    className="h-full bg-gold-500 transition-all"
                    style={{ width: `${Math.min(100, Math.round(similaridade * 100))}%` }}
                  />
                </div>
              </div>
            )}
            {ouvindo && modo === "voz" && (
              <p className="text-cream-muted/70 text-xs text-center mt-1.5 truncate">
                🎙️ <span className="italic">{textoOuvido || "..."}</span>
              </p>
            )}
          </div>
        )}
      </header>

      <div className="relative flex-1 min-h-0">
        <div ref={scrollRef} className="absolute inset-0 overflow-y-auto px-4">
          <div style={{ fontSize: `${zoom}rem` }}>
            <CifraChoAcompanhada
              blocos={blocos}
              fraseAtual={modoReconhecimento ? fraseAtual : null}
              scrollRef={scrollRef}
            />
          </div>
        </div>
        {/* Delimitador: linha fixa no centro vertical da área de rolagem —
            o texto passa por baixo dela, ela nunca se move */}
        <div className="absolute left-0 right-0 top-1/2 -translate-y-1/2 border-t-2 border-gold-500/50 pointer-events-none" />
      </div>
    </div>
  );
}

// t: 0..1 -> 0..1, acelera e desacelera (em vez de constante) — dá a
// sensação de "acompanhar a leitura" mesmo em saltos maiores, em vez de
// uma trocada seca de posição
function suavizar(t) {
  return t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
}

// Rola o CONTAINER (não a janela) até alinhar `alvo` com o delimitador no
// centro — duração fixa, com aceleração/desaceleração, em vez do
// scrollIntoView nativo (que em saltos maiores decide uma duração curta
// demais e parece "pular"). `sinalizarParada` interrompe a animação se
// uma frase mais nova chegar antes dela terminar.
function rolarAteCentralizar(container, alvo, sinalizarParada) {
  if (!container || !alvo) return;
  const DURACAO_MS = 550;
  const retanguloAlvo = alvo.getBoundingClientRect();
  const retanguloContainer = container.getBoundingClientRect();
  const alvoTop =
    container.scrollTop +
    (retanguloAlvo.top - retanguloContainer.top) -
    container.clientHeight / 2 +
    retanguloAlvo.height / 2;
  const inicioTop = container.scrollTop;
  const distancia = alvoTop - inicioTop;
  const t0 = performance.now();

  const passo = (agora) => {
    if (sinalizarParada.parado) return;
    const progresso = Math.min(1, (agora - t0) / DURACAO_MS);
    container.scrollTop = inicioTop + distancia * suavizar(progresso);
    if (progresso < 1) requestAnimationFrame(passo);
  };
  requestAnimationFrame(passo);
}

function CifraChoAcompanhada({ blocos, fraseAtual, scrollRef }) {
  const refsLinha = useRef({});

  useEffect(() => {
    if (!fraseAtual) return;
    const sinalizarParada = { parado: false };
    rolarAteCentralizar(scrollRef.current, refsLinha.current[fraseAtual.blocoIndex], sinalizarParada);
    return () => {
      sinalizarParada.parado = true;
    };
  }, [fraseAtual, scrollRef]);

  // Espaço em branco acima/abaixo do texto do tamanho de meia tela — sem
  // isso a primeira e a última linha nunca conseguem chegar até o
  // delimitador central (não sobra pra onde rolar)
  return (
    <div className="max-w-2xl mx-auto text-cream py-[45vh]">
      {blocos.map((b, i) => {
        if (b.tipo === "vazio") return <div key={i} className="h-4" />;
        if (b.tipo === "meta") {
          return (
            <p key={i} className="text-cream-muted/70 text-[0.85em] italic mb-2">
              {b.texto}
            </p>
          );
        }
        if (b.tipo === "secao") {
          return (
            <h3 key={i} className="mt-6 mb-2 first:mt-0 text-gold-300 font-display uppercase tracking-wide text-sm">
              {b.texto}
            </h3>
          );
        }
        const ativa = fraseAtual?.blocoIndex === i;
        return (
          <div
            key={i}
            ref={(el) => {
              refsLinha.current[i] = el;
            }}
            className={`flex flex-wrap items-end rounded-lg px-2 -mx-2 transition-colors ${
              ativa ? "bg-gold-500/15" : ""
            }`}
          >
            {b.segmentos.map((seg, j) => (
              <span key={j} className="inline-flex flex-col items-start max-w-full min-w-0">
                <span className="font-semibold leading-none text-[0.85em] h-[1.3em] select-none text-gold-400">
                  {seg.chord || " "}
                </span>
                <span className="whitespace-pre-wrap break-words leading-snug">{seg.texto || " "}</span>
              </span>
            ))}
          </div>
        );
      })}
    </div>
  );
}
