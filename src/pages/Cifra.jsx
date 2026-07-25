import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import * as pdfjs from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { supabase, supabaseConfigured } from "../lib/supabase";

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

const VELOCIDADE_MIN = 5; // px/s
const VELOCIDADE_MAX = 120;
const VELOCIDADE_PASSO = 5;
const ZOOM_MIN = 0.6;
const ZOOM_MAX = 2.5;

const distanciaEntreToques = (touches) => {
  const [a, b] = touches;
  return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
};

export default function Cifra() {
  const { id } = useParams();
  const [sessao, setSessao] = useState(undefined); // undefined = verificando
  const [musica, setMusica] = useState(null);
  const [erro, setErro] = useState("");
  const [rodando, setRodando] = useState(false);
  const [velocidade, setVelocidade] = useState(20);
  // "zoom" é o valor com que as páginas foram DE FATO renderizadas (caro:
  // recria os canvases do PDF). "zoomAlvo" é o valor AO VIVO — o que a tela
  // mostra agora, via CSS transform (grátis, instantâneo, sem re-render).
  // Botão e pinça só mexem em zoomAlvo; quando ele para de mudar por um
  // instante, um efeito "assenta" o valor em zoom e manda renderizar de
  // verdade. Isso é o que torna o pinça linear/em tempo real em vez de
  // pular em saltos calculados a cada re-render.
  const [zoom, setZoom] = useState(2); // abre em 200%
  const [zoomAlvo, setZoomAlvo] = useState(2);
  const [renderizando, setRenderizando] = useState(true);
  const [resolucaoLimitada, setResolucaoLimitada] = useState(false);

  const scrollRef = useRef(null);
  const paginasRef = useRef(null);
  const docRef = useRef(null);
  const rodandoRef = useRef(false);
  const renderizandoRef = useRef(true);
  const velocidadeRef = useRef(velocidade);
  const zoomRef = useRef(zoom);
  const zoomAnteriorRef = useRef(zoom); // para compensar a velocidade quando o zoom muda
  const alturaNaturalRef = useRef(0); // altura real (sem transform) da última renderização
  const renderTasksRef = useRef([]);
  const pinchRef = useRef(null); // { distancia, zoomBase, dedos } enquanto os dedos estão na tela
  const pinchOcorreuRef = useRef(false); // evita alternar play/pause ao soltar o pinça
  const pinchOrigemRef = useRef(0); // ponto (em px) de onde o pinça cresce, fixado no início do gesto

  zoomRef.current = zoom;
  rodandoRef.current = rodando;
  renderizandoRef.current = renderizando;
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
        await renderizar(doc, zoomRef.current);
      } catch (e) {
        console.error(e);
        if (!cancelado) setErro("Não foi possível abrir o PDF.");
      }
    })();

    return () => {
      cancelado = true;
      docRef.current?.destroy?.();
      // Sem isso, um efeito de zoom que dispare logo depois da troca de
      // música ainda vê o doc antigo (já destruído) e chama getPage nele,
      // travando "Carregando cifra..." pra sempre na música nova
      docRef.current = null;
    };
  }, [sessao, id]);

  // --- Renderiza as páginas no zoom atual ---
  const renderIdRef = useRef(0);
  const renderizar = async (doc, escala) => {
    const container = paginasRef.current;
    const scrollEl = scrollRef.current;
    if (!container) return;
    const meuRender = ++renderIdRef.current; // cancela renders anteriores
    setRenderizando(true);

    // Guarda em que % da cifra o usuário estava ANTES de reconstruir os
    // canvases, pra não "teleportar" pra outro trecho da música quando o
    // zoom mudar (o conteúdo muda de altura total)
    let proporcaoScroll = 0;
    if (scrollEl && scrollEl.scrollHeight > scrollEl.clientHeight) {
      proporcaoScroll = scrollEl.scrollTop / (scrollEl.scrollHeight - scrollEl.clientHeight);
    }

    // Cancela renders de página do zoom anterior que ainda estejam em
    // andamento — sem isso, uma RenderingCancelledException não tratada
    // interrompia a função antes do setRenderizando(false), deixando a
    // tela travada em "Carregando cifra..."
    renderTasksRef.current.forEach((tarefa) => tarefa.cancel?.());
    renderTasksRef.current = [];

    // Libera a memória dos canvases antigos antes de descartá-los — muitos
    // canvases grandes vivos ao mesmo tempo fazem o navegador (sobretudo em
    // iOS/Safari) "reciclar" algum deles, pintando a página de verde/branco
    for (const el of container.children) {
      if (el.tagName === "CANVAS") {
        el.width = 0;
        el.height = 0;
      }
    }
    container.innerHTML = "";

    const larguraCss =
      Math.min(container.clientWidth || window.innerWidth, 1000) * escala;
    const dpr = window.devicePixelRatio || 1;
    let algumaPaginaLimitada = false;

    for (let i = 1; i <= doc.numPages; i++) {
      if (renderIdRef.current !== meuRender) return;

      try {
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
          algumaPaginaLimitada = true;
        }
        const maiorLado = Math.max(base.width, base.height) * escalaRender;
        if (maiorLado > MAX_DIMENSAO) {
          escalaRender *= MAX_DIMENSAO / maiorLado;
          algumaPaginaLimitada = true;
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

        const tarefa = pagina.render({
          canvasContext: canvas.getContext("2d"),
          viewport,
        });
        renderTasksRef.current.push(tarefa);
        await tarefa.promise;
      } catch (e) {
        // Render cancelado por um zoom mais recente, ou doc destruído por
        // uma troca de música — não são erros reais pro usuário ver
        if (e?.name === "RenderingCancelledException" || renderIdRef.current !== meuRender) {
          return;
        }
        console.error(e);
        setErro("Não foi possível exibir essa página da cifra.");
        setRenderizando(false);
        return;
      }
    }

    if (renderIdRef.current === meuRender) {
      alturaNaturalRef.current = container.scrollHeight;
      setResolucaoLimitada(algumaPaginaLimitada);
      setRenderizando(false);

      // Restaura a posição relativa de leitura no novo tamanho, depois que
      // o navegador aplicar o layout dos canvases novos
      if (scrollEl) {
        requestAnimationFrame(() => {
          const maxScroll = scrollEl.scrollHeight - scrollEl.clientHeight;
          if (maxScroll > 0) scrollEl.scrollTop = proporcaoScroll * maxScroll;
        });
      }
    }
  };

  // --- zoomAlvo (ao vivo) "assenta" em zoom (renderizado) depois de um
  // instante sem mudar — evita re-renderizar o PDF inteiro a cada frame de
  // um pinça ou clique repetido no botão ---
  useEffect(() => {
    const timer = setTimeout(() => setZoom(zoomAlvo), 150);
    return () => clearTimeout(timer);
  }, [zoomAlvo]);

  // --- zoom assentou → agora sim re-renderiza o PDF de verdade ---
  useEffect(() => {
    if (docRef.current) renderizar(docRef.current, zoom);
  }, [zoom]);

  // --- Zoom mudou → ajusta a velocidade proporcionalmente, senão a mesma
  // velocidade em px/s passa a rolar por menos (ou mais) música por
  // segundo conforme o tamanho do conteúdo muda ---
  useEffect(() => {
    const anterior = zoomAnteriorRef.current;
    if (anterior && anterior !== zoom) {
      setVelocidade((v) => {
        const nova = Math.round(v * (zoom / anterior));
        return Math.min(VELOCIDADE_MAX, Math.max(VELOCIDADE_MIN, nova));
      });
    }
    zoomAnteriorRef.current = zoom;
  }, [zoom]);

  // --- Re-renderiza ao girar a tela / redimensionar a janela (tablet no
  // suporte de partitura muda de retrato pra paisagem no meio do show) ---
  useEffect(() => {
    let timer;
    const aoRedimensionar = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (docRef.current) renderizar(docRef.current, zoomRef.current);
      }, 300);
    };
    window.addEventListener("resize", aoRedimensionar);
    window.addEventListener("orientationchange", aoRedimensionar);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("resize", aoRedimensionar);
      window.removeEventListener("orientationchange", aoRedimensionar);
    };
  }, []);

  // --- Loop da rolagem automática ---
  useEffect(() => {
    let rafId;
    let ultimoT = null;
    // Acumula frações de pixel: em velocidades baixas o avanço por quadro
    // é < 1px e seria perdido no arredondamento do scrollTop
    let acumulado = 0;

    const passo = (t) => {
      // Pausa a rolagem (sem acumular pixels) enquanto o PDF está sendo
      // re-renderizado — o container fica temporariamente vazio/menor
      // nesse meio-tempo, e sem essa trava a "chegada ao fim" disparava
      // falso positivo (ou os pixels acumulados causavam um salto quando
      // o conteúdo novo aparecesse)
      if (
        ultimoT !== null &&
        rodandoRef.current &&
        !renderizandoRef.current &&
        scrollRef.current
      ) {
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

  // --- Bloqueia o zoom de pinça nativo do navegador (o zoom da página é
  // feito por nós, com botões/pinça próprios) ---
  // O touch-action abaixo já é o que realmente bloqueia isso em navegadores
  // modernos (inclusive iOS, onde o Safari ignora user-scalable=no desde a
  // v10). Mantemos o ajuste no <meta> como reforço para navegadores mais
  // antigos que ainda dependem dele.
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
    const pedirWakeLock = () => {
      if (rodando && navigator.wakeLock) {
        navigator.wakeLock
          .request("screen")
          .then((wl) => (wakeLock = wl))
          .catch(() => {});
      }
    };
    pedirWakeLock();

    // O sistema solta o wake lock sozinho quando a aba fica em segundo
    // plano (troca de app, notificação) — sem isso, a tela pode voltar a
    // apagar no meio do show mesmo com a música ainda "rolando"
    const aoVoltarVisivel = () => {
      if (document.visibilityState === "visible") pedirWakeLock();
    };
    document.addEventListener("visibilitychange", aoVoltarVisivel);

    return () => {
      document.removeEventListener("visibilitychange", aoVoltarVisivel);
      wakeLock?.release?.().catch(() => {});
    };
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
        <Link to="/admin?aba=cifras" className="btn-gold px-6 py-3 rounded-xl text-sm">
          Fazer login
        </Link>
      </div>
    );
  }

  const escalaAoVivo = zoomAlvo / zoom;

  return (
    <div className="h-dvh flex flex-col">
      {/* Barra superior */}
      <header className="flex items-center justify-between gap-3 px-4 py-2 border-b border-noir-800 bg-noir-900/90 shrink-0">
        <Link
          to="/admin?aba=cifras"
          className="text-xs text-cream-muted hover:text-gold-300 transition shrink-0"
        >
          ‹ Voltar
        </Link>
        <div className="min-w-0 text-center">
          <p className="text-cream text-sm truncate">{musica?.nome}</p>
          <p className="text-cream-muted text-xs truncate">{musica?.artista}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => setZoomAlvo((z) => Math.max(ZOOM_MIN, +(z - 0.15).toFixed(2)))}
            aria-label="Diminuir zoom"
            className="w-[72px] h-[72px] rounded-lg border border-noir-700 text-cream-muted text-lg hover:text-gold-300 transition"
          >
            A−
          </button>
          <div className="text-center leading-tight w-12">
            <span className="text-cream-muted text-xs tabular-nums">
              {Math.round(zoomAlvo * 100)}%
            </span>
            {resolucaoLimitada && (
              <p
                title="Nitidez reduzida neste zoom para não travar em aparelhos mais fracos"
                className="text-[9px] text-amber-400/80 leading-none mt-0.5"
              >
                ◐ nitidez
              </p>
            )}
          </div>
          <button
            onClick={() => setZoomAlvo((z) => Math.min(ZOOM_MAX, +(z + 0.15).toFixed(2)))}
            aria-label="Aumentar zoom"
            className="w-[72px] h-[72px] rounded-lg border border-noir-700 text-cream-muted text-lg hover:text-gold-300 transition"
          >
            A+
          </button>
        </div>
      </header>

      {/* Área do PDF — toque alterna play/pause; pinça com 2 dedos dá zoom */}
      <div
        ref={scrollRef}
        onClick={() => {
          if (pinchOcorreuRef.current) {
            pinchOcorreuRef.current = false;
            return;
          }
          if (!erro) setRodando((r) => !r);
        }}
        onTouchStart={(e) => {
          if (e.touches.length >= 2) {
            const el = scrollRef.current;
            pinchOrigemRef.current = el ? el.scrollTop + el.clientHeight / 2 : 0;
            pinchRef.current = {
              distancia: distanciaEntreToques(e.touches),
              zoomBase: zoomAlvo,
              dedos: e.touches.length,
            };
            pinchOcorreuRef.current = true;
          }
        }}
        onTouchMove={(e) => {
          if (e.touches.length < 2) return;
          // Mudou a quantidade de dedos (3º dedo encostou, ou um soltou e
          // ainda sobraram 2) — recomeça a referência em vez de saltar
          if (!pinchRef.current || pinchRef.current.dedos !== e.touches.length) {
            const el = scrollRef.current;
            pinchOrigemRef.current = el ? el.scrollTop + el.clientHeight / 2 : 0;
            pinchRef.current = {
              distancia: distanciaEntreToques(e.touches),
              zoomBase: zoomAlvo,
              dedos: e.touches.length,
            };
            return;
          }
          const distancia = distanciaEntreToques(e.touches);
          const fator = distancia / pinchRef.current.distancia;
          const novoZoom = Math.max(
            ZOOM_MIN,
            Math.min(ZOOM_MAX, +(pinchRef.current.zoomBase * fator).toFixed(2))
          );
          // Só atualiza o alvo (CSS, instantâneo) — o re-render de verdade
          // só acontece quando o gesto assentar (ver efeito de zoomAlvo)
          setZoomAlvo(novoZoom);
        }}
        onTouchEnd={(e) => {
          if (e.touches.length < 2) pinchRef.current = null;
        }}
        onTouchCancel={(e) => {
          if (e.touches.length < 2) pinchRef.current = null;
        }}
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
            {/* Enquanto o pinça está "ao vivo" (escalaAoVivo ≠ 1), essa altura
                explícita faz a área rolável acompanhar o tamanho visual em
                tempo real — sem ela, o conteúdo escalado por CSS podia ficar
                maior que a área de rolagem (ainda no tamanho antigo) e cortar
                na tela até o zoom assentar. */}
            <div style={escalaAoVivo !== 1 ? { height: alturaNaturalRef.current * escalaAoVivo } : undefined}>
              <div
                ref={paginasRef}
                style={{
                  transform: `scale(${escalaAoVivo})`,
                  transformOrigin: `50% ${pinchOrigemRef.current}px`,
                }}
              />
            </div>
            <div className="h-[40vh]" /> {/* respiro para terminar a música */}
          </>
        )}
      </div>

      {/* Controles */}
      {!erro && (
        <footer className="flex items-center justify-center gap-6 px-4 py-4 border-t border-noir-800 bg-noir-900/90 shrink-0 flex-wrap">
          <button
            onClick={() =>
              setVelocidade((v) => Math.max(VELOCIDADE_MIN, v - VELOCIDADE_PASSO))
            }
            aria-label="Mais devagar"
            className="w-[99px] h-[99px] rounded-xl border border-noir-700 text-cream text-3xl hover:border-gold-600 transition"
          >
            −
          </button>

          <button
            onClick={() => setRodando((r) => !r)}
            aria-label={rodando ? "Pausar" : "Rolar"}
            className="btn-gold w-36 h-36 rounded-full text-5xl"
          >
            {rodando ? "❚❚" : "▶"}
          </button>

          <button
            onClick={() =>
              setVelocidade((v) => Math.min(VELOCIDADE_MAX, v + VELOCIDADE_PASSO))
            }
            aria-label="Mais rápido"
            className="w-[99px] h-[99px] rounded-xl border border-noir-700 text-cream text-3xl hover:border-gold-600 transition"
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
