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
// Resolução "nativa" da imagem renderizada — deliberadamente menor que
// ZOOM_MAX. Zoom acima disso ainda funciona (só fica um pouco mais suave),
// mas manter isso mais baixo reduz bastante o tempo de render+codificação
// em CPU de celular, que é o gargalo real do carregamento.
const ZOOM_RENDER_ALVO = 2.0;
const TIMEOUT_CARREGAMENTO_MS = 15_000;
const TIMEOUT_RENDER_PAGINA_MS = 20_000;

const distanciaEntreToques = (touches) => {
  const [a, b] = touches;
  return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
};

// "dvh" (altura real da viewport, ajustada à barra de endereço dinâmica do
// celular) não existe em navegadores/webviews mais antigos — nesses casos
// cai pro "vh" tradicional em vez de ficar sem altura nenhuma. Decidido via
// feature-detection (não dá pra confiar na ordem das classes do Tailwind
// no CSS gerado pra fazer esse fallback via cascata).
const ALTURA_TELA_CLASSE =
  typeof CSS !== "undefined" && CSS.supports?.("height", "100dvh") ? "h-dvh" : "h-screen";

// Descarta os <img> da renderização anterior e libera a memória das
// object URLs (senão elas vazam a cada troca de música)
const limparPaginas = (container) => {
  if (!container) return;
  for (const el of container.children) {
    if (el.tagName === "IMG" && el.src.startsWith("blob:")) {
      URL.revokeObjectURL(el.src);
    }
  }
  container.innerHTML = "";
};

export default function Cifra() {
  const { id } = useParams();
  const [sessao, setSessao] = useState(undefined); // undefined = verificando
  const [musica, setMusica] = useState(null);
  const [erro, setErro] = useState("");
  const [tentativa, setTentativa] = useState(0); // botão "Tentar de novo" incrementa isso
  const [rodando, setRodando] = useState(false);
  const [velocidade, setVelocidade] = useState(20);
  // Cada página do PDF é renderizada em canvas UMA ÚNICA VEZ (na abertura),
  // convertida pra <img> e o canvas é descartado imediatamente. Zoom nunca
  // mais recria canvas — é só CSS (width) por cima das imagens já prontas.
  // Isso existe porque, em celulares mais fracos, recriar canvas grande a
  // cada zoom eventualmente corrompia (tela verde/branca) ou travava sem
  // nem lançar uma exceção (a promise do render simplesmente não resolvia
  // nunca), o que nenhum try/catch conseguia evitar.
  const [zoom, setZoom] = useState(2); // abre em 200%
  const [renderizando, setRenderizando] = useState(true);
  const [resolucaoLimitada, setResolucaoLimitada] = useState(false);
  const [progresso, setProgresso] = useState({ atual: 0, total: 0 }); // pra "Renderizando página X de Y"

  const scrollRef = useRef(null);
  const paginasRef = useRef(null);
  const docRef = useRef(null);
  const rodandoRef = useRef(false);
  const renderizandoRef = useRef(true);
  const velocidadeRef = useRef(velocidade);
  const zoomAnteriorRef = useRef(zoom); // para compensar a velocidade quando o zoom muda
  const renderTasksRef = useRef([]);
  const pinchRef = useRef(null); // { distancia, zoomBase, dedos } enquanto os dedos estão na tela
  const pinchOcorreuRef = useRef(false); // evita alternar play/pause ao soltar o pinça
  const montadoRef = useRef(true); // false assim que a tela é desmontada (ex.: botão Voltar)

  rodandoRef.current = rodando;
  renderizandoRef.current = renderizando;
  velocidadeRef.current = velocidade;

  // --- Interrompe a renderização de verdade ao sair da tela ---
  // Sem isso, apertar "Voltar" no meio do carregamento não parava o
  // trabalho: ele continuava rodando em segundo plano até terminar ou dar
  // erro, gastando CPU/GPU do aparelho à toa — e, se o usuário abrisse
  // outra cifra rápido, competindo por recursos com a nova renderização.
  useEffect(() => {
    return () => {
      montadoRef.current = false;
    };
  }, []);

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

  // --- Renderiza cada página do PDF em canvas, converte pra <img> e
  // descarta o canvas — uma única vez por música (não depende do zoom) ---
  const renderIdRef = useRef(0);
  const renderizar = async (doc) => {
    const container = paginasRef.current;
    if (!container) return;
    const meuRender = ++renderIdRef.current; // cancela renders anteriores
    setRenderizando(true);

    try {
      renderTasksRef.current.forEach((tarefa) => tarefa.cancel?.());
      renderTasksRef.current = [];
      limparPaginas(container);

      const larguraBase = Math.min(scrollRef.current?.clientWidth || window.innerWidth, 1000);
      const dpr = window.devicePixelRatio || 1;
      let algumaPaginaLimitada = false;
      setProgresso({ atual: 0, total: doc.numPages });

      for (let i = 1; i <= doc.numPages; i++) {
        if (renderIdRef.current !== meuRender || !montadoRef.current) return;
        setProgresso({ atual: i, total: doc.numPages });

        const pagina = await doc.getPage(i);
        const base = pagina.getViewport({ scale: 1 });

        // Renderiza numa resolução alta o bastante pra cobrir o zoom "alvo"
        // com nitidez — depois disso o zoom nunca mais toca o canvas de
        // novo, só redimensiona a imagem já pronta via CSS (zoom acima do
        // alvo ainda funciona, só fica um pouco mais suave)
        let escalaRender = (larguraBase * ZOOM_RENDER_ALVO * dpr) / base.width;
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

        const canvas = document.createElement("canvas");
        canvas.width = viewport.width;
        canvas.height = viewport.height;

        const tarefa = pagina.render({ canvasContext: canvas.getContext("2d"), viewport });
        renderTasksRef.current.push(tarefa);

        // Trava de segurança: em GPUs de celular sob pressão de memória, o
        // render pode nunca resolver NEM rejeitar — sem timeout, isso
        // prende "Carregando cifra..." pra sempre, sem nenhum erro pra
        // capturar
        await Promise.race([
          tarefa.promise,
          new Promise((_, rejeitar) =>
            setTimeout(() => rejeitar(new Error("RENDER_TRAVADO")), TIMEOUT_RENDER_PAGINA_MS)
          ),
        ]);

        if (renderIdRef.current !== meuRender || !montadoRef.current) return;

        // Converte pra imagem e descarta o canvas — imagem é bem mais leve
        // e resistente na GPU de celular que canvas ao vivo. JPEG em vez de
        // PNG: para uma página cheia de texto/detalhe (o pior caso pra
        // compressão sem perdas), codificar em PNG é MUITO mais lento —
        // era o principal motivo do carregamento demorar tanto em CPU de
        // celular. Em qualidade alta o texto continua nítido.
        const blob = await Promise.race([
          new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.92)),
          new Promise((_, rejeitar) =>
            setTimeout(() => rejeitar(new Error("RENDER_TRAVADO")), TIMEOUT_RENDER_PAGINA_MS)
          ),
        ]);
        canvas.width = 0;
        canvas.height = 0;

        if (renderIdRef.current !== meuRender || !montadoRef.current) return;
        if (!blob) throw new Error("Falha ao converter página em imagem");

        const img = document.createElement("img");
        img.src = URL.createObjectURL(blob);
        img.alt = `Página ${i} da cifra`;
        img.width = base.width;
        img.height = base.height;
        img.className = "w-full block mb-2 rounded-lg";

        if (renderIdRef.current !== meuRender || !montadoRef.current) {
          URL.revokeObjectURL(img.src);
          return;
        }
        container.appendChild(img);

        // Devolve o controle ao navegador entre páginas — sem isso, o toque
        // e a rolagem ficavam sem resposta até TODAS as páginas terminarem,
        // mesmo com a primeira já visível na tela
        await new Promise((resolve) => requestAnimationFrame(resolve));
      }

      if (renderIdRef.current === meuRender && montadoRef.current) {
        setResolucaoLimitada(algumaPaginaLimitada);
        setRenderizando(false);
      }
    } catch (e) {
      if (e?.name === "RenderingCancelledException" || renderIdRef.current !== meuRender) {
        return;
      }
      console.error(e);
      setErro(
        e?.message === "RENDER_TRAVADO"
          ? "O aparelho travou ao desenhar essa cifra. Toque em tentar de novo."
          : "Não foi possível exibir essa cifra."
      );
      setRenderizando(false);
    }
  };

  // --- Exibe as imagens das páginas já prontas (geradas no upload) — nada
  // de PDF.js aqui, é só apontar os <img> pras imagens já hospedadas ---
  const mostrarImagensProntas = (m, aoFalhar) => {
    const container = paginasRef.current;
    if (!container) return;
    limparPaginas(container);
    let jaFalhou = false;

    for (let i = 1; i <= m.cifra_paginas; i++) {
      const { data: pub } = supabase.storage
        .from("cifras")
        .getPublicUrl(`${m.id}-imgs${m.cifra_versao}-p${i}.jpg`);
      const img = document.createElement("img");
      img.alt = `Página ${i} da cifra`;
      // Reserva o espaço da página (chute de proporção) ANTES da imagem
      // carregar — sem isso, a <img> não tem altura nenhuma até terminar de
      // baixar (ou falhar), e a tela toda "colapsa", parecendo uma área
      // preta vazia. object-contain garante que, se essa proporção-chute
      // não bater com a da página de verdade, a imagem só fica com uma
      // borda vazia (letterbox) em vez de ser esticada/achatada — sem isso
      // o texto saía distorcido sempre que a página não era 0.77 de
      // proporção.
      img.style.aspectRatio = "0.77";
      img.className = "w-full h-auto block mb-2 rounded-lg bg-noir-900 object-contain";
      img.onload = () => {
        // Ajusta pra proporção real da imagem assim que ela carrega, pra
        // não sobrar espaço vazio (o object-contain acima já garantia que
        // nunca distorcia, isso só deixa o encaixe exato)
        if (img.naturalWidth && img.naturalHeight) {
          img.style.aspectRatio = `${img.naturalWidth} / ${img.naturalHeight}`;
        }
      };
      img.onerror = () => {
        // Se a imagem pré-gerada não existir/estiver quebrada, cai pro PDF
        // direto em vez de deixar a tela vazia
        if (jaFalhou) return;
        jaFalhou = true;
        console.warn(`Imagem da página ${i} de "${m.nome}" não carregou — usando o PDF direto.`);
        limparPaginas(container);
        aoFalhar?.();
      };
      img.src = pub.publicUrl;
      container.appendChild(img);
    }
    setRenderizando(false);
  };

  // --- Carrega música + PDF ---
  useEffect(() => {
    if (!sessao) return;
    let cancelado = false;
    let timeoutId;
    const containerAtual = paginasRef.current;
    setErro("");

    // Baixa e renderiza o PDF direto — usado tanto pra cifras antigas (sem
    // imagens pré-geradas) quanto como reserva, se as imagens prontas de
    // uma cifra nova estiverem quebradas por algum motivo
    const carregarViaPdf = async (m) => {
      const { data: pub } = supabase.storage.from("cifras").getPublicUrl(m.cifra_path);
      try {
        // Sem timeout, uma internet ruim (comum fora de casa) deixava
        // "Carregando cifra..." parado pra sempre, sem indicar se travou
        // ou só está lento — e sem jeito de tentar de novo
        const doc = await Promise.race([
          pdfjs.getDocument(pub.publicUrl).promise,
          new Promise((_, rejeitar) => {
            timeoutId = setTimeout(
              () => rejeitar(new Error("TIMEOUT_CARREGAMENTO")),
              TIMEOUT_CARREGAMENTO_MS
            );
          }),
        ]);
        clearTimeout(timeoutId);
        if (cancelado) return;
        docRef.current = doc;
        await renderizar(doc);
      } catch (e) {
        clearTimeout(timeoutId);
        console.error(e);
        if (cancelado) return;
        if (e?.message === "TIMEOUT_CARREGAMENTO") {
          setErro("Demorou demais pra carregar. Verifique sua internet e tente de novo.");
        } else if (!navigator.onLine) {
          setErro(
            "Sem internet, e essa cifra ainda não está salva neste aparelho. Conecte-se e tente de novo."
          );
        } else {
          setErro("Não foi possível abrir o PDF. Tente de novo.");
        }
      }
    };

    (async () => {
      const { data: m, error } = await supabase
        .from("musicas")
        .select("id, nome, artista, cifra_path, cifra_paginas, cifra_versao, favorito")
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

      if (m.cifra_paginas > 0) {
        // Cifra já tem as páginas convertidas em imagem (geradas no upload,
        // na aba Músicas) — abre quase instantâneo, sem processar PDF
        // nenhum neste aparelho. Se alguma imagem estiver quebrada, cai
        // pro PDF direto em vez de deixar a tela vazia.
        mostrarImagensProntas(m, () => {
          if (!cancelado) carregarViaPdf(m);
        });
        return;
      }

      await carregarViaPdf(m);
    })();

    return () => {
      cancelado = true;
      clearTimeout(timeoutId);
      docRef.current?.destroy?.();
      // Sem isso, um render que dispare logo depois da troca de música
      // ainda vê o doc antigo (já destruído) e chama getPage nele, travando
      // "Carregando cifra..." pra sempre na música nova
      docRef.current = null;
      limparPaginas(containerAtual);
    };
  }, [sessao, id, tentativa]);

  // --- Zoom mudou → ajusta a velocidade proporcionalmente (com um pequeno
  // atraso pra não acumular erro de arredondamento a cada frame de um
  // pinça), senão a mesma velocidade em px/s passa a rolar por menos (ou
  // mais) música por segundo conforme o tamanho do conteúdo muda ---
  useEffect(() => {
    const timer = setTimeout(() => {
      const anterior = zoomAnteriorRef.current;
      if (anterior && anterior !== zoom) {
        setVelocidade((v) => {
          const nova = Math.round(v * (zoom / anterior));
          return Math.min(VELOCIDADE_MAX, Math.max(VELOCIDADE_MIN, nova));
        });
      }
      zoomAnteriorRef.current = zoom;
    }, 150);
    return () => clearTimeout(timer);
  }, [zoom]);

  // --- Loop da rolagem automática ---
  useEffect(() => {
    let rafId;
    let ultimoT = null;
    // Acumula frações de pixel: em velocidades baixas o avanço por quadro
    // é < 1px e seria perdido no arredondamento do scrollTop
    let acumulado = 0;

    const passo = (t) => {
      // Pausa a rolagem (sem acumular pixels) enquanto o PDF está sendo
      // renderizado — sem essa trava a "chegada ao fim" disparava falso
      // positivo (ou os pixels acumulados causavam um salto quando o
      // conteúdo novo aparecesse)
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

  // --- Favorito (estrela) ---
  const alternarFavorito = async () => {
    if (!musica) return;
    const novoValor = !musica.favorito;
    setMusica((m) => ({ ...m, favorito: novoValor })); // otimista
    const { error } = await supabase.from("musicas").update({ favorito: novoValor }).eq("id", id);
    if (error) {
      console.error(error);
      setMusica((m) => ({ ...m, favorito: !novoValor })); // desfaz se der erro
    }
  };

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

  return (
    <div className={`${ALTURA_TELA_CLASSE} flex flex-col`}>
      {/* Barra superior — controles numa linha, título/artista embaixo.
          Tamanhos crescem em telas maiores (md: = tablet) pra aproveitar o
          espaço que sobra num celular fica menor, num tablet fica maior. */}
      <header className="border-b border-noir-800 bg-noir-900/90 shrink-0 px-3 py-3 md:px-6 md:py-5">
        <div className="grid grid-cols-3 items-center gap-2 md:gap-4">
          <div className="justify-self-start">
            <Link
              to="/admin?aba=cifras"
              className="shrink-0 h-14 md:h-20 px-4 md:px-6 flex items-center rounded-xl border border-noir-700 text-cream-muted text-base md:text-xl font-medium hover:text-gold-300 hover:border-gold-600 transition"
            >
              ‹ Voltar
            </Link>
          </div>

          {!erro && (
            <>
              <div className="flex items-center gap-2 md:gap-3 justify-self-center">
                <button
                  onClick={() =>
                    setVelocidade((v) => Math.max(VELOCIDADE_MIN, v - VELOCIDADE_PASSO))
                  }
                  aria-label="Mais devagar"
                  className="w-10 h-10 md:w-16 md:h-16 rounded-lg border border-noir-700 text-cream text-lg md:text-2xl hover:border-gold-600 transition"
                >
                  −
                </button>

                <button
                  onClick={() => setRodando((r) => !r)}
                  aria-label={rodando ? "Pausar" : "Rolar"}
                  className="btn-gold w-14 h-14 md:w-20 md:h-20 rounded-2xl text-2xl md:text-4xl"
                >
                  {rodando ? "❚❚" : "▶"}
                </button>

                <button
                  onClick={() =>
                    setVelocidade((v) => Math.min(VELOCIDADE_MAX, v + VELOCIDADE_PASSO))
                  }
                  aria-label="Mais rápido"
                  className="w-10 h-10 md:w-16 md:h-16 rounded-lg border border-noir-700 text-cream text-lg md:text-2xl hover:border-gold-600 transition"
                >
                  +
                </button>
              </div>

              <div
                className="flex items-center gap-2 md:gap-3 justify-self-end"
                title={
                  resolucaoLimitada
                    ? "Nitidez reduzida neste zoom para não travar em aparelhos mais fracos"
                    : undefined
                }
              >
                <button
                  onClick={() => setZoom((z) => Math.max(ZOOM_MIN, +(z - 0.15).toFixed(2)))}
                  aria-label="Diminuir zoom"
                  className="w-10 h-10 md:w-16 md:h-16 rounded-lg border border-noir-700 text-cream text-lg md:text-2xl hover:border-gold-600 transition"
                >
                  A−
                </button>
                <button
                  onClick={() => setZoom((z) => Math.min(ZOOM_MAX, +(z + 0.15).toFixed(2)))}
                  aria-label="Aumentar zoom"
                  className="w-10 h-10 md:w-16 md:h-16 rounded-lg border border-noir-700 text-cream text-lg md:text-2xl hover:border-gold-600 transition"
                >
                  A+
                </button>
              </div>
            </>
          )}
        </div>

        <div className="gold-rule my-3 md:my-4" />

        <div className="flex items-center justify-center gap-2 px-1">
          <button
            onClick={alternarFavorito}
            aria-label={musica?.favorito ? "Remover dos favoritos" : "Marcar como favorita"}
            className={`shrink-0 text-xl md:text-2xl leading-none transition ${
              musica?.favorito ? "text-gold-400" : "text-noir-600 hover:text-gold-300"
            }`}
          >
            {musica?.favorito ? "★" : "☆"}
          </button>
          <div className="min-w-0 truncate">
            <span className="font-display text-gold-300 text-base md:text-xl tracking-wide">
              {musica?.nome}
            </span>
            {musica?.artista && (
              <>
                <span className="text-cream-muted mx-2">—</span>
                <span className="text-cream-muted italic text-base md:text-xl">
                  {musica.artista}
                </span>
              </>
            )}
          </div>
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
            pinchRef.current = {
              distancia: distanciaEntreToques(e.touches),
              zoomBase: zoom,
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
            pinchRef.current = {
              distancia: distanciaEntreToques(e.touches),
              zoomBase: zoom,
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
          // Como o zoom agora só redimensiona imagens já prontas via CSS
          // (não recria canvas), pode aplicar direto a cada frame do
          // gesto — instantâneo, linear, sem custo de re-renderização
          setZoom(novoZoom);
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
          <div className="text-center py-16 px-4">
            <p className="text-cream-muted mb-4">{erro}</p>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setTentativa((t) => t + 1);
              }}
              className="btn-gold px-5 py-2.5 rounded-xl text-sm"
            >
              🔄 Tentar de novo
            </button>
          </div>
        ) : (
          <>
            {renderizando && (
              <p className="text-cream-muted text-center py-8 text-sm">
                {progresso.total > 0
                  ? `Preparando página ${progresso.atual} de ${progresso.total}...`
                  : "Carregando cifra..."}
              </p>
            )}
            <div ref={paginasRef} className="mx-auto" style={{ width: `${zoom * 100}%` }} />
            <div className="h-[40vh]" /> {/* respiro para terminar a música */}
          </>
        )}
      </div>
    </div>
  );
}
