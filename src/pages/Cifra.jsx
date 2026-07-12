import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import * as pdfjs from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { supabase, supabaseConfigured } from "../lib/supabase";

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

const VELOCIDADE_MIN = 5; // px/s
const VELOCIDADE_MAX = 120;
const VELOCIDADE_PASSO = 5;

export default function Cifra() {
  const { id } = useParams();
  const [sessao, setSessao] = useState(undefined); // undefined = verificando
  const [musica, setMusica] = useState(null);
  const [erro, setErro] = useState("");
  const [rodando, setRodando] = useState(false);
  const [velocidade, setVelocidade] = useState(20);
  const [zoom, setZoom] = useState(1);
  const [renderizando, setRenderizando] = useState(true);

  const scrollRef = useRef(null);
  const paginasRef = useRef(null);
  const docRef = useRef(null);
  const rodandoRef = useRef(false);
  const velocidadeRef = useRef(velocidade);

  rodandoRef.current = rodando;
  velocidadeRef.current = velocidade;

  // --- Sessão (área restrita) ---
  useEffect(() => {
    if (!supabaseConfigured) {
      setSessao(null);
      return;
    }
    supabase.auth.getSession().then(({ data }) => setSessao(data.session));

    // Pede ao sistema para NÃO descartar o cache das cifras
    // quando o dispositivo precisar liberar espaço
    navigator.storage?.persist?.().catch(() => {});
  }, []);

  // --- Carrega música + PDF ---
  useEffect(() => {
    if (!sessao) return;
    let cancelado = false;

    (async () => {
      const { data: m, error } = await supabase
        .from("musicas")
        .select("id, nome, artista, cifra_path")
        .eq("id", id)
        .single();

      if (cancelado) return;
      if (error || !m) {
        setErro("Música não encontrada.");
        return;
      }
      if (!m.cifra_path) {
        setErro("Essa música ainda não tem cifra. Envie o PDF na aba Músicas.");
        setMusica(m);
        return;
      }
      setMusica(m);

      const { data: pub } = supabase.storage
        .from("cifras")
        .getPublicUrl(m.cifra_path);

      try {
        const doc = await pdfjs.getDocument(pub.publicUrl).promise;
        if (cancelado) return;
        docRef.current = doc;
        await renderizar(doc, 1);
      } catch (e) {
        console.error(e);
        if (!cancelado) setErro("Não foi possível abrir o PDF.");
      }
    })();

    return () => {
      cancelado = true;
      docRef.current?.destroy?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessao, id]);

  // --- Renderiza as páginas no zoom atual ---
  const renderIdRef = useRef(0);
  const renderizar = async (doc, escala) => {
    const container = paginasRef.current;
    if (!container) return;
    const meuRender = ++renderIdRef.current; // cancela renders anteriores
    setRenderizando(true);
    container.innerHTML = "";

    const larguraCss =
      Math.min(container.clientWidth || window.innerWidth, 1000) * escala;
    const dpr = window.devicePixelRatio || 1;

    for (let i = 1; i <= doc.numPages; i++) {
      if (renderIdRef.current !== meuRender) return;
      const pagina = await doc.getPage(i);
      const base = pagina.getViewport({ scale: 1 });
      const fator = larguraCss / base.width;

      // Tablets têm limite de tamanho de canvas — acima disso a página
      // sai em branco. Reduz a resolução interna mantendo o tamanho visual.
      let escalaRender = fator * dpr;
      const MAX_PIXELS = 12_000_000;
      const MAX_DIMENSAO = 4096;
      const pixels = base.width * escalaRender * (base.height * escalaRender);
      if (pixels > MAX_PIXELS) {
        escalaRender *= Math.sqrt(MAX_PIXELS / pixels);
      }
      const maiorLado = Math.max(base.width, base.height) * escalaRender;
      if (maiorLado > MAX_DIMENSAO) {
        escalaRender *= MAX_DIMENSAO / maiorLado;
      }

      const viewport = pagina.getViewport({ scale: escalaRender });
      const alturaCss = (base.height / base.width) * larguraCss;

      const canvas = document.createElement("canvas");
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      canvas.style.width = `${larguraCss}px`;
      canvas.style.height = `${alturaCss}px`;
      canvas.className = "mx-auto block mb-2 rounded-lg";

      if (renderIdRef.current !== meuRender) return;
      container.appendChild(canvas);

      await pagina.render({
        canvasContext: canvas.getContext("2d"),
        viewport,
      }).promise;
    }
    if (renderIdRef.current === meuRender) setRenderizando(false);
  };

  // --- Zoom re-renderiza ---
  useEffect(() => {
    if (docRef.current) renderizar(docRef.current, zoom);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoom]);

  // --- Loop da rolagem automática ---
  useEffect(() => {
    let rafId;
    let ultimoT = null;
    // Acumula frações de pixel: em velocidades baixas o avanço por quadro
    // é < 1px e seria perdido no arredondamento do scrollTop
    let acumulado = 0;

    const passo = (t) => {
      if (ultimoT !== null && rodandoRef.current && scrollRef.current) {
        const dt = (t - ultimoT) / 1000;
        const el = scrollRef.current;
        acumulado += velocidadeRef.current * dt;
        const inteiro = Math.floor(acumulado);
        if (inteiro >= 1) {
          el.scrollTop += inteiro;
          acumulado -= inteiro;
        }
        // Chegou ao fim → pausa
        if (el.scrollTop + el.clientHeight >= el.scrollHeight - 2) {
          setRodando(false);
        }
      }
      ultimoT = t;
      rafId = requestAnimationFrame(passo);
    };
    rafId = requestAnimationFrame(passo);
    return () => cancelAnimationFrame(rafId);
  }, []);

  // --- Bloqueia o zoom de pinça (o zoom é pelos botões A− / A+) ---
  // Sem isso, o zoom do navegador amplia a página toda e os controles
  // somem da tela
  useEffect(() => {
    const meta = document.querySelector('meta[name="viewport"]');
    const original = meta?.getAttribute("content");
    meta?.setAttribute(
      "content",
      "width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no"
    );
    return () => {
      if (meta && original) meta.setAttribute("content", original);
    };
  }, []);

  // --- Tela sempre acesa enquanto rola (tablets) ---
  useEffect(() => {
    let wakeLock = null;
    if (rodando && navigator.wakeLock) {
      navigator.wakeLock
        .request("screen")
        .then((wl) => (wakeLock = wl))
        .catch(() => {});
    }
    return () => wakeLock?.release?.().catch(() => {});
  }, [rodando]);

  // --- Teclado / pedal Bluetooth ---
  useEffect(() => {
    const aoTeclar = (e) => {
      const el = scrollRef.current;
      switch (e.key) {
        case " ":
        case "Enter":
          e.preventDefault();
          setRodando((r) => !r);
          break;
        case "ArrowUp":
          e.preventDefault();
          setVelocidade((v) => Math.min(VELOCIDADE_MAX, v + VELOCIDADE_PASSO));
          break;
        case "ArrowDown":
          e.preventDefault();
          setVelocidade((v) => Math.max(VELOCIDADE_MIN, v - VELOCIDADE_PASSO));
          break;
        case "PageDown":
        case "ArrowRight":
          e.preventDefault();
          el?.scrollBy({ top: el.clientHeight * 0.8, behavior: "smooth" });
          break;
        case "PageUp":
        case "ArrowLeft":
          e.preventDefault();
          el?.scrollBy({ top: -el.clientHeight * 0.8, behavior: "smooth" });
          break;
        default:
      }
    };
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, []);

  if (sessao === undefined) {
    return (
      <p className="text-cream-muted text-center py-20">Verificando acesso...</p>
    );
  }

  if (!sessao) {
    return (
      <div className="text-center py-20">
        <p className="text-cream-muted mb-4">
          As cifras são restritas aos integrantes do duo.
        </p>
        <Link to="/admin" className="btn-gold px-6 py-3 rounded-xl text-sm">
          Fazer login
        </Link>
      </div>
    );
  }

  return (
    <div className="h-dvh flex flex-col">
      {/* Barra superior */}
      <header className="flex items-center justify-between gap-3 px-4 py-2 border-b border-noir-800 bg-noir-900/90 shrink-0">
        <Link
          to="/admin"
          className="text-xs text-cream-muted hover:text-gold-300 transition shrink-0"
        >
          ‹ Voltar
        </Link>
        <div className="min-w-0 text-center">
          <p className="text-cream text-sm truncate">{musica?.nome}</p>
          <p className="text-cream-muted text-xs truncate">{musica?.artista}</p>
        </div>
        <div className="flex gap-1 shrink-0">
          <button
            onClick={() => setZoom((z) => Math.max(0.6, +(z - 0.15).toFixed(2)))}
            aria-label="Diminuir zoom"
            className="w-8 h-8 rounded-lg border border-noir-700 text-cream-muted hover:text-gold-300 transition"
          >
            A−
          </button>
          <button
            onClick={() => setZoom((z) => Math.min(2.5, +(z + 0.15).toFixed(2)))}
            aria-label="Aumentar zoom"
            className="w-8 h-8 rounded-lg border border-noir-700 text-cream-muted hover:text-gold-300 transition"
          >
            A+
          </button>
        </div>
      </header>

      {/* Área do PDF — toque alterna play/pause */}
      <div
        ref={scrollRef}
        onClick={() => !erro && setRodando((r) => !r)}
        className="flex-1 overflow-auto bg-noir-950 px-2 py-3 cursor-pointer"
        style={{ touchAction: "pan-x pan-y" }}
      >
        {erro ? (
          <p className="text-cream-muted text-center py-16">{erro}</p>
        ) : (
          <>
            {renderizando && (
              <p className="text-cream-muted text-center py-8 text-sm">
                Carregando cifra...
              </p>
            )}
            <div ref={paginasRef} />
            <div className="h-[40vh]" /> {/* respiro para terminar a música */}
          </>
        )}
      </div>

      {/* Controles */}
      {!erro && (
        <footer className="flex items-center justify-center gap-4 px-4 py-3 border-t border-noir-800 bg-noir-900/90 shrink-0">
          <button
            onClick={() =>
              setVelocidade((v) => Math.max(VELOCIDADE_MIN, v - VELOCIDADE_PASSO))
            }
            aria-label="Mais devagar"
            className="w-11 h-11 rounded-xl border border-noir-700 text-cream text-lg hover:border-gold-600 transition"
          >
            −
          </button>

          <button
            onClick={() => setRodando((r) => !r)}
            aria-label={rodando ? "Pausar" : "Rolar"}
            className="btn-gold w-16 h-16 rounded-full text-2xl"
          >
            {rodando ? "❚❚" : "▶"}
          </button>

          <button
            onClick={() =>
              setVelocidade((v) => Math.min(VELOCIDADE_MAX, v + VELOCIDADE_PASSO))
            }
            aria-label="Mais rápido"
            className="w-11 h-11 rounded-xl border border-noir-700 text-cream text-lg hover:border-gold-600 transition"
          >
            +
          </button>

          <span className="text-cream-muted text-xs w-16 text-center">
            {velocidade} px/s
          </span>
        </footer>
      )}
    </div>
  );
}
