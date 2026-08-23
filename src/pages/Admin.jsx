import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { supabase, supabaseConfigured } from "../lib/supabase";
import {
  assinarDownloadCifras,
  baixarCifrasEmCache,
  cancelarDownloadCifras,
  estadoDownloadCifras,
} from "../lib/cifraCache";
import Afinador from "../components/Afinador";
import { GOATCOUNTER_CODE } from "../config";
import { buscarMusicasApi, existeNoItunes, buscarPreview } from "../lib/preview";
import { normalizarNome } from "../lib/texto";

const BASE = import.meta.env.BASE_URL;

// Sobe uma imagem de página de cifra, com até 3 tentativas:
// - Se já existir um arquivo nesse caminho (de uma tentativa anterior que
//   parou no meio), remove e tenta de novo — usar upsert:true em vez disso
//   esbarrava numa política de RLS do Storage ("new row violates
//   row-level security policy"). Só remove quando o upload direto falhar
//   por já existir, pra não apagar um arquivo bom antes de confirmar que
//   o novo upload vai dar certo.
// - Se for um erro transitório do servidor (502/503/504 Bad
//   Gateway/indisponível), espera um pouco e tenta de novo — geralmente
//   passa numa segunda tentativa.
const subirImagemPagina = async (path, blob) => {
  let resultado;
  for (let tentativa = 1; tentativa <= 3; tentativa++) {
    resultado = await supabase.storage
      .from("cifras")
      .upload(path, blob, { contentType: "image/jpeg" });
    if (!resultado.error) return resultado;

    const msg = resultado.error.message ?? "";
    if (msg.includes("already exists")) {
      await supabase.storage.from("cifras").remove([path]);
    } else if (/\b50[0-4]\b/.test(msg) && tentativa < 3) {
      await new Promise((r) => setTimeout(r, 1000 * tentativa));
    } else {
      break; // erro definitivo — não vale a pena repetir
    }
  }
  return resultado;
};

// Caminho da imagem de uma página, com "versão" embutida no nome. Sem essa
// versão, reprocessar uma cifra reaproveitaria o mesmo nome de arquivo de
// antes — e o cache CacheFirst do navegador continuaria servindo pra
// sempre a resposta antiga (ou corrompida, de uma tentativa que falhou no
// meio), mesmo depois do arquivo certo já estar no Storage.
const caminhoImagemPagina = (musicaId, versao, pagina) => `${musicaId}-imgs${versao}-p${pagina}.jpg`;

export default function Admin() {
  const [sessao, setSessao] = useState(null);
  const [verificando, setVerificando] = useState(true);

  useEffect(() => {
    if (!supabaseConfigured) {
      setVerificando(false);
      return;
    }

    supabase.auth.getSession().then(({ data }) => {
      setSessao(data.session);
      setVerificando(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_evento, s) => {
      setSessao(s);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  return (
    <div className="min-h-screen">
      <div className="max-w-3xl mx-auto px-5 py-8">
        <header className="flex items-center justify-between mb-8">
          <Link to="/" className="flex items-center gap-3 group">
            <img
              src={`${BASE}img/logo-circle.png`}
              alt="Duo Mariel"
              className="w-12 h-12 rounded-full border border-noir-700 group-hover:border-gold-500 transition"
            />
            <span className="section-title text-sm">Área do músico</span>
          </Link>

          {sessao && (
            <button
              onClick={() => supabase.auth.signOut()}
              className="text-xs text-cream-muted hover:text-gold-300 transition"
            >
              Sair
            </button>
          )}
        </header>

        {!supabaseConfigured ? (
          <AvisoNaoConfigurado />
        ) : verificando ? (
          <p className="text-cream-muted text-center py-10">Verificando acesso...</p>
        ) : !sessao ? (
          <Login />
        ) : (
          <Painel />
        )}
      </div>
    </div>
  );
}

function AvisoNaoConfigurado() {
  return (
    <div className="border border-noir-700 rounded-2xl p-6 bg-noir-900/50 text-cream-muted text-sm leading-relaxed">
      <p className="text-cream mb-2">⚙️ Supabase ainda não configurado.</p>
      <p>
        Defina <code className="text-gold-300">VITE_SUPABASE_URL</code> e{" "}
        <code className="text-gold-300">VITE_SUPABASE_ANON_KEY</code> no arquivo{" "}
        <code className="text-gold-300">.env</code> (veja o README).
      </p>
    </div>
  );
}

function Login() {
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState("");
  const [entrando, setEntrando] = useState(false);

  const entrar = async (e) => {
    e.preventDefault();
    setErro("");
    setEntrando(true);

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password: senha,
    });

    if (error) {
      console.error("Erro de login:", error);
      setErro(
        error.message === "Invalid login credentials"
          ? "E-mail ou senha inválidos."
          : `Erro: ${error.message}`
      );
    }
    setEntrando(false);
  };

  return (
    <form
      onSubmit={entrar}
      className="max-w-sm mx-auto border border-noir-700 rounded-2xl p-6 bg-noir-900/50"
    >
      <h1 className="section-title text-lg mb-1 text-center">Entrar</h1>
      <p className="text-xs text-cream-muted text-center mb-6">
        Acesso restrito aos integrantes do duo.
      </p>

      <label className="block text-sm text-cream-muted mb-1">E-mail</label>
      <input
        type="email"
        className="input-noir mb-4"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        autoComplete="email"
        required
      />

      <label className="block text-sm text-cream-muted mb-1">Senha</label>
      <input
        type="password"
        className="input-noir mb-4"
        value={senha}
        onChange={(e) => setSenha(e.target.value)}
        autoComplete="current-password"
        required
      />

      {erro && <p className="text-red-400 text-sm mb-4">{erro}</p>}

      <button type="submit" className="btn-gold w-full py-3 rounded-xl" disabled={entrando}>
        {entrando ? "Entrando..." : "Entrar"}
      </button>
    </form>
  );
}

// Abas agrupadas no "Menu" — tudo que não é Cifras/Pedidos
// (o valor de cada uma também é a chave do ícone em <Icone nome={valor} />)
const ABAS_OUTROS = [
  ["afinador", "Afinador"],
  ["agenda", "Agenda"],
  ["aprender", "Aprender"],
  ["evento", "Playlist especial"],
  ["gorjeta", "Gorjeta"],
  ["musicas", "Músicas"],
  ["ocultar", "Ocultar"],
  ["playlists", "Playlists"],
  ["teste-acompanhamento", "Acompanhamento (teste)"],
  ["videos", "Vídeos"],
];

// Ícones em traço fino (respeitam a cor do site via currentColor) — emojis
// coloridos não servem aqui porque a fonte de emoji ignora CSS de cor
function Icone({ nome, className = "w-5 h-5" }) {
  const props = {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    className,
  };
  switch (nome) {
    case "cifras":
      return (
        <svg {...props}>
          <path d="M6 3h9l3 3v15H6z" />
          <path d="M15 3v3h3" />
          <line x1="9" y1="11" x2="15" y2="11" />
          <line x1="9" y1="14" x2="15" y2="14" />
          <line x1="9" y1="17" x2="13" y2="17" />
        </svg>
      );
    case "pedidos":
      return (
        <svg {...props}>
          <path d="M4 5h16v10H9l-5 4z" />
        </svg>
      );
    case "menu":
      return (
        <svg {...props}>
          <line x1="4" y1="7" x2="20" y2="7" />
          <line x1="4" y1="12" x2="20" y2="12" />
          <line x1="4" y1="17" x2="20" y2="17" />
        </svg>
      );
    case "afinador":
      return (
        <svg {...props}>
          <line x1="6" y1="4" x2="6" y2="20" />
          <circle cx="6" cy="9" r="2" />
          <line x1="12" y1="4" x2="12" y2="20" />
          <circle cx="12" cy="15" r="2" />
          <line x1="18" y1="4" x2="18" y2="20" />
          <circle cx="18" cy="7" r="2" />
        </svg>
      );
    case "agenda":
      return (
        <svg {...props}>
          <rect x="4" y="5" width="16" height="15" rx="2" />
          <line x1="4" y1="10" x2="20" y2="10" />
          <line x1="8" y1="3" x2="8" y2="7" />
          <line x1="16" y1="3" x2="16" y2="7" />
        </svg>
      );
    case "aprender":
      return (
        <svg {...props}>
          <path d="M12 6c-2-1.5-5-2-8-1v13c3-1 6-0.5 8 1 2-1.5 5-2 8-1V5c-3-1-6-0.5-8 1z" />
          <line x1="12" y1="6" x2="12" y2="19" />
        </svg>
      );
    case "musicas":
      return (
        <svg {...props}>
          <circle cx="7" cy="17" r="2.3" />
          <circle cx="16" cy="15" r="2.3" />
          <line x1="9.3" y1="17" x2="9.3" y2="5" />
          <line x1="18.3" y1="15" x2="18.3" y2="7" />
          <line x1="9.3" y1="5" x2="18.3" y2="7" />
        </svg>
      );
    case "videos":
      return (
        <svg {...props}>
          <rect x="3" y="5" width="18" height="14" rx="2" />
          <path d="M10 9l6 3-6 3z" fill="currentColor" stroke="none" />
        </svg>
      );
    case "acessos":
      return (
        <svg {...props}>
          <line x1="5" y1="20" x2="5" y2="10" />
          <line x1="12" y1="20" x2="12" y2="5" />
          <line x1="19" y1="20" x2="19" y2="13" />
          <line x1="3" y1="20" x2="21" y2="20" />
        </svg>
      );
    case "mudar":
      return (
        <svg {...props}>
          <path d="M4 6h4l9 12h3" />
          <path d="M4 18h4l3-4" />
          <path d="M14 8l3-2" />
          <path d="M17 6v3h-3" />
          <path d="M17 18v-3h-3" />
        </svg>
      );
    case "olho":
      return (
        <svg {...props}>
          <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7z" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      );
    case "anexo":
      return (
        <svg {...props}>
          <path d="M17 8.5l-7.5 7.5a3 3 0 004.24 4.24l8-8a5 5 0 00-7.07-7.07l-8 8a7 7 0 009.9 9.9" />
        </svg>
      );
    case "reprocessar":
      return (
        <svg {...props}>
          <path d="M4 12a8 8 0 0114-5.3M20 4v5h-5" />
          <path d="M20 12a8 8 0 01-14 5.3M4 20v-5h5" />
        </svg>
      );
    case "buscar":
      return (
        <svg {...props}>
          <circle cx="11" cy="11" r="7" />
          <line x1="21" y1="21" x2="16.5" y2="16.5" />
        </svg>
      );
    case "arquivo":
      return (
        <svg {...props}>
          <rect x="3" y="4" width="18" height="5" rx="1" />
          <path d="M5 9v9a2 2 0 002 2h10a2 2 0 002-2V9" />
          <line x1="10" y1="13" x2="14" y2="13" />
        </svg>
      );
    case "camera":
      return (
        <svg {...props}>
          <path d="M4 8h3l1.5-2h7L17 8h3a1 1 0 011 1v10a1 1 0 01-1 1H4a1 1 0 01-1-1V9a1 1 0 011-1z" />
          <circle cx="12" cy="13" r="3.5" />
        </svg>
      );
    case "gorjeta":
      return (
        <svg {...props}>
          <path d="M12 20s-7-4.35-9.5-8.5C.9 8.2 2.6 4.5 6 4.5c2 0 3.4 1.1 6 3.6 2.6-2.5 4-3.6 6-3.6 3.4 0 5.1 3.7 3.5 7-2.5 4.15-9.5 8.5-9.5 8.5z" />
        </svg>
      );
    case "ocultar":
      return (
        <svg {...props}>
          <path d="M3 3l18 18" />
          <path d="M10.6 5.1A10.6 10.6 0 0112 5c6.4 0 10 7 10 7a17.5 17.5 0 01-3.7 4.6M6.6 6.6C3.7 8.4 2 12 2 12s3.6 7 10 7c1.4 0 2.7-.3 3.8-.8" />
          <path d="M9.9 10a3 3 0 004.1 4.1" />
        </svg>
      );
    case "mais":
      return (
        <svg {...props}>
          <circle cx="12" cy="12" r="9" />
          <line x1="12" y1="8" x2="12" y2="16" />
          <line x1="8" y1="12" x2="16" y2="12" />
        </svg>
      );
    case "playlists":
      return (
        <svg {...props}>
          <circle cx="4" cy="6" r="1.3" fill="currentColor" stroke="none" />
          <line x1="8" y1="6" x2="20" y2="6" />
          <circle cx="4" cy="12" r="1.3" fill="currentColor" stroke="none" />
          <line x1="8" y1="12" x2="20" y2="12" />
          <circle cx="4" cy="18" r="1.3" fill="currentColor" stroke="none" />
          <line x1="8" y1="18" x2="16" y2="18" />
        </svg>
      );
    case "evento":
      return (
        <svg {...props}>
          <path d="M12 3l2.9 6.5 7.1.7-5.3 4.7 1.5 6.9-6.2-3.7-6.2 3.7 1.5-6.9L2 10.2l7.1-.7z" />
        </svg>
      );
    case "teste-acompanhamento":
      return (
        <svg {...props}>
          <rect x="9" y="2.5" width="6" height="11" rx="3" />
          <path d="M5 11a7 7 0 0014 0" />
          <line x1="12" y1="18" x2="12" y2="21" />
          <line x1="8.5" y1="21" x2="15.5" y2="21" />
        </svg>
      );
    default:
      return null;
  }
}

// Checkbox com aparência própria (noir + dourado) — o checkbox nativo do
// navegador (caixa branca, marca de sistema) destoa muito da paleta escura
// do site. Continua sendo um <input type="checkbox"> de verdade por baixo
// (mantém teclado, leitor de tela e clique no <label> funcionando), só
// escondido visualmente — o quadrado e o ✓ por cima são desenhados à mão,
// no mesmo estilo de traço fino dos outros ícones.
function CaixaMarcar({ checked, onChange, className = "" }) {
  return (
    <span className={`relative inline-flex shrink-0 w-5 h-5 ${className}`}>
      <input type="checkbox" className="peer sr-only" checked={checked} onChange={onChange} />
      <span
        className="block w-5 h-5 rounded-md border border-noir-600 bg-noir-900 transition-colors
          peer-checked:bg-gold-500 peer-checked:border-gold-500
          peer-focus-visible:ring-2 peer-focus-visible:ring-gold-500/50"
      />
      <svg
        viewBox="0 0 24 24"
        fill="none"
        strokeWidth={3.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="pointer-events-none absolute inset-0 m-auto w-3 h-3 stroke-noir-900 opacity-0 peer-checked:opacity-100 transition-opacity"
      >
        <polyline points="20 6 9 17 4 12" />
      </svg>
    </span>
  );
}

function Painel() {
  const [searchParams] = useSearchParams();
  const [aba, setAba] = useState(searchParams.get("aba") || "cifras");
  const [pendentes, setPendentes] = useState(0);
  const [pedidoNovo, setPedidoNovo] = useState(null);
  const [menuOutrosAberto, setMenuOutrosAberto] = useState(false);
  const [cifraPorNome, setCifraPorNome] = useState({});
  const navigate = useNavigate();

  // Mapa nome→cifra, pro botão "Ver cifra" no pop-up de pedido novo (fica
  // disponível em qualquer aba, não só na de Pedidos)
  useEffect(() => {
    supabase
      .from("musicas")
      .select("id, nome")
      .or("cifra_path.not.is.null,cifra_cho.not.is.null")
      .then(({ data, error }) => {
        if (error) return;
        const mapa = {};
        for (const m of data ?? []) mapa[normalizarNome(m.nome)] = m.id;
        setCifraPorNome(mapa);
      });
  }, []);

  // "Músicas" sempre em primeiro; o resto, alfabético
  const abasOutros = (
    GOATCOUNTER_CODE ? [...ABAS_OUTROS, ["acessos", "Acessos"]] : ABAS_OUTROS
  )
    .slice()
    .sort((a, b) => a[1].localeCompare(b[1], "pt-BR"))
    .sort((a, b) => (a[0] === "musicas" ? -1 : b[0] === "musicas" ? 1 : 0));
  const estaEmOutros = abasOutros.some(([valor]) => valor === aba);

  const contarPendentes = async () => {
    const { count, error } = await supabase
      .from("pedidos")
      .select("*", { count: "exact", head: true })
      .eq("atendido", false)
      .eq("ignorado", false);
    if (!error) setPendentes(count ?? 0);
  };

  useEffect(() => {
    contarPendentes();
    const timer = setInterval(contarPendentes, 20_000);
    return () => clearInterval(timer);
  }, []);

  // Avisa em tempo real quando um pedido novo chega, em qualquer aba do
  // painel (requer o Realtime ligado na tabela "pedidos" no Supabase)
  useEffect(() => {
    const canal = supabase
      .channel("pedidos-novos")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "pedidos" },
        ({ new: novo }) => {
          setPedidoNovo(novo);
          contarPendentes();
        }
      )
      .subscribe((status, err) => {
        // Se o Realtime não estiver habilitado na tabela "pedidos" (Database
        // > Replication, no painel do Supabase), a inscrição fica "fechada"
        // silenciosamente — sem isso no console, é difícil descobrir por quê
        // o pop-up de pedido novo nunca aparece.
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          console.warn(
            `Realtime de pedidos não conectou (${status}). Verifique se a` +
              ` tabela "pedidos" tem Realtime habilitado no Supabase.`,
            err
          );
        }
      });
    return () => supabase.removeChannel(canal);
  }, []);

  return (
    <div>
      {pedidoNovo && (
        <NovoPedidoPopup
          pedido={pedidoNovo}
          cifraId={cifraPorNome[normalizarNome(nomeDoPedido(pedidoNovo.pedido))]}
          onFechar={() => setPedidoNovo(null)}
          onVerPedidos={() => {
            setPedidoNovo(null);
            setAba("pedidos");
          }}
          onVerCifra={(id) => {
            setPedidoNovo(null);
            navigate(`/cifra/${id}`);
          }}
        />
      )}

      <div className="flex flex-wrap gap-2 mb-6 items-center">
        <AbaBotao ativa={aba === "cifras"} onClick={() => setAba("cifras")}>
          <span className="inline-flex items-center gap-2">
            <Icone nome="cifras" className="w-5 h-5 text-gold-400" />
            Cifras
          </span>
        </AbaBotao>
        <AbaBotao ativa={aba === "pedidos"} onClick={() => setAba("pedidos")}>
          <span className="inline-flex items-center gap-2">
            <Icone nome="pedidos" className="w-5 h-5 text-gold-400" />
            Pedidos
            {pendentes > 0 && (
              <span className="inline-flex items-center justify-center min-w-5 h-5 px-1.5 rounded-full bg-gold-500 text-noir-900 text-[11px] font-semibold">
                {pendentes}
              </span>
            )}
          </span>
        </AbaBotao>

        <div className="relative ml-auto">
          <AbaBotao
            ativa={estaEmOutros}
            onClick={() => setMenuOutrosAberto((v) => !v)}
            className="px-8 py-3 text-xl"
          >
            <span className="inline-flex items-center gap-2">
              <Icone nome="menu" className="w-6 h-6 text-gold-400" />
              Menu ▾
            </span>
          </AbaBotao>
          {menuOutrosAberto && (
            <>
              {/* Captura o clique fora do menu pra fechar */}
              <div className="fixed inset-0 z-10" onClick={() => setMenuOutrosAberto(false)} />
              <div className="absolute right-0 mt-2 w-48 rounded-xl border border-noir-700 bg-noir-900 shadow-xl z-20 overflow-hidden">
                {abasOutros.map(([valor, rotulo]) => (
                  <button
                    key={valor}
                    onClick={() => {
                      setMenuOutrosAberto(false);
                      // Não é uma aba do painel, é uma página própria (rota separada)
                      if (valor === "teste-acompanhamento") {
                        navigate("/teste-acompanhamento");
                        return;
                      }
                      setAba(valor);
                    }}
                    className={`w-full text-left px-4 py-2.5 text-sm transition flex items-center gap-2.5 ${
                      valor === "musicas" ? "font-semibold" : ""
                    } ${
                      aba === valor
                        ? "text-gold-300 bg-noir-800"
                        : "text-cream-muted hover:bg-noir-800 hover:text-cream"
                    }`}
                  >
                    <Icone nome={valor} className="w-4 h-4 text-gold-400 shrink-0" />
                    {rotulo}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {aba === "musicas" && <GerenciarMusicas />}
      {aba === "cifras" && <AbaCifras />}
      {aba === "aprender" && <GerenciarSugestoes />}
      {aba === "agenda" && <GerenciarAgenda />}
      {aba === "evento" && <AbaEventoCliente />}
      {aba === "afinador" && <Afinador />}
      {aba === "videos" && <GerenciarVideos />}
      {aba === "gorjeta" && <AbaGorjeta />}
      {aba === "ocultar" && <AbaOcultar />}
      {aba === "playlists" && <AbaPlaylists />}
      {aba === "pedidos" && (
        <GerenciarPedidos onMudanca={contarPendentes} cifraPorNome={cifraPorNome} />
      )}
      {aba === "acessos" && <AbaAcessos />}
    </div>
  );
}

// Aviso no centro da tela quando um pedido novo chega (via Realtime)
function NovoPedidoPopup({ pedido, cifraId, onFechar, onVerPedidos, onVerCifra }) {
  useEffect(() => {
    // some sozinho depois de um tempo, se ninguém interagir
    const timer = setTimeout(onFechar, 15_000);
    return () => clearTimeout(timer);
  }, [onFechar]);

  const ehSugestao = pedido.pedido.startsWith(PREFIXO_SUGESTAO);
  const ehOculta = pedido.pedido.startsWith(PREFIXO_OCULTA);

  return (
    <div
      className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center z-[60] p-4"
      onClick={onFechar}
    >
      <div
        className="w-full max-w-sm rounded-2xl border border-gold-600 bg-noir-900 p-6 text-center"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-4xl mb-2">🎶</p>
        <h3 className="section-title text-base mb-1">Pedido novo chegou!</h3>
        <p className="text-cream text-lg mt-3 break-words">{limparPrefixoPedido(pedido.pedido)}</p>
        {ehSugestao && (
          <p className="text-gold-300 text-xs mt-1 uppercase tracking-wider">
            fora do repertório
          </p>
        )}
        {ehOculta && (
          <p className="text-cream-muted text-xs mt-1 uppercase tracking-wider">
            🙈 já é nossa, só oculta
          </p>
        )}
        {pedido.mensagem && (
          <p className="text-cream-muted mt-2 break-words">💬 {pedido.mensagem}</p>
        )}

        <div className="mt-5 flex gap-3 justify-center flex-wrap">
          <button
            onClick={onFechar}
            className="px-4 py-2 rounded-xl bg-noir-800 border border-noir-700 hover:bg-noir-700 text-sm transition"
          >
            Fechar
          </button>
          {cifraId && (
            <button
              onClick={() => onVerCifra(cifraId)}
              className="px-4 py-2 rounded-xl border border-gold-600 text-gold-300 hover:bg-noir-800 text-sm transition inline-flex items-center gap-1.5"
            >
              <Icone nome="cifras" className="w-4 h-4" />
              Ver cifra
            </button>
          )}
          <button onClick={onVerPedidos} className="btn-gold px-5 py-2 rounded-xl text-sm">
            Ver pedidos
          </button>
        </div>
      </div>
    </div>
  );
}

function AbaBotao({ ativa, onClick, children, className = "" }) {
  return (
    <button
      onClick={onClick}
      className={`px-[26px] py-2.5 rounded-xl text-lg tracking-wide transition border ${
        ativa
          ? "btn-gold border-transparent"
          : "border-noir-700 text-cream-muted hover:text-cream hover:border-noir-600"
      } ${className}`}
    >
      {children}
    </button>
  );
}

/* ------------------------- MÚSICAS ------------------------- */

function GerenciarMusicas() {
  const [musicas, setMusicas] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [filtro, setFiltro] = useState("");
  const [form, setForm] = useState({ nome: "", artista: "", estilo: "" });
  const [editandoId, setEditandoId] = useState(null);
  const [status, setStatus] = useState("");
  const [enviandoCifraId, setEnviandoCifraId] = useState(null);
  const [filtroCifra, setFiltroCifra] = useState("todas"); // todas | com | sem
  const [musicaParaTrocarItunes, setMusicaParaTrocarItunes] = useState(null);

  // --- Checagem no iTunes (resultado fica salvo no navegador) ---
  const [filtroItunes, setFiltroItunes] = useState(false);
  const [verificandoItunes, setVerificandoItunes] = useState(null); // "x/y" durante a checagem
  const [itunesMap, setItunesMap] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("itunes-check-v1")) ?? {};
    } catch {
      return {};
    }
  });

  const chaveItunes = (m) => `${m.nome}|${m.artista}`.toLowerCase();

  const verificarItunes = async () => {
    // Só consulta o que ainda não foi checado; para rechecar tudo, limpar o cache
    const pendentes = musicas.filter((m) => itunesMap[chaveItunes(m)] === undefined);
    if (pendentes.length === 0 && musicas.length > 0) {
      if (window.confirm("Todas já foram checadas. Rechecar do zero?")) {
        localStorage.removeItem("itunes-check-v1");
        setItunesMap({});
      }
      return;
    }
    const mapa = { ...itunesMap };
    for (const [i, m] of pendentes.entries()) {
      setVerificandoItunes(`${i + 1}/${pendentes.length}`);
      const achou = await existeNoItunes(m.nome, m.artista);
      if (achou !== null) {
        mapa[chaveItunes(m)] = achou;
        setItunesMap({ ...mapa });
        localStorage.setItem("itunes-check-v1", JSON.stringify(mapa));
      }
      // Pausa entre chamadas para não estourar o limite da API
      await new Promise((r) => setTimeout(r, 350));
    }
    setVerificandoItunes(null);
  };

  // --- Autocomplete via iTunes (opcional; digitar manualmente sempre funciona) ---
  const [sugestoesApi, setSugestoesApi] = useState([]);
  const [buscandoApi, setBuscandoApi] = useState(false);
  const escolhaRef = useState({ atual: "" })[0];
  // Descarta resultados de buscas antigas que respondam fora de ordem
  const buscaApiRef = useRef(0);

  useEffect(() => {
    const q = form.nome.trim();
    // Não busca ao editar, com texto curto ou logo após escolher uma sugestão
    if (editandoId || q.length < 3 || q === escolhaRef.atual) {
      setSugestoesApi([]);
      setBuscandoApi(false);
      return;
    }
    setBuscandoApi(true);
    const minhaBusca = ++buscaApiRef.current;
    const timer = setTimeout(async () => {
      const resultados = await buscarMusicasApi(q);
      if (buscaApiRef.current !== minhaBusca) return;
      setSugestoesApi(resultados);
      setBuscandoApi(false);
    }, 450);
    return () => clearTimeout(timer);
  }, [form.nome, editandoId, escolhaRef]);

  const usarSugestao = (s) => {
    escolhaRef.atual = s.nome;
    setForm({ nome: s.nome, artista: s.artista, estilo: s.estilo });
    setSugestoesApi([]);
  };

  const carregar = async () => {
    setCarregando(true);
    // Só as colunas que esta aba de fato usa — cifra_cho pode ter alguns KB
    // de texto por música, e select("*") trazia isso (e mais) toda vez que
    // a aba recarregava, mesmo só usando cifra_cho como booleano aqui
    const { data, error } = await supabase
      .from("musicas")
      .select("id, nome, artista, estilo, cifra_path, cifra_paginas, cifra_versao, cifra_cho")
      .order("nome")
      .order("artista");
    if (!error) setMusicas(data ?? []);
    setCarregando(false);
  };

  useEffect(() => {
    carregar();
  }, []);

  const salvar = async (e) => {
    e.preventDefault();
    const registro = {
      nome: form.nome.trim(),
      artista: form.artista.trim(),
      estilo: form.estilo.trim() || null,
    };
    if (!registro.nome || !registro.artista) return;

    setStatus("⏳ Salvando...");

    const { error } = editandoId
      ? await supabase.from("musicas").update(registro).eq("id", editandoId)
      : await supabase.from("musicas").insert(registro);

    if (error) {
      console.error(error);
      setStatus("❌ Erro ao salvar. Tente novamente.");
      return;
    }

    setForm({ nome: "", artista: "", estilo: "" });
    setEditandoId(null);
    escolhaRef.atual = "";
    setStatus(editandoId ? "✅ Música atualizada!" : "✅ Música adicionada!");
    setTimeout(() => setStatus(""), 2500);
    carregar();
  };

  const editar = (m) => {
    setEditandoId(m.id);
    setForm({ nome: m.nome, artista: m.artista, estilo: m.estilo ?? "" });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const cancelarEdicao = () => {
    setEditandoId(null);
    setForm({ nome: "", artista: "", estilo: "" });
  };

  // Lista todos os arquivos de uma cifra no Storage: o PDF original e as
  // imagens pré-renderizadas de cada página (se existirem)
  const arquivosDaCifra = (m) => {
    const arquivos = [];
    if (m.cifra_path) arquivos.push(m.cifra_path);
    if (m.cifra_versao) {
      for (let i = 1; i <= (m.cifra_paginas || 0); i++) {
        arquivos.push(caminhoImagemPagina(m.id, m.cifra_versao, i));
      }
    }
    return arquivos;
  };

  const excluir = async (m) => {
    if (!window.confirm(`Excluir "${m.nome} — ${m.artista}"?${m.cifra_path || m.cifra_cho ? "\nA cifra também será apagada." : ""}`)) return;
    const { error } = await supabase.from("musicas").delete().eq("id", m.id);
    if (error) {
      console.error(error);
      setStatus("❌ Erro ao excluir.");
      return;
    }
    const arquivos = arquivosDaCifra(m);
    if (arquivos.length > 0) {
      await supabase.storage.from("cifras").remove(arquivos);
    }
    carregar();
  };

  // Reatribui nome/artista/estilo a partir de outro resultado do iTunes —
  // útil quando o match automático veio errado (nome parecido, artista
  // diferente) e precisa trocar sem refazer o cadastro do zero
  const confirmarTrocaItunes = async ({ nome, artista, estilo }) => {
    const { error } = await supabase
      .from("musicas")
      .update({ nome, artista, estilo: estilo || null })
      .eq("id", musicaParaTrocarItunes.id);
    if (error) {
      console.error(error);
      setStatus("❌ Erro ao trocar dados do iTunes.");
      return;
    }
    setStatus(`✅ "${nome}" atualizada!`);
    setTimeout(() => setStatus(""), 2500);
    setMusicaParaTrocarItunes(null);
    carregar();
  };

  const enviarCifra = async (m, arquivo) => {
    if (!arquivo) return;
    if (arquivo.type !== "application/pdf") {
      setStatus("❌ Envie um arquivo PDF.");
      return;
    }

    setEnviandoCifraId(m.id);
    setStatus("⏳ Enviando cifra...");

    // Nome com timestamp para o cache offline pegar a versão nova ao substituir
    const prefixo = `${m.id}-${Date.now()}`;
    const path = `${prefixo}.pdf`;
    const { error: upError } = await supabase.storage
      .from("cifras")
      .upload(path, arquivo, { contentType: "application/pdf" });

    if (upError) {
      console.error(upError);
      setStatus("❌ Erro ao enviar a cifra.");
      setEnviandoCifraId(null);
      return;
    }

    // Tenta converter o PDF pra ChordPro primeiro — quando dá certo,
    // Cifra.jsx abre o texto direto, instantâneo, sem PDF nem imagem
    // nenhuma envolvida, então nem vale a pena gerar as imagens de página
    // (só ficariam órfãs no Storage, sem nunca aparecer pra ninguém — foi
    // exatamente isso que aconteceu com o lote anterior, tivemos que
    // limpar depois). PDF de fonte quebrada ou escaneado não tem como
    // converter no navegador (precisaria de OCR); nesse caso
    // pdfParaChordPro devolve null e cai no caminho de baixo, que gera as
    // imagens — a cifra continua funcionando, só em PDF/imagem mesmo.
    let cifraCho = null;
    try {
      setStatus("⏳ Convertendo pra ChordPro...");
      const { pdfParaChordPro } = await import("../lib/pdfParaCho");
      cifraCho = await pdfParaChordPro(arquivo);
    } catch (e) {
      console.error("Falha ao converter o PDF pra ChordPro:", e);
    }

    let totalPaginas = 0;
    let versao = null;
    if (!cifraCho) {
      try {
        // Import dinâmico: pdf.js é pesado, só baixa quando alguém
        // realmente for enviar uma cifra que não converteu, não pra
        // qualquer visitante do site
        const { pdfParaImagensJpeg } = await import("../lib/pdfParaImagens");
        const imagens = await pdfParaImagensJpeg(arquivo, (atual, total) => {
          setStatus(`⏳ Preparando página ${atual}/${total}...`);
        });
        versao = Date.now();
        for (let i = 0; i < imagens.length; i++) {
          const { error: imgError } = await subirImagemPagina(
            caminhoImagemPagina(m.id, versao, i + 1),
            imagens[i]
          );
          if (imgError) throw imgError;
        }
        totalPaginas = imagens.length;
      } catch (e) {
        console.error("Falha ao gerar imagens das páginas da cifra:", e);
        versao = null;
      }
    }

    // Vincula no banco ANTES de apagar os arquivos antigos do Storage — se
    // o update falhar (ex.: sessão expirou no meio do upload), a música
    // continua apontando pro cifra_path antigo, então ele precisa continuar
    // existindo. A ordem inversa deixava a cifra quebrada (404) sempre que
    // o update falhasse depois dos arquivos antigos já removidos.
    const { error: dbError } = await supabase
      .from("musicas")
      .update({
        cifra_path: path,
        cifra_paginas: totalPaginas || null,
        cifra_versao: versao,
        cifra_cho: cifraCho, // null limpa uma conversão antiga se essa nova falhar
      })
      .eq("id", m.id);

    if (dbError) {
      console.error(dbError);
      setStatus("❌ Erro ao vincular a cifra.");
      setEnviandoCifraId(null);
      carregar();
      return;
    }

    const arquivosAntigos = arquivosDaCifra(m);
    if (arquivosAntigos.length > 0) {
      await supabase.storage.from("cifras").remove(arquivosAntigos);
    }

    setStatus(
      cifraCho
        ? "✅ Cifra enviada e convertida pra ChordPro!"
        : "✅ Cifra enviada (não deu pra converter automaticamente — continua em PDF)."
    );
    setTimeout(() => setStatus(""), 3500);
    setEnviandoCifraId(null);
    carregar();
  };

  const visiveis = musicas.filter((m) => {
    const temCifra = Boolean(m.cifra_path || m.cifra_cho);
    if (filtroCifra === "com" && !temCifra) return false;
    if (filtroCifra === "sem" && temCifra) return false;
    if (filtroItunes && itunesMap[chaveItunes(m)] !== false) return false;
    const q = filtro.trim().toLowerCase();
    if (!q) return true;
    return `${m.nome} ${m.artista} ${m.estilo ?? ""}`.toLowerCase().includes(q);
  });

  const baixarXlsx = async () => {
    // Biblioteca só é baixada quando o botão é usado
    const XLSX = await import("xlsx");
    const dados = musicas.map((m) => ({
      "Música": m.nome,
      "Artista": m.artista,
      "Estilo": m.estilo ?? "",
      "Cifra": m.cifra_path || m.cifra_cho ? "Sim" : "",
    }));
    const ws = XLSX.utils.json_to_sheet(dados);
    ws["!cols"] = [{ wch: 40 }, { wch: 30 }, { wch: 16 }, { wch: 8 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Repertório");
    XLSX.writeFile(wb, "repertorio-duo-mariel.xlsx");
  };

  return (
    <div>
      {/* Formulário */}
      <form
        onSubmit={salvar}
        className="border border-noir-700 rounded-2xl p-5 bg-noir-900/50 mb-6"
      >
        <h2 className="section-title text-sm mb-4">
          {editandoId ? "Editar música" : "Adicionar música"}
        </h2>

        <div className="grid gap-3 sm:grid-cols-3">
          <input
            className="input-noir"
            placeholder="Nome da música *"
            value={form.nome}
            onChange={(e) => setForm({ ...form, nome: e.target.value })}
            required
          />
          <input
            className="input-noir"
            placeholder="Artista *"
            value={form.artista}
            onChange={(e) => setForm({ ...form, artista: e.target.value })}
            required
          />
          <input
            className="input-noir"
            placeholder="Estilo (ex.: MPB)"
            value={form.estilo}
            onChange={(e) => setForm({ ...form, estilo: e.target.value })}
          />
        </div>

        {/* Sugestões da busca (opcional — dá para ignorar e digitar tudo) */}
        {(buscandoApi || sugestoesApi.length > 0) && !editandoId && (
          <div className="mt-3 border border-noir-700 rounded-xl bg-noir-900 overflow-hidden">
            {buscandoApi ? (
              <p className="px-4 py-3 text-xs text-cream-muted">Buscando sugestões...</p>
            ) : (
              <>
                <div className="flex items-center justify-between px-4 pt-2.5 pb-1">
                  <p className="text-[10px] uppercase tracking-wider text-cream-muted">
                    Sugestões — toque para preencher
                  </p>
                  <button
                    type="button"
                    onClick={() => setSugestoesApi([])}
                    className="text-xs text-cream-muted hover:text-cream"
                    aria-label="Fechar sugestões"
                  >
                    ✕
                  </button>
                </div>
                <ul className="divide-y divide-noir-800">
                  {sugestoesApi.map((s, i) => (
                    <li key={i} className="flex items-center pr-3">
                      <button
                        type="button"
                        onClick={() => usarSugestao(s)}
                        className="flex-1 min-w-0 px-4 py-2.5 flex items-center gap-3 text-left hover:bg-noir-800 transition"
                      >
                        {s.capa ? (
                          <img
                            src={s.capa}
                            alt=""
                            className="w-9 h-9 rounded-lg border border-noir-700 shrink-0"
                          />
                        ) : (
                          <span className="w-9 h-9 rounded-lg border border-noir-700 shrink-0 flex items-center justify-center text-cream-muted">
                            ♪
                          </span>
                        )}
                        <span className="min-w-0">
                          <span className="block text-sm text-cream truncate">{s.nome}</span>
                          <span className="block text-xs text-cream-muted truncate">
                            {s.artista}
                            {s.estilo ? ` • ${s.estilo}` : ""}
                          </span>
                        </span>
                      </button>
                      <BotaoOuvir url={s.previewUrl} />
                    </li>
                  ))}
                </ul>
                <p className="px-4 py-2 text-[11px] text-cream-muted/70 border-t border-noir-800">
                  Não achou? Sem problema — preencha os campos e adicione normalmente.
                </p>
              </>
            )}
          </div>
        )}

        <div className="mt-4 flex items-center gap-3">
          <button type="submit" className="btn-gold px-6 py-2.5 rounded-xl text-sm">
            {editandoId ? "Salvar alterações" : "Adicionar"}
          </button>
          {editandoId && (
            <button
              type="button"
              onClick={cancelarEdicao}
              className="px-4 py-2.5 rounded-xl border border-noir-700 text-sm text-cream-muted hover:text-cream transition"
            >
              Cancelar
            </button>
          )}
          {status && <span className="text-sm text-cream-muted">{status}</span>}
        </div>
      </form>

      {/* Lista */}
      <div className="border border-noir-700 rounded-2xl p-5 bg-noir-900/50">
        <div className="flex items-center justify-between gap-4 mb-3">
          <h2 className="section-title text-sm">
            Repertório ({musicas.length})
          </h2>
          <button
            onClick={baixarXlsx}
            disabled={musicas.length === 0}
            className="px-3 py-1.5 rounded-lg border border-noir-700 text-xs text-cream-muted hover:text-gold-300 hover:border-gold-600 transition disabled:opacity-40"
          >
            ⬇ Baixar repertório (xlsx)
          </button>
        </div>

        <input
          className="input-noir mb-2"
          placeholder="Filtrar..."
          value={filtro}
          onChange={(e) => setFiltro(e.target.value)}
        />

        {/* Filtro por cifra */}
        <div className="flex gap-2 mb-2">
          {[
            ["todas", `Todas (${musicas.length})`],
            ["com", `Com cifra (${musicas.filter((m) => m.cifra_path || m.cifra_cho).length})`],
            ["sem", `Sem cifra (${musicas.filter((m) => !m.cifra_path && !m.cifra_cho).length})`],
          ].map(([valor, rotulo]) => (
            <button
              key={valor}
              onClick={() => setFiltroCifra(valor)}
              className={`px-3 py-1.5 rounded-full text-xs tracking-wide transition border ${
                filtroCifra === valor
                  ? "btn-gold border-transparent"
                  : "border-noir-700 text-cream-muted hover:text-cream"
              }`}
            >
              {rotulo}
            </button>
          ))}
          <button
            onClick={() => setFiltroItunes((v) => !v)}
            title="Mostrar só as músicas que não foram encontradas na busca do iTunes"
            className={`px-3 py-1.5 rounded-full text-xs tracking-wide transition border ${
              filtroItunes
                ? "btn-gold border-transparent"
                : "border-noir-700 text-cream-muted hover:text-cream"
            }`}
          >
            Sem iTunes ({musicas.filter((m) => itunesMap[chaveItunes(m)] === false).length})
          </button>
          <button
            onClick={verificarItunes}
            disabled={!!verificandoItunes || carregando}
            title="Consulta cada música na busca do iTunes (roda uma vez e fica salvo)"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs tracking-wide transition border border-noir-700 text-cream-muted hover:text-gold-300 hover:border-gold-600 disabled:opacity-50"
          >
            {verificandoItunes ? (
              `⏳ ${verificandoItunes}`
            ) : (
              <>
                <Icone nome="buscar" className="w-3.5 h-3.5" />
                Verificar iTunes
              </>
            )}
          </button>
        </div>

        {carregando ? (
          <p className="text-cream-muted text-sm py-4">Carregando...</p>
        ) : (
          <ul className="divide-y divide-noir-800 max-h-[480px] overflow-y-auto pr-2">
            {visiveis.map((m) => (
              <li key={m.id} className="py-3 flex items-center justify-between gap-3">
                <BotaoOuvir nome={m.nome} artista={m.artista} />
                <div className="min-w-0 flex-1">
                  <p className="text-cream truncate">
                    {m.nome}
                    {itunesMap[chaveItunes(m)] === false && (
                      <span
                        title="Não encontrada na busca do iTunes — confira a grafia de nome/artista"
                        className="ml-2 text-[10px] uppercase tracking-wider text-amber-300 border border-amber-700 rounded-full px-2 py-0.5"
                      >
                        ⚠ sem iTunes
                      </span>
                    )}
                  </p>
                  <p className="text-cream-muted text-sm truncate">
                    {m.artista}
                    {m.estilo ? ` • ${m.estilo}` : ""}
                  </p>
                </div>
                <div className="flex gap-2 shrink-0 flex-wrap justify-end">
                  <label
                    title={
                      m.cifra_path
                        ? "Trocar o PDF da cifra (converte pra ChordPro automaticamente)"
                        : "Enviar PDF da cifra (converte pra ChordPro automaticamente)"
                    }
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs transition cursor-pointer ${
                      m.cifra_path
                        ? "border-gold-600 text-gold-300 hover:bg-noir-800"
                        : "border-noir-700 text-cream-muted hover:text-gold-300 hover:border-gold-600"
                    } ${enviandoCifraId === m.id ? "opacity-50 pointer-events-none" : ""}`}
                  >
                    {enviandoCifraId === m.id ? (
                      "⏳..."
                    ) : (
                      <>
                        <Icone nome="anexo" className="w-3.5 h-3.5" />
                        {m.cifra_path ? "Trocar PDF" : "PDF"}
                      </>
                    )}
                    <input
                      type="file"
                      accept="application/pdf"
                      className="hidden"
                      onChange={(e) => {
                        enviarCifra(m, e.target.files?.[0]);
                        e.target.value = "";
                      }}
                    />
                  </label>
                  <button
                    onClick={() => setMusicaParaTrocarItunes(m)}
                    title="Buscar outro resultado no iTunes pra corrigir nome/artista/estilo"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-noir-700 text-xs text-cream-muted hover:text-gold-300 hover:border-gold-600 transition"
                  >
                    <Icone nome="reprocessar" className="w-3.5 h-3.5" />
                    iTunes
                  </button>
                  <button
                    onClick={() => editar(m)}
                    className="px-3 py-1.5 rounded-lg border border-noir-700 text-xs text-cream-muted hover:text-gold-300 hover:border-gold-600 transition"
                  >
                    Editar
                  </button>
                  <button
                    onClick={() => excluir(m)}
                    className="px-3 py-1.5 rounded-lg border border-noir-700 text-xs text-cream-muted hover:text-red-400 hover:border-red-900 transition"
                  >
                    Excluir
                  </button>
                </div>
              </li>
            ))}
            {visiveis.length === 0 && (
              <li className="py-4 text-cream-muted text-sm">Nenhuma música.</li>
            )}
          </ul>
        )}
      </div>

      {musicaParaTrocarItunes && (
        <ModalBuscaItunes
          nomeInicial={musicaParaTrocarItunes.nome}
          artistaInicial={musicaParaTrocarItunes.artista}
          titulo="Trocar dados do iTunes"
          descricao="Busque outro resultado no iTunes pra corrigir nome/artista/estilo desta música."
          textoConfirmar="Salvar"
          onFechar={() => setMusicaParaTrocarItunes(null)}
          onConfirmar={confirmarTrocaItunes}
        />
      )}
    </div>
  );
}

/* ---------------- BOTÃO DE PREVIEW (admin) ---------------- */

// Um único áudio para o admin inteiro; ao tocar outro, o anterior para
let audioAdmin = null;
let pararBotaoAnterior = null;

// Toca um trecho de 30s (iTunes). Aceita a url já pronta (listas de busca,
// que já vêm com previewUrl) ou nome/artista pra buscar só quando clicado
// (lista do repertório — não faz sentido consultar o iTunes pra cada linha
// visível sem necessidade)
function BotaoOuvir({ url, nome, artista }) {
  const [tocando, setTocando] = useState(false);
  const [buscando, setBuscando] = useState(false);
  const [semPreview, setSemPreview] = useState(false);
  const urlRef = useRef(url ?? null);

  useEffect(
    () => () => {
      if (pararBotaoAnterior) audioAdmin?.pause();
    },
    []
  );

  if (!url && !nome) return null;
  if (semPreview) return null;

  const alternar = async (e) => {
    e.stopPropagation();
    if (tocando) {
      audioAdmin?.pause();
      setTocando(false);
      pararBotaoAnterior = null;
      return;
    }
    audioAdmin?.pause();
    pararBotaoAnterior?.();

    let urlTocar = urlRef.current;
    if (!urlTocar) {
      setBuscando(true);
      urlTocar = await buscarPreview(nome, artista);
      setBuscando(false);
      if (!urlTocar) {
        setSemPreview(true);
        return;
      }
      urlRef.current = urlTocar;
    }

    audioAdmin = new Audio(urlTocar);
    audioAdmin.addEventListener("ended", () => setTocando(false));
    audioAdmin.play().catch(() => setTocando(false));
    setTocando(true);
    pararBotaoAnterior = () => setTocando(false);
  };

  return (
    <button
      type="button"
      onClick={alternar}
      disabled={buscando}
      aria-label={tocando ? "Parar trecho" : "Ouvir trecho"}
      title="Ouvir um trecho de 30s"
      className="shrink-0 w-8 h-8 rounded-full border border-gold-600 text-gold-300 text-xs hover:bg-noir-800 transition disabled:opacity-40"
    >
      {buscando ? "⏳" : tocando ? "❚❚" : "▶"}
    </button>
  );
}

/* ------------------------- CIFRAS ------------------------- */

// Sorteia `n` itens distintos de uma lista
function sortearItens(lista, n) {
  const copia = [...lista];
  for (let i = copia.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copia[i], copia[j]] = [copia[j], copia[i]];
  }
  return copia.slice(0, n);
}

function AbaCifras() {
  const [musicas, setMusicas] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [filtro, setFiltro] = useState("");
  const [aleatorias, setAleatorias] = useState([]);
  const [progresso, setProgresso] = useState(() => estadoDownloadCifras());
  const [modalAberto, setModalAberto] = useState(false);
  const [armazenamentoPersistente, setArmazenamentoPersistente] = useState(null); // null = verificando
  const [soFavoritas, setSoFavoritas] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    if (!navigator.storage?.persist) {
      setArmazenamentoPersistente(false);
      return;
    }
    // No iOS/Safari isso quase sempre volta false — o navegador não garante
    // manter o cache das cifras (pode limpar sozinho depois de ~1 semana
    // sem uso), diferente do Android/Chrome
    navigator.storage
      .persist()
      .then(setArmazenamentoPersistente)
      .catch(() => setArmazenamentoPersistente(false));
  }, []);

  const carregar = () =>
    supabase
      .from("musicas")
      .select("id, nome, artista, estilo, cifra_path, cifra_paginas, cifra_versao, cifra_cho, favorito")
      .or("cifra_path.not.is.null,cifra_cho.not.is.null")
      .order("nome")
      .order("artista")
      .then(({ data, error }) => {
        if (!error) setMusicas(data ?? []);
        setCarregando(false);
      });

  useEffect(() => {
    carregar();
  }, []);

  useEffect(() => {
    if (musicas.length > 0) setAleatorias(sortearItens(musicas, 3));
  }, [musicas]);

  // Acompanha o download mesmo que ele tenha começado antes desta aba
  // remontar (o estado vive fora do componente, em src/lib/cifraCache.js)
  useEffect(() => assinarDownloadCifras(setProgresso), []);

  const visiveis = musicas.filter((m) => {
    if (soFavoritas && !m.favorito) return false;
    const q = normalizarNome(filtro);
    if (!q) return true;
    return normalizarNome(`${m.nome} ${m.artista} ${m.estilo ?? ""}`).includes(q);
  });

  const cliqueBaixar = () => {
    // Só cifras em PDF precisam de cache offline — as em .cho já vêm
    // completas na própria linha da música, sem arquivo separado pra baixar
    if (!progresso.baixando) baixarCifrasEmCache(musicas.filter((m) => m.cifra_path));
    setModalAberto(true);
  };

  const alternarFavorito = async (m) => {
    const novoValor = !m.favorito;
    setMusicas((lista) => lista.map((x) => (x.id === m.id ? { ...x, favorito: novoValor } : x)));
    const { error } = await supabase.from("musicas").update({ favorito: novoValor }).eq("id", m.id);
    if (error) {
      console.error(error);
      setMusicas((lista) => lista.map((x) => (x.id === m.id ? { ...x, favorito: m.favorito } : x)));
    }
  };

  return (
    <div className="border border-noir-700 rounded-2xl p-5 bg-noir-900/50">
      <div className="flex items-center justify-between gap-4 mb-3 flex-wrap">
        <h2 className="section-title text-sm">Cifras ({musicas.length})</h2>
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={cliqueBaixar}
            disabled={musicas.length === 0}
            title="Guarda o PDF de todas as cifras no cache do navegador, para uso offline no show"
            className="px-3 py-1.5 rounded-lg border border-noir-700 text-xs text-cream-muted hover:text-gold-300 hover:border-gold-600 transition disabled:opacity-40"
          >
            {progresso.baixando ? `⏳ Baixando ${progresso.feito}/${progresso.total}` : "Baixar"}
          </button>
        </div>
      </div>
      {armazenamentoPersistente === false && (
        <p className="text-xs text-amber-400/80 mb-3">
          ⚠️ Este navegador (comum no iPhone/Safari) não garante manter esse
          cache pra sempre — ele pode ser apagado sozinho depois de uns 7
          dias sem abrir o site. Abra o app com internet regularmente, e
          sempre antes de um show.
        </p>
      )}

      {modalAberto && (
        <ModalDownloadCifras progresso={progresso} onFechar={() => setModalAberto(false)} />
      )}

      <div className="flex gap-2 mb-2">
        <input
          className="input-noir"
          placeholder="Buscar por nome, artista ou estilo..."
          value={filtro}
          onChange={(e) => setFiltro(e.target.value)}
        />
        <button
          onClick={() => setSoFavoritas((v) => !v)}
          title="Mostrar só as cifras marcadas como favoritas"
          className={`shrink-0 px-3 rounded-lg border text-lg transition ${
            soFavoritas
              ? "btn-gold border-transparent"
              : "border-noir-700 text-cream-muted hover:text-gold-300"
          }`}
        >
          {soFavoritas ? "★" : "☆"}
        </button>
      </div>

      {carregando ? (
        <p className="text-cream-muted text-sm py-4">Carregando...</p>
      ) : (
        <ul className="divide-y divide-noir-800 max-h-[560px] overflow-y-auto pr-2">
          {visiveis.map((m) => (
            <li key={m.id} className="flex items-center gap-1">
              <button
                onClick={() => alternarFavorito(m)}
                aria-label={m.favorito ? "Remover dos favoritos" : "Marcar como favorita"}
                className={`shrink-0 w-8 h-8 flex items-center justify-center text-lg transition ${
                  m.favorito ? "text-gold-400" : "text-noir-600 hover:text-gold-300"
                }`}
              >
                {m.favorito ? "★" : "☆"}
              </button>
              <button
                onClick={() => navigate(`/cifra/${m.id}`)}
                className="flex-1 min-w-0 py-3 flex items-center justify-between gap-3 text-left hover:bg-noir-800/50 rounded-lg px-2 -mx-2 transition"
              >
                <div className="min-w-0">
                  <p className="text-cream truncate">{m.nome}</p>
                  <p className="text-cream-muted text-sm truncate">
                    {m.artista}
                    {m.estilo ? ` • ${m.estilo}` : ""}
                  </p>
                </div>
                <span className="shrink-0 inline-flex items-center gap-1 text-gold-300 text-sm">
                  <Icone nome="cifras" className="w-4 h-4" />
                  Abrir ›
                </span>
              </button>
            </li>
          ))}
          {visiveis.length === 0 && (
            <li className="py-4 text-cream-muted text-sm">
              {musicas.length === 0
                ? "Nenhuma cifra enviada ainda. Envie os PDFs na aba Músicas (botão PDF)."
                : "Nenhuma cifra encontrada com esse filtro."}
            </li>
          )}
        </ul>
      )}

      {/* Cifras aleatórias — sugestão rápida para praticar */}
      {aleatorias.length > 0 && (
        <div className="mt-5 pt-4 border-t border-noir-800">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xs uppercase tracking-wider text-cream-muted">
              3 cifras aleatórias
            </h3>
            <button
              onClick={() => setAleatorias(sortearItens(musicas, 3))}
              className="inline-flex items-center gap-1.5 text-2xl text-cream-muted hover:text-gold-300 transition"
            >
              <Icone nome="mudar" className="w-6 h-6 text-gold-400" />
              Mudar
            </button>
          </div>
          <ul className="divide-y divide-noir-800">
            {aleatorias.map((m) => (
              <li key={m.id}>
                <button
                  onClick={() => navigate(`/cifra/${m.id}`)}
                  className="w-full py-2.5 flex items-center justify-between gap-3 text-left hover:bg-noir-800/50 rounded-lg px-2 -mx-2 transition"
                >
                  <div className="min-w-0">
                    <p className="text-cream truncate text-sm">{m.nome}</p>
                    <p className="text-cream-muted text-xs truncate">
                      {m.artista}
                      {m.estilo ? ` • ${m.estilo}` : ""}
                    </p>
                  </div>
                  <span className="shrink-0 inline-flex items-center gap-1 text-gold-300 text-xs">
                    <Icone nome="cifras" className="w-3.5 h-3.5" />
                    Abrir ›
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// Modal com o progresso do download de todas as cifras — pode ser deixado
// rodando em segundo plano (o download continua, só a janela some) ou
// cancelado de verdade (aborta a requisição em andamento)
function ModalDownloadCifras({ progresso, onFechar }) {
  const { baixando, feito, total, ok, cancelado } = progresso;
  const percentual = total > 0 ? Math.round((feito / total) * 100) : 0;

  return (
    <div className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="w-full max-w-sm rounded-2xl border border-noir-700 bg-noir-900 p-6">
        <h3 className="section-title text-base mb-1">
          {baixando ? "Baixando cifras..." : cancelado ? "Download cancelado" : "Download concluído"}
        </h3>
        <p className="text-cream-muted text-sm mb-4">
          {feito}/{total} cifras verificadas{!baixando && ` — ${ok} salvas em cache`}
        </p>

        <div className="h-2.5 rounded-full bg-noir-800 overflow-hidden">
          <div
            className="h-full bg-gold-500 transition-all"
            style={{ width: `${percentual}%` }}
          />
        </div>
        <p className="text-cream-muted/60 text-xs mt-1.5 text-right">{percentual}%</p>

        <div className="mt-6 flex gap-3 justify-end">
          {baixando ? (
            <>
              <button
                onClick={() => {
                  cancelarDownloadCifras();
                  onFechar();
                }}
                className="px-4 py-2 rounded-xl border border-noir-700 text-sm text-cream-muted hover:text-red-400 hover:border-red-900 transition"
              >
                Cancelar
              </button>
              <button onClick={onFechar} className="btn-gold px-5 py-2 rounded-xl text-sm">
                Rodar em segundo plano
              </button>
            </>
          ) : (
            <button onClick={onFechar} className="btn-gold px-5 py-2 rounded-xl text-sm">
              Fechar
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ---------------- MÚSICAS PARA APRENDER ---------------- */

const OPCOES_PARA = ["Ambos", "Gabriel", "Mariana"];

function GerenciarSugestoes() {
  const [sugestoes, setSugestoes] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [form, setForm] = useState({ musica: "", artista: "", para: "Ambos" });
  const [status, setStatus] = useState("");
  const [filtroPara, setFiltroPara] = useState(() => new Set(OPCOES_PARA));
  const [soRevisao, setSoRevisao] = useState(false);
  const [repertorio, setRepertorio] = useState(() => new Set());
  const [sugestaoParaMover, setSugestaoParaMover] = useState(null);

  // Autocomplete via iTunes (digitar manualmente sempre funciona)
  const [sugestoesApi, setSugestoesApi] = useState([]);
  const [buscandoApi, setBuscandoApi] = useState(false);
  const escolhaRef = useState({ atual: "" })[0];
  // Descarta resultados de buscas antigas que respondam fora de ordem
  const buscaApiRef = useRef(0);

  useEffect(() => {
    const q = form.musica.trim();
    if (q.length < 3 || q === escolhaRef.atual) {
      setSugestoesApi([]);
      setBuscandoApi(false);
      return;
    }
    setBuscandoApi(true);
    const minhaBusca = ++buscaApiRef.current;
    const timer = setTimeout(async () => {
      const resultados = await buscarMusicasApi(q);
      if (buscaApiRef.current !== minhaBusca) return;
      setSugestoesApi(resultados);
      setBuscandoApi(false);
    }, 450);
    return () => clearTimeout(timer);
  }, [form.musica, escolhaRef]);

  const usarSugestaoApi = (s) => {
    escolhaRef.atual = s.nome;
    setForm((f) => ({ ...f, musica: s.nome, artista: s.artista }));
    setSugestoesApi([]);
  };

  const alternarFiltro = (opcao) => {
    setFiltroPara((atual) => {
      const novo = new Set(atual);
      if (novo.has(opcao)) {
        if (novo.size > 1) novo.delete(opcao); // pelo menos um selecionado
      } else {
        novo.add(opcao);
      }
      return novo;
    });
  };

  const carregar = async () => {
    setCarregando(true);
    const [{ data, error }, { data: reps }] = await Promise.all([
      supabase.from("sugestoes").select("*").order("created_at", { ascending: false }),
      supabase.from("musicas").select("nome"),
    ]);
    if (!error) setSugestoes(data ?? []);
    setRepertorio(new Set((reps ?? []).map((r) => normalizarNome(r.nome))));
    setCarregando(false);
  };

  useEffect(() => {
    carregar();
  }, []);

  const adicionar = async (e) => {
    e.preventDefault();
    const musica = form.musica.trim();
    if (!musica) return;

    const { error } = await supabase.from("sugestoes").insert({
      musica,
      artista: form.artista.trim() || null,
      para: form.para,
      origem: "admin",
    });

    if (error) {
      console.error(error);
      setStatus("❌ Erro ao adicionar.");
      return;
    }
    setForm({ musica: "", artista: "", para: form.para });
    escolhaRef.atual = "";
    setStatus("✅ Adicionada à lista!");
    setTimeout(() => setStatus(""), 2500);
    carregar();
  };

  // Abre o modal de vínculo com o iTunes — a música só entra de fato no
  // repertório quando o modal é confirmado (confirmarMoverRepertorio)
  const moverParaRepertorio = (s) => setSugestaoParaMover(s);

  const confirmarMoverRepertorio = async ({ nome, artista, estilo }) => {
    const { error } = await supabase
      .from("musicas")
      .insert({ nome, artista, estilo: estilo || null });

    if (error) {
      console.error(error);
      setStatus("❌ Erro ao mover para o repertório.");
      return;
    }
    await supabase.from("sugestoes").delete().eq("id", sugestaoParaMover.id);
    setStatus(`✅ "${nome}" agora está no repertório!`);
    setTimeout(() => setStatus(""), 3000);
    setSugestaoParaMover(null);
    carregar();
  };

  // Confirmação dupla: quando é para Ambos, a música só vai ao repertório
  // depois que Gabs E Mari confirmarem
  const confirmar = async (s, campo) => {
    const novoValor = !s[campo];
    const { error } = await supabase
      .from("sugestoes")
      .update({ [campo]: novoValor })
      .eq("id", s.id);
    if (error) {
      console.error(error);
      setStatus("❌ Erro ao confirmar. As colunas ok_gabs/ok_mari existem no banco?");
      return;
    }
    const outro = campo === "ok_gabs" ? "ok_mari" : "ok_gabs";
    if (novoValor && s[outro]) {
      carregar();
      moverParaRepertorio({ ...s, [campo]: novoValor });
      return;
    }
    carregar();
  };

  const excluir = async (s) => {
    if (!window.confirm(`Excluir a sugestão "${s.musica}"?`)) return;
    const { error } = await supabase.from("sugestoes").delete().eq("id", s.id);
    if (error) {
      console.error(error);
      setStatus("❌ Erro ao excluir.");
      return;
    }
    carregar();
  };

  // A música em revisão já está no repertório — só sai da fila, sem passar
  // pelo vínculo com o iTunes (isso já foi feito quando ela entrou)
  const concluirRevisao = async (s) => {
    const { error } = await supabase.from("sugestoes").delete().eq("id", s.id);
    if (error) {
      console.error(error);
      setStatus("❌ Erro ao concluir a revisão.");
      return;
    }
    setStatus(`✅ "${s.musica}" revisada!`);
    setTimeout(() => setStatus(""), 2500);
    carregar();
  };

  return (
    <div>
      {/* Formulário */}
      <form
        onSubmit={adicionar}
        className="border border-noir-700 rounded-2xl p-5 bg-noir-900/50 mb-6"
      >
        <h2 className="section-title text-sm mb-4">Adicionar música para aprender</h2>

        <div className="grid gap-3 sm:grid-cols-3">
          <input
            className="input-noir"
            placeholder="Nome da música *"
            value={form.musica}
            onChange={(e) => setForm({ ...form, musica: e.target.value })}
            required
          />
          <input
            className="input-noir"
            placeholder="Artista"
            value={form.artista}
            onChange={(e) => setForm({ ...form, artista: e.target.value })}
          />
          <div className="flex items-center gap-2">
            <label className="text-sm text-cream-muted shrink-0">Para:</label>
            <select
              className="input-noir"
              value={form.para}
              onChange={(e) => setForm({ ...form, para: e.target.value })}
            >
              {OPCOES_PARA.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Sugestões da busca (opcional — dá para ignorar e digitar tudo) */}
        {(buscandoApi || sugestoesApi.length > 0) && (
          <div className="mt-3 border border-noir-700 rounded-xl bg-noir-900 overflow-hidden">
            {buscandoApi ? (
              <p className="px-4 py-3 text-xs text-cream-muted">Buscando sugestões...</p>
            ) : (
              <ul className="divide-y divide-noir-800">
                {sugestoesApi.map((s, i) => (
                  <li key={i} className="flex items-center pr-3">
                    <button
                      type="button"
                      onClick={() => usarSugestaoApi(s)}
                      className="flex-1 min-w-0 px-4 py-2.5 flex items-center gap-3 text-left hover:bg-noir-800 transition"
                    >
                      {s.capa ? (
                        <img
                          src={s.capa}
                          alt=""
                          className="w-9 h-9 rounded-lg border border-noir-700 shrink-0"
                        />
                      ) : (
                        <span className="w-9 h-9 rounded-lg border border-noir-700 shrink-0 flex items-center justify-center text-cream-muted">
                          ♪
                        </span>
                      )}
                      <span className="min-w-0">
                        <span className="block text-sm text-cream truncate">{s.nome}</span>
                        <span className="block text-xs text-cream-muted truncate">
                          {s.artista}
                          {s.estilo ? ` • ${s.estilo}` : ""}
                        </span>
                      </span>
                    </button>
                    <BotaoOuvir url={s.previewUrl} />
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        <div className="mt-4 flex items-center gap-3">
          <button type="submit" className="btn-gold px-6 py-2.5 rounded-xl text-sm">
            Adicionar
          </button>
          {status && <span className="text-sm text-cream-muted">{status}</span>}
        </div>
      </form>

      {/* Lista */}
      <div className="border border-noir-700 rounded-2xl p-5 bg-noir-900/50">
        <h2 className="section-title text-sm mb-3">
          Para aprender ({sugestoes.length})
        </h2>

        {/* Filtro por pessoa (multiseleção) */}
        <div className="flex gap-2 mb-3">
          {OPCOES_PARA.map((o) => (
            <button
              key={o}
              onClick={() => alternarFiltro(o)}
              className={`px-3 py-1.5 rounded-full text-xs tracking-wide transition border ${
                filtroPara.has(o)
                  ? "btn-gold border-transparent"
                  : "border-noir-700 text-cream-muted hover:text-cream"
              }`}
            >
              {o} ({sugestoes.filter((s) => (s.para ?? "Ambos") === o).length})
            </button>
          ))}
          <button
            onClick={() => setSoRevisao((v) => !v)}
            title="Mostrar só as músicas marcadas para revisão na tela da cifra"
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs tracking-wide transition border ${
              soRevisao
                ? "btn-gold border-transparent"
                : "border-noir-700 text-cream-muted hover:text-cream"
            }`}
          >
            <Icone nome="olho" className="w-3.5 h-3.5" />
            Revisão ({sugestoes.filter((s) => s.origem === "revisao").length})
          </button>
        </div>

        {carregando ? (
          <p className="text-cream-muted text-sm py-4">Carregando...</p>
        ) : (
          <ul className="divide-y divide-noir-800 max-h-[480px] overflow-y-auto pr-2">
            {sugestoes
              .filter((s) => filtroPara.has(s.para ?? "Ambos"))
              .filter((s) => !soRevisao || s.origem === "revisao")
              .map((s) => (
              <li key={s.id} className="py-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-cream truncate">
                    {s.musica}
                    {s.origem === "visitante" && (
                      <span className="ml-2 text-[10px] uppercase tracking-wider text-gold-300 border border-gold-600 rounded-full px-2 py-0.5">
                        público
                      </span>
                    )}
                    {s.origem === "revisao" && (
                      <span
                        title="Marcada para revisão na tela da cifra"
                        className="ml-2 text-[10px] uppercase tracking-wider text-violet-300 border border-violet-700 rounded-full px-2 py-0.5"
                      >
                        <Icone nome="olho" className="w-2.5 h-2.5 inline -mt-0.5 mr-0.5" />
                        revisão
                      </span>
                    )}
                    {(s.para ?? "Ambos") !== "Ambos" && (
                      <span className="ml-2 text-[10px] uppercase tracking-wider text-cream-muted border border-noir-600 rounded-full px-2 py-0.5">
                        {s.para}
                      </span>
                    )}
                    {repertorio.has(normalizarNome(s.musica)) && (
                      <span className="ml-2 text-[10px] uppercase tracking-wider text-emerald-300 border border-emerald-700 rounded-full px-2 py-0.5">
                        ✓ já no repertório
                      </span>
                    )}
                  </p>
                  <p className="text-cream-muted text-sm truncate">
                    {s.artista || "Artista não informado"}
                  </p>
                  {s.mensagem && (
                    <p className="text-cream-muted/70 text-xs break-words">
                      💬 {s.mensagem}
                    </p>
                  )}
                </div>
                <div className="flex gap-2 shrink-0">
                  {s.origem === "revisao" ? (
                    <button
                      onClick={() => concluirRevisao(s)}
                      className="px-3 py-1.5 rounded-lg border border-noir-700 text-xs text-cream-muted hover:text-gold-300 hover:border-gold-600 transition"
                    >
                      ✓ Revisada
                    </button>
                  ) : (s.para ?? "Ambos") === "Ambos" ? (
                    <>
                      <BotaoConfirma rotulo="Gabs" ok={s.ok_gabs} onClick={() => confirmar(s, "ok_gabs")} />
                      <BotaoConfirma rotulo="Mari" ok={s.ok_mari} onClick={() => confirmar(s, "ok_mari")} />
                    </>
                  ) : (
                    <button
                      onClick={() => moverParaRepertorio(s)}
                      className="px-3 py-1.5 rounded-lg border border-noir-700 text-xs text-cream-muted hover:text-gold-300 hover:border-gold-600 transition"
                    >
                      ✓ Aprendida
                    </button>
                  )}
                  <button
                    onClick={() => excluir(s)}
                    className="px-3 py-1.5 rounded-lg border border-noir-700 text-xs text-cream-muted hover:text-red-400 hover:border-red-900 transition"
                  >
                    Excluir
                  </button>
                </div>
              </li>
            ))}
            {sugestoes.length === 0 && (
              <li className="py-4 text-cream-muted text-sm">
                Nenhuma música na lista. As sugestões do público aparecem aqui.
              </li>
            )}
          </ul>
        )}
      </div>

      {sugestaoParaMover && (
        <ModalBuscaItunes
          nomeInicial={sugestaoParaMover.musica}
          artistaInicial={sugestaoParaMover.artista || ""}
          titulo="Adicionar ao repertório"
          descricao="Busque no iTunes pra preencher automático, ou digite manualmente."
          textoConfirmar="Adicionar ao repertório"
          onFechar={() => setSugestaoParaMover(null)}
          onConfirmar={confirmarMoverRepertorio}
        />
      )}
    </div>
  );
}

// Confirma o vínculo antes de mover uma sugestão pro repertório: busca no
// iTunes pra preencher artista/estilo/capa automaticamente, com entrada
// manual como alternativa caso não encontre a música
function ModalBuscaItunes({
  nomeInicial,
  artistaInicial = "",
  titulo,
  descricao,
  textoConfirmar,
  onFechar,
  onConfirmar,
}) {
  const [nome, setNome] = useState(nomeInicial);
  const [artista, setArtista] = useState(artistaInicial);
  const [estilo, setEstilo] = useState("");
  const [salvando, setSalvando] = useState(false);

  const [sugestoesApi, setSugestoesApi] = useState([]);
  const [buscandoApi, setBuscandoApi] = useState(false);
  const escolhaRef = useState({ atual: "" })[0];
  const buscaApiRef = useRef(0);

  useEffect(() => {
    const q = nome.trim();
    if (q.length < 3 || q === escolhaRef.atual) {
      setSugestoesApi([]);
      setBuscandoApi(false);
      return;
    }
    setBuscandoApi(true);
    const minhaBusca = ++buscaApiRef.current;
    const timer = setTimeout(async () => {
      const resultados = await buscarMusicasApi(q);
      if (buscaApiRef.current !== minhaBusca) return;
      setSugestoesApi(resultados);
      setBuscandoApi(false);
    }, 450);
    return () => clearTimeout(timer);
  }, [nome, escolhaRef]);

  const usarSugestao = (s) => {
    escolhaRef.atual = s.nome;
    setNome(s.nome);
    setArtista(s.artista);
    setEstilo(s.estilo || "");
    setSugestoesApi([]);
  };

  const confirmar = async () => {
    if (!nome.trim() || !artista.trim()) return;
    setSalvando(true);
    await onConfirmar({ nome: nome.trim(), artista: artista.trim(), estilo: estilo.trim() });
    setSalvando(false);
  };

  return (
    <div
      className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={onFechar}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-noir-700 bg-noir-900 p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="section-title text-base mb-1">{titulo}</h3>
        <p className="text-cream-muted text-xs mb-4">{descricao}</p>

        <div className="grid gap-3">
          <input
            className="input-noir"
            placeholder="Nome da música *"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
          />
          <input
            className="input-noir"
            placeholder="Artista *"
            value={artista}
            onChange={(e) => setArtista(e.target.value)}
          />
          <input
            className="input-noir"
            placeholder="Estilo (ex.: MPB)"
            value={estilo}
            onChange={(e) => setEstilo(e.target.value)}
          />
        </div>

        {(buscandoApi || sugestoesApi.length > 0) && (
          <div className="mt-3 border border-noir-700 rounded-xl bg-noir-900 overflow-hidden">
            {buscandoApi ? (
              <p className="px-4 py-3 text-xs text-cream-muted">Buscando sugestões...</p>
            ) : (
              <ul className="divide-y divide-noir-800 max-h-56 overflow-y-auto">
                {sugestoesApi.map((s, i) => (
                  <li key={i} className="flex items-center pr-3">
                    <button
                      type="button"
                      onClick={() => usarSugestao(s)}
                      className="flex-1 min-w-0 px-4 py-2.5 flex items-center gap-3 text-left hover:bg-noir-800 transition"
                    >
                      {s.capa ? (
                        <img
                          src={s.capa}
                          alt=""
                          className="w-9 h-9 rounded-lg border border-noir-700 shrink-0"
                        />
                      ) : (
                        <span className="w-9 h-9 rounded-lg border border-noir-700 shrink-0 flex items-center justify-center text-cream-muted">
                          ♪
                        </span>
                      )}
                      <span className="min-w-0">
                        <span className="block text-sm text-cream truncate">{s.nome}</span>
                        <span className="block text-xs text-cream-muted truncate">
                          {s.artista}
                          {s.estilo ? ` • ${s.estilo}` : ""}
                        </span>
                      </span>
                    </button>
                    <BotaoOuvir url={s.previewUrl} />
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        <div className="mt-5 flex items-center justify-end gap-3">
          <button
            onClick={onFechar}
            className="px-4 py-2 rounded-xl border border-noir-700 text-sm text-cream-muted hover:text-cream transition"
          >
            Cancelar
          </button>
          <button
            onClick={confirmar}
            disabled={salvando || !nome.trim() || !artista.trim()}
            className="btn-gold px-5 py-2 rounded-xl text-sm disabled:opacity-50"
          >
            {salvando ? "Salvando..." : textoConfirmar}
          </button>
        </div>
      </div>
    </div>
  );
}

// Botão de confirmação individual (Gabs / Mari) das sugestões "Ambos"
function BotaoConfirma({ rotulo, ok, onClick }) {
  return (
    <button
      onClick={onClick}
      title={ok ? `${rotulo} confirmou — toque para desfazer` : `Confirmar por ${rotulo}`}
      className={`px-3 py-1.5 rounded-lg border text-xs transition ${
        ok
          ? "border-gold-600 text-gold-300 bg-noir-800"
          : "border-noir-700 text-cream-muted hover:text-gold-300 hover:border-gold-600"
      }`}
    >
      {ok ? "✓ " : ""}
      {rotulo}
    </button>
  );
}

/* ------------------------- AGENDA ------------------------- */

const FORM_EVENTO_VAZIO = {
  titulo: "",
  subtitulo: "",
  local: "",
  data: "",
  hora: "",
  duracao: "",
  cache: "",
  observacao: "",
};

// Máscara de moeda: digita só números e formata como R$ 0,00 (centavos primeiro)
const mascaraMoeda = (texto) => {
  const digitos = texto.replace(/\D/g, "").slice(0, 12);
  if (!digitos) return "";
  return (Number(digitos) / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
};

// Normaliza valores antigos salvos como texto livre (ex.: "R$ 800" → "R$ 800,00")
const normalizarMoeda = (texto) => {
  if (!texto) return "";
  const limpo = String(texto).replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", ".");
  const numero = parseFloat(limpo);
  if (isNaN(numero)) return texto;
  return numero.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
};

// Máscara de hora: digita só números e formata como hh:mm (limita 23:59)
const mascaraHora = (texto) => {
  let digitos = texto.replace(/\D/g, "").slice(0, 4);
  if (digitos.length >= 2 && Number(digitos.slice(0, 2)) > 23) {
    digitos = `23${digitos.slice(2)}`;
  }
  if (digitos.length === 4 && Number(digitos.slice(2)) > 59) {
    digitos = `${digitos.slice(0, 2)}59`;
  }
  if (digitos.length <= 2) return digitos;
  return `${digitos.slice(0, 2)}:${digitos.slice(2)}`;
};

// Exibição amigável da duração: "03:00" → "3h", "02:30" → "2h30min"
const formatarDuracao = (texto) => {
  const m = String(texto ?? "").match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return texto;
  const horas = Number(m[1]);
  const minutos = Number(m[2]);
  if (!horas) return `${minutos}min`;
  return minutos ? `${horas}h${String(minutos).padStart(2, "0")}min` : `${horas}h`;
};

const formatarDataCurta = (iso) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
  });

function GerenciarAgenda() {
  const [eventos, setEventos] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [form, setForm] = useState(FORM_EVENTO_VAZIO);
  const [editandoId, setEditandoId] = useState(null);
  const [status, setStatus] = useState("");
  const [mostrarRealizados, setMostrarRealizados] = useState(false);

  const carregar = async () => {
    setCarregando(true);
    const { data, error } = await supabase
      .from("eventos")
      .select("*")
      .order("data", { ascending: true })
      .order("hora");
    if (!error) setEventos(data ?? []);
    setCarregando(false);
  };

  useEffect(() => {
    carregar();
  }, []);

  const salvar = async (e) => {
    e.preventDefault();
    const registro = {
      titulo: form.titulo.trim(),
      subtitulo: form.subtitulo.trim() || null,
      local: form.local.trim() || null,
      data: form.data,
      hora: /^\d{2}:\d{2}$/.test(form.hora) ? form.hora : null,
      duracao: form.duracao.trim() || null,
      cache: form.cache.trim() || null,
      observacao: form.observacao.trim() || null,
    };
    if (!registro.titulo || !registro.data) return;

    setStatus("⏳ Salvando...");

    const { error } = editandoId
      ? await supabase.from("eventos").update(registro).eq("id", editandoId)
      : await supabase.from("eventos").insert(registro);

    if (error) {
      console.error(error);
      setStatus("❌ Erro ao salvar. Tente novamente.");
      return;
    }

    setForm(FORM_EVENTO_VAZIO);
    setEditandoId(null);
    setStatus(editandoId ? "✅ Show atualizado!" : "✅ Show adicionado!");
    setTimeout(() => setStatus(""), 2500);
    carregar();
  };

  const editar = (ev) => {
    setEditandoId(ev.id);
    setForm({
      titulo: ev.titulo,
      subtitulo: ev.subtitulo ?? "",
      local: ev.local ?? "",
      data: ev.data,
      hora: ev.hora ? ev.hora.slice(0, 5) : "",
      duracao: ev.duracao ?? "",
      cache: normalizarMoeda(ev.cache),
      observacao: ev.observacao ?? "",
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const cancelarEdicao = () => {
    setEditandoId(null);
    setForm(FORM_EVENTO_VAZIO);
  };

  const excluir = async (ev) => {
    if (!window.confirm(`Excluir o show "${ev.titulo}"?`)) return;
    const { error } = await supabase.from("eventos").delete().eq("id", ev.id);
    if (error) {
      console.error(error);
      setStatus("❌ Erro ao excluir.");
      return;
    }
    carregar();
  };

  const hojeIso = new Date().toISOString().slice(0, 10);
  // Por padrão só os próximos shows (mais relevante no dia a dia); os já
  // realizados ficam disponíveis num filtro, sem sumir do histórico
  const proximos = eventos.filter((ev) => ev.data >= hojeIso);
  const realizados = eventos.filter((ev) => ev.data < hojeIso).slice().reverse();
  const visiveis = mostrarRealizados ? realizados : proximos;

  return (
    <div>
      {/* Formulário */}
      <form
        onSubmit={salvar}
        className="border border-noir-700 rounded-2xl p-5 bg-noir-900/50 mb-6"
      >
        <h2 className="section-title text-sm mb-4">
          {editandoId ? "Editar show" : "Adicionar show"}
        </h2>
        <p className="text-xs text-cream-muted -mt-2 mb-4">
          Título, subtítulo e detalhes preenchem o card padrão da Agenda —
          mesmo design pra todos os shows, só o texto muda.
        </p>

        <div className="grid gap-3 sm:grid-cols-2">
          <input
            className="input-noir"
            placeholder="Título (ex.: Show acústico) *"
            value={form.titulo}
            onChange={(e) => setForm({ ...form, titulo: e.target.value })}
            required
          />
          <input
            className="input-noir"
            placeholder="Subtítulo (ex.: Bossa & MPB ao vivo)"
            value={form.subtitulo}
            onChange={(e) => setForm({ ...form, subtitulo: e.target.value })}
          />
          <input
            className="input-noir"
            placeholder="Local (ex.: Café Central)"
            value={form.local}
            onChange={(e) => setForm({ ...form, local: e.target.value })}
          />
          <input
            type="date"
            className="input-noir"
            value={form.data}
            onChange={(e) => setForm({ ...form, data: e.target.value })}
            required
          />
          <input
            className="input-noir"
            inputMode="numeric"
            maxLength={5}
            placeholder="Hora (ex.: 20:30)"
            value={form.hora}
            onChange={(e) => setForm({ ...form, hora: mascaraHora(e.target.value) })}
          />
          <input
            className="input-noir"
            inputMode="numeric"
            maxLength={5}
            placeholder="Tempo de apresentação (ex.: 02:00)"
            value={form.duracao}
            onChange={(e) => setForm({ ...form, duracao: mascaraHora(e.target.value) })}
          />
          <input
            className="input-noir"
            inputMode="numeric"
            placeholder="Cachê (ex.: R$ 800,00) — só vocês veem"
            value={form.cache}
            onChange={(e) => setForm({ ...form, cache: mascaraMoeda(e.target.value) })}
          />
        </div>

        <input
          className="input-noir mt-3"
          placeholder="Detalhes (ex.: entrada gratuita, evento privado...)"
          value={form.observacao}
          onChange={(e) => setForm({ ...form, observacao: e.target.value })}
        />

        <div className="mt-4 flex items-center gap-3">
          <button type="submit" className="btn-gold px-6 py-2.5 rounded-xl text-sm">
            {editandoId ? "Salvar alterações" : "Adicionar"}
          </button>
          {editandoId && (
            <button
              type="button"
              onClick={cancelarEdicao}
              className="px-4 py-2.5 rounded-xl border border-noir-700 text-sm text-cream-muted hover:text-cream transition"
            >
              Cancelar
            </button>
          )}
          {status && <span className="text-sm text-cream-muted">{status}</span>}
        </div>
      </form>

      {/* Lista */}
      <div className="border border-noir-700 rounded-2xl p-5 bg-noir-900/50">
        <div className="flex items-center justify-between gap-4 mb-3 flex-wrap">
          <h2 className="section-title text-sm">Shows ({visiveis.length})</h2>
          <div className="flex gap-2">
            <button
              onClick={() => setMostrarRealizados(false)}
              className={`px-3 py-1.5 rounded-full text-xs tracking-wide transition border ${
                !mostrarRealizados
                  ? "btn-gold border-transparent"
                  : "border-noir-700 text-cream-muted hover:text-cream"
              }`}
            >
              Próximos ({proximos.length})
            </button>
            <button
              onClick={() => setMostrarRealizados(true)}
              className={`px-3 py-1.5 rounded-full text-xs tracking-wide transition border ${
                mostrarRealizados
                  ? "btn-gold border-transparent"
                  : "border-noir-700 text-cream-muted hover:text-cream"
              }`}
            >
              Realizados ({realizados.length})
            </button>
          </div>
        </div>

        {carregando ? (
          <p className="text-cream-muted text-sm py-4">Carregando...</p>
        ) : (
          <ul className="divide-y divide-noir-800 max-h-[480px] overflow-y-auto pr-2">
            {visiveis.map((ev) => {
              const passado = ev.data < hojeIso;
              return (
                <li key={ev.id} className="py-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className={`truncate ${passado ? "text-cream-muted line-through" : "text-cream"}`}>
                      {ev.titulo}
                    </p>
                    {ev.subtitulo && (
                      <p className="text-gold-300/80 text-xs truncate">{ev.subtitulo}</p>
                    )}
                    <p className="text-cream-muted text-sm truncate">
                      {formatarDataCurta(ev.data)}
                      {ev.hora ? ` • ${ev.hora.slice(0, 5)}` : ""}
                      {ev.duracao ? ` • ${formatarDuracao(ev.duracao)}` : ""}
                      {ev.local ? ` • ${ev.local}` : ""}
                    </p>
                    {ev.cache && (
                      <p className="text-gold-300/90 text-xs truncate">💰 {normalizarMoeda(ev.cache)}</p>
                    )}
                    {ev.observacao && (
                      <p className="text-cream-muted/70 text-xs truncate">{ev.observacao}</p>
                    )}
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <button
                      onClick={() => editar(ev)}
                      className="px-3 py-1.5 rounded-lg border border-noir-700 text-xs text-cream-muted hover:text-gold-300 hover:border-gold-600 transition"
                    >
                      Editar
                    </button>
                    <button
                      onClick={() => excluir(ev)}
                      className="px-3 py-1.5 rounded-lg border border-noir-700 text-xs text-cream-muted hover:text-red-400 hover:border-red-900 transition"
                    >
                      Excluir
                    </button>
                  </div>
                </li>
              );
            })}
            {visiveis.length === 0 && (
              <li className="py-4 text-cream-muted text-sm">
                {mostrarRealizados ? "Nenhum show realizado ainda." : "Nenhum show futuro cadastrado."}
              </li>
            )}
          </ul>
        )}
      </div>
    </div>
  );
}

/* ------------------------- PLAYLIST DE EVENTO ------------------------- */
// Senha compartilhada (mesma pra todos os contratantes) + visão/moderação
// das músicas que cada evento recebeu na página pública /evento.
// Chave de comparação nome+artista, ignorando acentos/caixa/pontuação —
// usada para saber se uma música pedida já é do repertório do duo
const chaveRepertorio = (nome, artista) => `${normalizarNome(nome)}|${normalizarNome(artista)}`;

function AbaEventoCliente() {
  const navigate = useNavigate();
  const [eventos, setEventos] = useState([]);
  const [contagens, setContagens] = useState({}); // evento_id -> quantidade de músicas
  const [carregandoEventos, setCarregandoEventos] = useState(true);
  const [eventoAbertoId, setEventoAbertoId] = useState(null);
  const [musicasEvento, setMusicasEvento] = useState([]);
  const [carregandoMusicas, setCarregandoMusicas] = useState(false);
  const [filtroRepertorio, setFiltroRepertorio] = useState("todas"); // todas | com | sem
  const [modalMusicaId, setModalMusicaId] = useState(null);

  // Senha do evento aberto (cada show tem a sua — vazio = playlist
  // desativada pra esse evento)
  const [senhaEvento, setSenhaEvento] = useState("");
  const [mostrarSenha, setMostrarSenha] = useState(false);
  const [statusSenha, setStatusSenha] = useState("");

  const [repertorio, setRepertorio] = useState([]);
  useEffect(() => {
    supabase
      .from("musicas")
      .select("id, nome, artista")
      .then(({ data, error }) => {
        if (!error) setRepertorio(data ?? []);
      });
  }, []);

  // Um pedido "está no repertório" quando foi linkado manualmente
  // (musica_id) OU quando nome+artista bate automaticamente — grafias
  // diferentes (ex.: pedido com um nome, repertório cadastrado com outro)
  // não batem sozinhas e precisam do link manual
  const resolverMusicaId = (m) =>
    m.musica_id ??
    repertorio.find((r) => chaveRepertorio(r.nome, r.artista) === chaveRepertorio(m.nome, m.artista))?.id ??
    null;

  const carregarEventos = async () => {
    setCarregandoEventos(true);
    const [{ data: evs, error: e1 }, { data: pedidos, error: e2 }] = await Promise.all([
      supabase
        .from("eventos")
        .select("id, titulo, data, local, senha")
        .order("data", { ascending: false }),
      supabase.from("pedidos_evento").select("evento_id"),
    ]);
    if (!e1) setEventos(evs ?? []);
    if (!e2) {
      const mapa = {};
      for (const p of pedidos ?? []) mapa[p.evento_id] = (mapa[p.evento_id] ?? 0) + 1;
      setContagens(mapa);
    }
    setCarregandoEventos(false);
  };

  useEffect(() => {
    carregarEventos();
  }, []);

  // Sem caracteres ambíguos (0/O, 1/I/L) — mais fácil de ditar por telefone
  const gerarSenha = () => {
    const alfabeto = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let s = "";
    for (let i = 0; i < 6; i++) s += alfabeto[Math.floor(Math.random() * alfabeto.length)];
    setSenhaEvento(s);
  };

  const salvarSenhaEvento = async (e) => {
    e.preventDefault();
    if (!eventoAbertoId) return;
    const nova = senhaEvento.trim() || null; // vazio = desativa a playlist desse evento
    setStatusSenha("⏳ Salvando...");
    const { error } = await supabase
      .from("eventos")
      .update({ senha: nova })
      .eq("id", eventoAbertoId);
    if (error) {
      console.error(error);
      setStatusSenha("❌ Erro ao salvar.");
      return;
    }
    setEventos((lista) =>
      lista.map((ev) => (ev.id === eventoAbertoId ? { ...ev, senha: nova } : ev))
    );
    setStatusSenha(nova ? "✅ Senha atualizada!" : "✅ Playlist desativada pra esse evento.");
    setTimeout(() => setStatusSenha(""), 2500);
  };

  const abrirEvento = async (ev) => {
    setEventoAbertoId(ev.id);
    setSenhaEvento(ev.senha ?? "");
    setMostrarSenha(false);
    setStatusSenha("");
    setFiltroRepertorio("todas");
    setCarregandoMusicas(true);
    const { data, error } = await supabase
      .from("pedidos_evento")
      .select("id, nome, artista, capa, preview_url, created_at, musica_id")
      .eq("evento_id", ev.id)
      .order("created_at");
    if (!error) setMusicasEvento(data ?? []);
    setCarregandoMusicas(false);
  };

  // Cada ação retorna true/false (não lança) — o modal usa isso pra
  // mostrar um erro visível em vez de falhar em silêncio (foi assim que o
  // link ficou "sem fazer nada" quando a policy de UPDATE estava faltando)
  const removerMusica = async (m) => {
    if (!window.confirm(`Remover "${m.nome} — ${m.artista}" da playlist?`)) return true;
    const { error } = await supabase.from("pedidos_evento").delete().eq("id", m.id);
    if (error) {
      console.error(error);
      return false;
    }
    setMusicasEvento((lista) => lista.filter((x) => x.id !== m.id));
    setContagens((c) => ({ ...c, [eventoAbertoId]: Math.max(0, (c[eventoAbertoId] ?? 1) - 1) }));
    return true;
  };

  // Grava o vínculo manual (pedidos_evento.musica_id) — usado tanto depois
  // de criar/achar a música quanto quando o usuário escolhe "Linkar"
  const linkarMusica = async (m, musica) => {
    const { error } = await supabase
      .from("pedidos_evento")
      .update({ musica_id: musica.id })
      .eq("id", m.id);
    if (error) {
      console.error(error);
      return false;
    }
    setRepertorio((rep) => (rep.some((r) => r.id === musica.id) ? rep : [...rep, musica]));
    setMusicasEvento((lista) =>
      lista.map((x) => (x.id === m.id ? { ...x, musica_id: musica.id } : x))
    );
    setModalMusicaId(null);
    return true;
  };

  const adicionarAoRepertorio = async (m) => {
    const { data: existente } = await supabase
      .from("musicas")
      .select("id, nome, artista")
      .ilike("nome", m.nome)
      .ilike("artista", m.artista)
      .maybeSingle();

    const musica = existente ?? (await supabase
      .from("musicas")
      .insert({ nome: m.nome, artista: m.artista })
      .select("id, nome, artista")
      .single()
    ).data;
    if (!musica) return false;
    return await linkarMusica(m, musica);
  };

  const eventoAberto = eventos.find((e) => e.id === eventoAbertoId) ?? null;
  const modalMusica = musicasEvento.find((m) => m.id === modalMusicaId) ?? null;

  return (
    <div className="space-y-6">
      {/* Eventos e suas playlists */}
      <div className="border border-noir-700 rounded-2xl p-5 bg-noir-900/50">
        <h2 className="section-title text-sm mb-1">Playlists por evento</h2>
        <p className="text-xs text-cream-muted mb-4">
          Cada show tem sua própria senha — abra o evento abaixo pra ver ou
          trocar a senha que você passa pra quem contratou.
        </p>
        {carregandoEventos ? (
          <p className="text-cream-muted text-sm py-4">Carregando...</p>
        ) : eventos.length === 0 ? (
          <p className="text-cream-muted text-sm py-4">Nenhum show cadastrado ainda.</p>
        ) : (
          <ul className="divide-y divide-noir-800 max-h-[320px] overflow-y-auto pr-2">
            {eventos.map((ev) => (
              <li key={ev.id} className="py-3">
                <button
                  onClick={() => abrirEvento(ev)}
                  className={`min-w-0 w-full text-left ${
                    eventoAbertoId === ev.id ? "text-gold-300" : "text-cream hover:text-gold-300"
                  } transition`}
                >
                  <p className="truncate flex items-center gap-2">
                    {ev.titulo}
                    <span
                      className={`shrink-0 text-[10px] uppercase tracking-wider rounded-full px-2 py-0.5 border ${
                        ev.senha
                          ? "text-gold-300 border-gold-700"
                          : "text-cream-muted border-noir-600"
                      }`}
                    >
                      {ev.senha ? "🔓 com senha" : "🔒 sem senha"}
                    </span>
                  </p>
                  <p className="text-cream-muted text-xs mt-0.5">
                    {formatarDataCurta(ev.data)}
                    {ev.local ? ` • ${ev.local}` : ""} • {contagens[ev.id] ?? 0} música(s) pedida(s)
                  </p>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {eventoAberto && (
        <div className="border border-noir-700 rounded-2xl p-5 bg-noir-900/50">
          <h2 className="section-title text-sm mb-4">Playlist — {eventoAberto.titulo}</h2>

          {/* Senha desse evento — vazia desativa a playlist pública pra ele */}
          <div className="mb-5 pb-5 border-b border-noir-800">
            <p className="text-xs text-cream-muted mb-2">
              Senha que você passa pra quem contratou esse show. Deixe em
              branco e salve pra desativar a playlist pública dele.
            </p>
            <form onSubmit={salvarSenhaEvento} className="flex gap-2 flex-wrap">
              <div className="relative flex-1 min-w-[160px]">
                <input
                  className="input-noir pr-10 w-full"
                  type={mostrarSenha ? "text" : "password"}
                  value={senhaEvento}
                  onChange={(e) => setSenhaEvento(e.target.value)}
                  placeholder="Sem senha (desativado)"
                  autoComplete="off"
                />
                <button
                  type="button"
                  onClick={() => setMostrarSenha((v) => !v)}
                  aria-label={mostrarSenha ? "Ocultar senha" : "Mostrar senha"}
                  title={mostrarSenha ? "Ocultar senha" : "Mostrar senha"}
                  className="absolute right-0 top-0 h-full w-10 flex items-center justify-center text-cream-muted hover:text-gold-300 transition"
                >
                  <Icone nome="olho" className="w-4 h-4" />
                </button>
              </div>
              <button
                type="button"
                onClick={gerarSenha}
                className="px-4 py-2.5 rounded-xl border border-noir-700 text-sm text-cream-muted hover:text-gold-300 hover:border-gold-600 transition shrink-0"
              >
                Gerar
              </button>
              <button
                type="submit"
                disabled={senhaEvento.trim() === (eventoAberto.senha ?? "")}
                className="btn-gold px-5 py-2.5 rounded-xl text-sm shrink-0 disabled:opacity-50"
              >
                Salvar
              </button>
            </form>
            {statusSenha && <p className="text-sm text-cream-muted mt-2">{statusSenha}</p>}
          </div>

          {carregandoMusicas ? (
            <p className="text-cream-muted text-sm py-4">Carregando...</p>
          ) : musicasEvento.length === 0 ? (
            <p className="text-cream-muted text-sm py-4">
              Ninguém pediu música pra esse evento ainda.
            </p>
          ) : (
            <>
              {/* Filtro por já-no-repertório — ajuda a separar o que precisa ensaiar */}
              <div className="flex gap-2 mb-3">
                {[
                  ["todas", `Todas (${musicasEvento.length})`],
                  [
                    "com",
                    `Já no repertório (${
                      musicasEvento.filter((m) => resolverMusicaId(m)).length
                    })`,
                  ],
                  [
                    "sem",
                    `Fora do repertório (${
                      musicasEvento.filter((m) => !resolverMusicaId(m)).length
                    })`,
                  ],
                ].map(([valor, rotulo]) => (
                  <button
                    key={valor}
                    onClick={() => setFiltroRepertorio(valor)}
                    className={`px-3 py-1.5 rounded-full text-xs tracking-wide transition border ${
                      filtroRepertorio === valor
                        ? "btn-gold border-transparent"
                        : "border-noir-700 text-cream-muted hover:text-cream"
                    }`}
                  >
                    {rotulo}
                  </button>
                ))}
              </div>

              <ul className="divide-y divide-noir-800 max-h-[420px] overflow-y-auto pr-2">
                {musicasEvento
                  .filter((m) => {
                    const noRepertorio = !!resolverMusicaId(m);
                    if (filtroRepertorio === "com") return noRepertorio;
                    if (filtroRepertorio === "sem") return !noRepertorio;
                    return true;
                  })
                  .map((m) => {
                    const noRepertorio = !!resolverMusicaId(m);
                    return (
                      <li key={m.id} className="py-3 flex items-center gap-3">
                        <BotaoOuvir url={m.preview_url} />
                        <button
                          onClick={() => setModalMusicaId(m.id)}
                          className="min-w-0 flex-1 text-left hover:bg-noir-800/50 rounded-lg px-2 -mx-2 py-1 transition"
                        >
                          <p className="text-cream truncate">
                            {m.nome}
                            <span
                              className={`ml-2 text-[10px] uppercase tracking-wider rounded-full px-2 py-0.5 border ${
                                noRepertorio
                                  ? "text-gold-300 border-gold-700"
                                  : "text-amber-300 border-amber-700"
                              }`}
                            >
                              {noRepertorio ? "no repertório" : "fora do repertório"}
                            </span>
                          </p>
                          <p className="text-cream-muted text-sm truncate">{m.artista}</p>
                        </button>
                      </li>
                    );
                  })}
              </ul>
            </>
          )}
        </div>
      )}

      {modalMusica && (
        <ModalAcaoMusicaEvento
          musica={modalMusica}
          resolvedId={resolverMusicaId(modalMusica)}
          repertorio={repertorio}
          navigate={navigate}
          onFechar={() => setModalMusicaId(null)}
          onAdicionar={adicionarAoRepertorio}
          onLinkar={linkarMusica}
          onRemover={removerMusica}
        />
      )}
    </div>
  );
}

// Ação sobre um pedido de evento: adicionar ao repertório, linkar com uma
// música já cadastrada (grafia diferente), ir pra cifra ou remover
function ModalAcaoMusicaEvento({ musica, resolvedId, repertorio, navigate, onFechar, onAdicionar, onLinkar, onRemover }) {
  const [etapa, setEtapa] = useState("menu"); // menu | linkar
  const [buscaLink, setBuscaLink] = useState("");
  const [processando, setProcessando] = useState(false);
  const [erro, setErro] = useState("");

  const candidatos = useMemo(() => {
    const q = normalizarNome(buscaLink);
    const lista = q
      ? repertorio.filter((r) => normalizarNome(`${r.nome} ${r.artista}`).includes(q))
      : repertorio;
    return lista.slice(0, 50);
  }, [repertorio, buscaLink]);

  const executar = async (fn) => {
    setProcessando(true);
    setErro("");
    const ok = await fn();
    setProcessando(false);
    if (ok === false) setErro("Não deu certo. Tente de novo.");
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 p-4"
      onClick={onFechar}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-noir-700 bg-noir-900 p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="min-w-0">
            <p className="text-cream truncate">{musica.nome}</p>
            <p className="text-cream-muted text-sm truncate">{musica.artista}</p>
          </div>
          <button
            onClick={onFechar}
            aria-label="Fechar"
            className="shrink-0 text-cream-muted hover:text-cream text-xl leading-none"
          >
            ×
          </button>
        </div>

        {erro && <p className="text-red-400 text-xs mb-3">{erro}</p>}

        {etapa === "menu" ? (
          <div className="space-y-2">
            <button
              onClick={() => executar(() => onAdicionar(musica))}
              disabled={!!resolvedId || processando}
              className="w-full text-left px-4 py-3 rounded-xl border border-gold-700 text-gold-300 hover:bg-noir-800 transition disabled:opacity-40"
            >
              + Adicionar no repertório
            </button>
            <button
              onClick={() => setEtapa("linkar")}
              disabled={processando}
              className="w-full text-left px-4 py-3 rounded-xl border border-noir-700 text-cream hover:bg-noir-800 transition disabled:opacity-40"
            >
              Linkar com música existente
            </button>
            <button
              onClick={() => resolvedId && navigate(`/cifra/${resolvedId}`)}
              disabled={!resolvedId}
              className="w-full text-left px-4 py-3 rounded-xl border border-noir-700 text-cream hover:bg-noir-800 transition disabled:opacity-40"
            >
              Ir para a cifra
            </button>
            <button
              onClick={() => executar(() => onRemover(musica))}
              disabled={processando}
              className="w-full text-left px-4 py-3 rounded-xl border border-noir-700 text-red-400 hover:bg-noir-800 hover:border-red-900 transition disabled:opacity-40"
            >
              Remover da playlist
            </button>
          </div>
        ) : (
          <div>
            <button
              onClick={() => setEtapa("menu")}
              className="text-xs text-cream-muted hover:text-gold-300 mb-3"
            >
              ‹ Voltar
            </button>
            <input
              autoFocus
              className="input-noir mb-2"
              placeholder="Buscar no repertório..."
              value={buscaLink}
              onChange={(e) => setBuscaLink(e.target.value)}
            />
            <ul className="max-h-64 overflow-y-auto divide-y divide-noir-800">
              {candidatos.map((r) => (
                <li key={r.id}>
                  <button
                    onClick={() => executar(() => onLinkar(musica, r))}
                    disabled={processando}
                    className={`w-full text-left px-2 py-2 text-sm truncate transition disabled:opacity-40 ${
                      r.id === resolvedId ? "text-gold-300" : "text-cream hover:text-gold-300"
                    }`}
                  >
                    {r.nome} <span className="text-cream-muted">— {r.artista}</span>
                  </button>
                </li>
              ))}
              {candidatos.length === 0 && (
                <li className="py-3 text-cream-muted text-sm">Nada encontrado.</li>
              )}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

/* ------------------------- VÍDEOS ------------------------- */

// Aceita link completo do YouTube (watch, youtu.be, shorts, embed) ou o ID puro
function extrairYoutubeId(texto) {
  const t = texto.trim();
  const padroes = [
    /(?:youtube\.com\/watch\?.*v=|youtu\.be\/|youtube\.com\/shorts\/|youtube\.com\/embed\/)([A-Za-z0-9_-]{11})/,
    /^([A-Za-z0-9_-]{11})$/,
  ];
  for (const p of padroes) {
    const m = t.match(p);
    if (m) return m[1];
  }
  return null;
}

// Aceita link de reel/post do Instagram
function extrairInstagramId(texto) {
  const m = texto.trim().match(/instagram\.com\/(?:reel|reels|p)\/([A-Za-z0-9_-]+)/);
  return m ? m[1] : null;
}

/* ------------------------- GORJETA ------------------------- */
// Config única (chave pix + qrcode + liga/desliga) que alimenta o convite
// de gorjeta na página principal e na última etapa do modal de pedido.
function AbaGorjeta() {
  const [dados, setDados] = useState({ pix_chave: "", pix_qrcode_path: null, ativo: false });
  const [carregando, setCarregando] = useState(true);
  const [enviandoQr, setEnviandoQr] = useState(false);
  const [status, setStatus] = useState("");

  const carregar = async () => {
    setCarregando(true);
    const { data, error } = await supabase
      .from("gorjeta")
      .select("pix_chave, pix_qrcode_path, ativo")
      .eq("id", true)
      .maybeSingle();
    if (!error && data) setDados(data);
    setCarregando(false);
  };

  useEffect(() => {
    carregar();
  }, []);

  const salvar = async (e) => {
    e.preventDefault();
    setStatus("⏳ Salvando...");
    const { error } = await supabase
      .from("gorjeta")
      .update({ pix_chave: dados.pix_chave?.trim() || null, ativo: dados.ativo })
      .eq("id", true);

    if (error) {
      console.error(error);
      setStatus("❌ Erro ao salvar.");
      return;
    }
    setStatus("✅ Salvo!");
    setTimeout(() => setStatus(""), 2500);
  };

  const enviarQrCode = async (arquivo) => {
    if (!arquivo) return;
    if (!arquivo.type.startsWith("image/")) {
      setStatus("❌ Envie uma imagem (PNG ou JPG).");
      return;
    }

    setEnviandoQr(true);
    setStatus("⏳ Enviando QR code...");

    // Nome com timestamp: força o navegador a buscar a versão nova em vez
    // de servir a antiga do cache, ao trocar o QR code
    const extensao = arquivo.name.split(".").pop();
    const path = `qrcode-${Date.now()}.${extensao}`;
    const { error: upError } = await supabase.storage
      .from("gorjeta")
      .upload(path, arquivo, { contentType: arquivo.type });

    if (upError) {
      console.error(upError);
      setStatus("❌ Erro ao enviar o QR code.");
      setEnviandoQr(false);
      return;
    }

    const antigo = dados.pix_qrcode_path;
    const { error: dbError } = await supabase
      .from("gorjeta")
      .update({ pix_qrcode_path: path })
      .eq("id", true);

    if (dbError) {
      console.error(dbError);
      setStatus("❌ Erro ao vincular o QR code.");
      setEnviandoQr(false);
      return;
    }
    if (antigo) await supabase.storage.from("gorjeta").remove([antigo]);

    setDados((d) => ({ ...d, pix_qrcode_path: path }));
    setStatus("✅ QR code enviado!");
    setTimeout(() => setStatus(""), 2500);
    setEnviandoQr(false);
  };

  if (carregando) return <p className="text-cream-muted text-sm py-4">Carregando...</p>;

  const qrcodeUrl = dados.pix_qrcode_path
    ? supabase.storage.from("gorjeta").getPublicUrl(dados.pix_qrcode_path).data.publicUrl
    : null;

  return (
    <div className="border border-noir-700 rounded-2xl p-5 bg-noir-900/50 max-w-xl">
      <h2 className="section-title text-sm mb-1">Gorjeta</h2>
      <p className="text-xs text-cream-muted mb-5">
        Configure a chave Pix e o QR code mostrados ao público quando a gorjeta
        estiver ativa — no modal de pedido (depois de enviar) e num botão na
        página principal.
      </p>

      <form onSubmit={salvar} className="space-y-4">
        <label className="flex items-center gap-2.5 text-sm text-cream cursor-pointer">
          <CaixaMarcar
            checked={dados.ativo}
            onChange={(e) => setDados({ ...dados, ativo: e.target.checked })}
          />
          Mostrar convite de gorjeta no site
        </label>

        <input
          className="input-noir"
          placeholder="Chave Pix (CPF, e-mail, telefone ou chave aleatória)"
          value={dados.pix_chave ?? ""}
          onChange={(e) => setDados({ ...dados, pix_chave: e.target.value })}
        />

        <div className="flex items-center gap-4">
          {qrcodeUrl && (
            <img
              src={qrcodeUrl}
              alt="QR code Pix atual"
              className="w-24 h-24 rounded-xl border border-noir-700 bg-white p-1.5"
            />
          )}
          <label
            title={dados.pix_qrcode_path ? "Trocar o QR code" : "Enviar QR code"}
            className={`inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl border text-sm cursor-pointer transition ${
              dados.pix_qrcode_path
                ? "border-gold-600 text-gold-300 hover:bg-noir-800"
                : "border-noir-700 text-cream-muted hover:text-gold-300 hover:border-gold-600"
            } ${enviandoQr ? "opacity-50 pointer-events-none" : ""}`}
          >
            <Icone nome="anexo" className="w-4 h-4" />
            {enviandoQr ? "⏳..." : dados.pix_qrcode_path ? "Trocar QR code" : "Enviar QR code"}
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                enviarQrCode(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
          </label>
        </div>

        <div className="flex items-center gap-3">
          <button type="submit" className="btn-gold px-6 py-2.5 rounded-xl text-sm">
            Salvar
          </button>
          {status && <span className="text-sm text-cream-muted">{status}</span>}
        </div>
      </form>
    </div>
  );
}

/* ------------------------- OCULTAR ------------------------- */

// Checklist com busca opcional — usado pra escolher músicas/estilos/
// artistas dentro de um perfil de ocultação
function ListaSelecao({ titulo, opcoes, selecionados, aoAlternar, comBusca }) {
  const [busca, setBusca] = useState("");
  const visiveis = comBusca
    ? opcoes.filter((o) => o.rotulo.toLowerCase().includes(busca.trim().toLowerCase()))
    : opcoes;

  return (
    <div>
      <p className="text-xs uppercase tracking-wider text-cream-muted mb-2">
        {titulo} ({selecionados.size})
      </p>
      {comBusca && (
        <input
          className="input-noir text-sm mb-2"
          placeholder={`Buscar em ${titulo.toLowerCase()}...`}
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
        />
      )}
      <div className="max-h-48 overflow-y-auto border border-noir-800 rounded-xl p-2 space-y-0.5">
        {visiveis.map((o) => (
          <label
            key={o.valor}
            className="flex items-center gap-2 text-sm text-cream px-1.5 py-1.5 rounded-lg hover:bg-noir-800 cursor-pointer"
          >
            <CaixaMarcar checked={selecionados.has(o.valor)} onChange={() => aoAlternar(o.valor)} />
            <span className="truncate">{o.rotulo}</span>
          </label>
        ))}
        {visiveis.length === 0 && (
          <p className="text-xs text-cream-muted py-2 px-1.5">Nada encontrado.</p>
        )}
      </div>
    </div>
  );
}

const formularioPerfilVazio = () => ({
  id: null,
  nome: "",
  musicasIds: new Set(),
  estilos: new Set(),
  artistas: new Set(),
});

function AbaOcultar() {
  const [musicas, setMusicas] = useState([]);
  const [perfis, setPerfis] = useState([]);
  const [ativo, setAtivo] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [status, setStatus] = useState("");
  const [form, setForm] = useState(null); // null = form fechado
  const [prazoPorPerfil, setPrazoPorPerfil] = useState({}); // perfilId -> texto do campo "dias"

  const carregar = async () => {
    setCarregando(true);
    const [musicasRes, perfisRes, ativoRes] = await Promise.all([
      supabase.from("musicas").select("id, nome, artista, estilo").order("nome"),
      supabase.from("perfis_ocultar").select("*").order("nome"),
      supabase.from("ocultar_ativo").select("*").eq("id", true).maybeSingle(),
    ]);
    if (!musicasRes.error) setMusicas(musicasRes.data ?? []);
    if (!perfisRes.error) setPerfis(perfisRes.data ?? []);

    let linhaAtivo = ativoRes.data ?? null;
    // O prazo (em dias) já passou — volta o repertório completo sozinho.
    // Não há cron neste projeto, então isso é resolvido na próxima vez que
    // alguém abre esta aba (o site público já trata a expiração sozinho,
    // via a view ocultos_ativos; isto aqui só mantém a aba em si coerente)
    if (linhaAtivo?.perfil_id && linhaAtivo.expira_em && new Date(linhaAtivo.expira_em) <= new Date()) {
      await supabase
        .from("ocultar_ativo")
        .update({ perfil_id: null, ativado_em: null, expira_em: null })
        .eq("id", true);
      linhaAtivo = { ...linhaAtivo, perfil_id: null, ativado_em: null, expira_em: null };
    }
    setAtivo(linhaAtivo);
    setCarregando(false);
  };

  useEffect(() => {
    carregar();
  }, []);

  const perfilAtivo = perfis.find((p) => p.id === ativo?.perfil_id) ?? null;

  const opcoesEstilos = Array.from(new Set(musicas.map((m) => m.estilo).filter(Boolean)))
    .sort((a, b) => a.localeCompare(b, "pt-BR"))
    .map((e) => ({ valor: e, rotulo: e }));
  const opcoesArtistas = Array.from(new Set(musicas.map((m) => m.artista).filter(Boolean)))
    .sort((a, b) => a.localeCompare(b, "pt-BR"))
    .map((a) => ({ valor: a, rotulo: a }));
  const opcoesMusicas = musicas.map((m) => ({ valor: m.id, rotulo: `${m.nome} — ${m.artista}` }));

  const alternarNoSet = (chave) => (valor) =>
    setForm((f) => {
      const novoSet = new Set(f[chave]);
      novoSet.has(valor) ? novoSet.delete(valor) : novoSet.add(valor);
      return { ...f, [chave]: novoSet };
    });

  const editarPerfil = (p) => {
    setForm({
      id: p.id,
      nome: p.nome,
      musicasIds: new Set(p.musicas_ids ?? []),
      estilos: new Set(p.estilos ?? []),
      artistas: new Set(p.artistas ?? []),
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const salvarPerfil = async (e) => {
    e.preventDefault();
    const nome = form.nome.trim();
    if (!nome) return;

    const registro = {
      nome,
      musicas_ids: Array.from(form.musicasIds),
      estilos: Array.from(form.estilos),
      artistas: Array.from(form.artistas),
    };

    setStatus("⏳ Salvando...");
    const { error } = form.id
      ? await supabase.from("perfis_ocultar").update(registro).eq("id", form.id)
      : await supabase.from("perfis_ocultar").insert(registro);

    if (error) {
      console.error(error);
      setStatus("❌ Erro ao salvar.");
      return;
    }
    setStatus("✅ Perfil salvo!");
    setTimeout(() => setStatus(""), 2500);
    setForm(null);
    carregar();
  };

  const excluirPerfil = async (p) => {
    if (!window.confirm(`Excluir o perfil "${p.nome}"?`)) return;
    const { error } = await supabase.from("perfis_ocultar").delete().eq("id", p.id);
    if (error) {
      console.error(error);
      setStatus("❌ Erro ao excluir.");
      return;
    }
    carregar();
  };

  const ativarPerfil = async (perfil) => {
    const diasTexto = (prazoPorPerfil[perfil.id] ?? "").trim();
    const dias = diasTexto ? Number(diasTexto) : null;
    if (diasTexto && (!Number.isFinite(dias) || dias <= 0)) {
      setStatus("❌ Prazo inválido — use um número de dias maior que zero, ou deixe em branco.");
      return;
    }

    const agora = new Date();
    const expiraEm = dias ? new Date(agora.getTime() + dias * 86_400_000).toISOString() : null;

    setStatus("⏳ Ativando...");
    const { error } = await supabase
      .from("ocultar_ativo")
      .update({ perfil_id: perfil.id, ativado_em: agora.toISOString(), expira_em: expiraEm })
      .eq("id", true);

    if (error) {
      console.error(error);
      setStatus("❌ Erro ao ativar.");
      return;
    }
    setStatus(`✅ "${perfil.nome}" ativado!`);
    setTimeout(() => setStatus(""), 2500);
    carregar();
  };

  const desativar = async () => {
    setStatus("⏳ Restaurando repertório completo...");
    const { error } = await supabase
      .from("ocultar_ativo")
      .update({ perfil_id: null, ativado_em: null, expira_em: null })
      .eq("id", true);

    if (error) {
      console.error(error);
      setStatus("❌ Erro ao desativar.");
      return;
    }
    setStatus("✅ Repertório completo de volta!");
    setTimeout(() => setStatus(""), 2500);
    carregar();
  };

  if (carregando) return <p className="text-cream-muted text-sm py-4">Carregando...</p>;

  return (
    <div className="space-y-6">
      {/* Estado atual */}
      <div className="border border-noir-700 rounded-2xl p-5 bg-noir-900/50">
        <h2 className="section-title text-sm mb-3">Estado atual</h2>
        {perfilAtivo ? (
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="min-w-0">
              <p className="text-cream">
                Perfil ativo: <span className="text-gold-300 font-medium">{perfilAtivo.nome}</span>
              </p>
              <p className="text-cream-muted text-xs mt-1">
                Ativado em {new Date(ativo.ativado_em).toLocaleString("pt-BR")}
                {ativo.expira_em
                  ? ` — repertório completo volta em ${new Date(ativo.expira_em).toLocaleString("pt-BR")}`
                  : " — sem prazo (volta só quando você desativar)"}
              </p>
              <p className="text-cream-muted text-xs mt-1">
                Oculta {perfilAtivo.musicas_ids?.length ?? 0} música(s),{" "}
                {perfilAtivo.estilos?.length ?? 0} estilo(s) e {perfilAtivo.artistas?.length ?? 0}{" "}
                artista(s).
              </p>
            </div>
            <button
              onClick={desativar}
              className="shrink-0 px-4 py-2 rounded-xl border border-gold-600 text-sm text-gold-300 hover:bg-noir-800 transition"
            >
              Restaurar repertório completo
            </button>
          </div>
        ) : (
          <p className="text-cream-muted text-sm">
            Repertório completo — nenhum perfil de ocultação ativo no momento.
          </p>
        )}
        {status && <p className="text-sm text-cream-muted mt-3">{status}</p>}
      </div>

      {/* Formulário de criação/edição */}
      {form && (
        <form
          onSubmit={salvarPerfil}
          className="border border-noir-700 rounded-2xl p-5 bg-noir-900/50 space-y-4"
        >
          <h2 className="section-title text-sm">{form.id ? "Editar perfil" : "Novo perfil"}</h2>
          <input
            className="input-noir"
            placeholder="Nome do perfil (ex.: nome da casa/evento) *"
            value={form.nome}
            onChange={(e) => setForm({ ...form, nome: e.target.value })}
            required
          />

          <div className="grid gap-4 sm:grid-cols-3">
            <ListaSelecao
              titulo="Estilos"
              opcoes={opcoesEstilos}
              selecionados={form.estilos}
              aoAlternar={alternarNoSet("estilos")}
              comBusca
            />
            <ListaSelecao
              titulo="Artistas"
              opcoes={opcoesArtistas}
              selecionados={form.artistas}
              aoAlternar={alternarNoSet("artistas")}
              comBusca
            />
            <ListaSelecao
              titulo="Músicas"
              opcoes={opcoesMusicas}
              selecionados={form.musicasIds}
              aoAlternar={alternarNoSet("musicasIds")}
              comBusca
            />
          </div>

          <div className="flex items-center gap-3">
            <button type="submit" className="btn-gold px-6 py-2.5 rounded-xl text-sm">
              Salvar perfil
            </button>
            <button
              type="button"
              onClick={() => setForm(null)}
              className="px-4 py-2.5 rounded-xl border border-noir-700 text-sm text-cream-muted hover:text-cream transition"
            >
              Cancelar
            </button>
          </div>
        </form>
      )}

      {/* Perfis salvos */}
      <div className="border border-noir-700 rounded-2xl p-5 bg-noir-900/50">
        <div className="flex items-center justify-between mb-3">
          <h2 className="section-title text-sm">Perfis salvos ({perfis.length})</h2>
          {!form && (
            <button
              onClick={() => setForm(formularioPerfilVazio())}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-noir-700 text-xs text-cream-muted hover:text-gold-300 hover:border-gold-600 transition"
            >
              <Icone nome="mais" className="w-3.5 h-3.5" />
              Novo perfil
            </button>
          )}
        </div>

        {perfis.length === 0 ? (
          <p className="text-cream-muted text-sm py-4">
            Nenhum perfil salvo ainda. Crie um pra reaproveitar toda vez que tocar naquela casa.
          </p>
        ) : (
          <ul className="divide-y divide-noir-800">
            {perfis.map((p) => (
              <li key={p.id} className="py-3 flex items-center justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <p className="text-cream truncate">
                    {p.nome}
                    {ativo?.perfil_id === p.id && (
                      <span className="ml-2 text-[10px] uppercase tracking-wider text-gold-300 border border-gold-600 rounded-full px-2 py-0.5">
                        ativo
                      </span>
                    )}
                  </p>
                  <p className="text-cream-muted text-xs mt-0.5">
                    {(p.musicas_ids?.length ?? 0)} música(s), {(p.estilos?.length ?? 0)} estilo(s),{" "}
                    {(p.artistas?.length ?? 0)} artista(s)
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
                  <input
                    type="number"
                    min="1"
                    className="input-noir !w-28 text-sm py-1.5"
                    placeholder="Prazo (dias)"
                    value={prazoPorPerfil[p.id] ?? ""}
                    onChange={(e) =>
                      setPrazoPorPerfil((estado) => ({ ...estado, [p.id]: e.target.value }))
                    }
                  />
                  <button
                    onClick={() => ativarPerfil(p)}
                    className="btn-gold px-3 py-1.5 rounded-lg text-xs"
                  >
                    Ativar
                  </button>
                  <button
                    onClick={() => editarPerfil(p)}
                    className="px-3 py-1.5 rounded-lg border border-noir-700 text-xs text-cream-muted hover:text-gold-300 hover:border-gold-600 transition"
                  >
                    Editar
                  </button>
                  <button
                    onClick={() => excluirPerfil(p)}
                    className="px-3 py-1.5 rounded-lg border border-noir-700 text-xs text-cream-muted hover:text-red-400 hover:border-red-900 transition"
                  >
                    Excluir
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

/* ------------------------- PLAYLISTS ------------------------- */
// Roteiros de show com ordem definida — só o admin vê (não é uma
// funcionalidade pública). musicas_ids é um array ordenado: a posição no
// array é a ordem de execução.
// Um item da ordem é { musica_id } (referência ao repertório) ou
// { extra_id, nome, artista, estilo } (música avulsa, só desta playlist).
// Playlists antigas só têm a coluna musicas_ids (array de uuid) — convertida
// aqui na hora da leitura; ao salvar qualquer mudança, a playlist já passa a
// gravar no formato novo (itens).
const itensDaPlaylist = (p) =>
  p.itens?.length ? p.itens : (p.musicas_ids ?? []).map((id) => ({ musica_id: id }));

function AbaPlaylists() {
  const [musicas, setMusicas] = useState([]);
  const [playlists, setPlaylists] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [status, setStatus] = useState("");
  const [abertaId, setAbertaId] = useState(null);
  const [novoNome, setNovoNome] = useState("");
  const [buscaAdicionar, setBuscaAdicionar] = useState("");
  const [nomeEditando, setNomeEditando] = useState("");
  // O painel "Adicionar música" fica escondido até o admin clicar no botão —
  // a Ordem é o que se quer ver de cara ao abrir uma playlist
  const [mostrarAdicionar, setMostrarAdicionar] = useState(false);
  // Abre o modal de busca no iTunes pra cadastrar uma música avulsa
  // (fora do repertório) direto na ordem desta playlist
  const [adicionandoExtra, setAdicionandoExtra] = useState(false);
  // Trava mover/adicionar/remover enquanto uma dessas ações ainda está
  // salvando — sem isso, clicar duas vezes rápido (ex.: ↑ ↑) faz a segunda
  // chamada partir do mesmo estado "antigo" da primeira (fechado no
  // closure de quando o botão foi clicado), e quem responder por último
  // vence mesmo não sendo a mudança mais recente, perdendo a outra
  const [salvandoOrdem, setSalvandoOrdem] = useState(false);

  const carregar = async () => {
    setCarregando(true);
    const [musicasRes, playlistsRes] = await Promise.all([
      supabase.from("musicas").select("id, nome, artista, estilo").order("nome"),
      supabase.from("playlists").select("*").order("nome"),
    ]);
    if (!musicasRes.error) setMusicas(musicasRes.data ?? []);
    if (!playlistsRes.error) setPlaylists(playlistsRes.data ?? []);
    setCarregando(false);
  };

  useEffect(() => {
    carregar();
  }, []);

  const musicaPorId = new Map(musicas.map((m) => [m.id, m]));
  const playlistAberta = playlists.find((p) => p.id === abertaId) ?? null;
  const itensAbertos = playlistAberta ? itensDaPlaylist(playlistAberta) : [];

  const abrirPlaylist = (p) => {
    setAbertaId(p.id);
    setNomeEditando(p.nome);
    setBuscaAdicionar("");
    setMostrarAdicionar(false);
  };

  // Nome/artista pra exibir e pra tocar o trecho no iTunes — resolve pelo
  // repertório quando o item referencia uma música cadastrada, ou usa os
  // dados salvos direto no item quando é avulsa (fora do repertório)
  const infoDoItem = (item) => {
    if (item.musica_id) {
      const m = musicaPorId.get(item.musica_id);
      return m
        ? { nome: m.nome, artista: m.artista, extra: false }
        : { nome: "(música removida do repertório)", artista: "", extra: false };
    }
    return { nome: item.nome, artista: item.artista, extra: true };
  };

  const criarPlaylist = async (e) => {
    e.preventDefault();
    const nome = novoNome.trim();
    if (!nome) return;

    setStatus("⏳ Criando...");
    const { data, error } = await supabase
      .from("playlists")
      .insert({ nome, musicas_ids: [] })
      .select()
      .single();

    if (error) {
      console.error(error);
      setStatus("❌ Erro ao criar.");
      return;
    }
    setStatus("");
    setNovoNome("");
    setPlaylists((ps) => [...ps, data].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")));
    abrirPlaylist(data);
  };

  const excluirPlaylist = async (p) => {
    if (!window.confirm(`Excluir a playlist "${p.nome}"?`)) return;
    const { error } = await supabase.from("playlists").delete().eq("id", p.id);
    if (error) {
      console.error(error);
      setStatus("❌ Erro ao excluir.");
      return;
    }
    if (abertaId === p.id) setAbertaId(null);
    carregar();
  };

  // Persiste a nova ordem (ou lista) de itens — atualiza o estado local na
  // hora (otimista) pra reordenar parecer instantâneo, e recarrega tudo se
  // o servidor recusar, pra não deixar a tela mentindo sobre o que foi
  // salvo de verdade
  const salvarItens = async (playlistId, novosItens) => {
    setSalvandoOrdem(true);
    setPlaylists((ps) =>
      ps.map((p) => (p.id === playlistId ? { ...p, itens: novosItens } : p))
    );
    const { error } = await supabase
      .from("playlists")
      .update({ itens: novosItens })
      .eq("id", playlistId);
    if (error) {
      console.error(error);
      setStatus("❌ Erro ao salvar — recarregando.");
      carregar();
    }
    setSalvandoOrdem(false);
  };

  const renomear = async () => {
    const nome = nomeEditando.trim();
    if (!playlistAberta || !nome || nome === playlistAberta.nome) return;
    setPlaylists((ps) => ps.map((p) => (p.id === playlistAberta.id ? { ...p, nome } : p)));
    const { error } = await supabase
      .from("playlists")
      .update({ nome })
      .eq("id", playlistAberta.id);
    if (error) {
      console.error(error);
      setStatus("❌ Erro ao renomear.");
      carregar();
    }
  };

  const adicionarMusica = (musicaId) => {
    if (!playlistAberta || salvandoOrdem) return;
    if (itensAbertos.some((it) => it.musica_id === musicaId)) return;
    salvarItens(playlistAberta.id, [...itensAbertos, { musica_id: musicaId }]);
  };

  // Cadastra a música avulsa (dados vindos do modal de busca no iTunes,
  // digitados manualmente ou preenchidos pela sugestão escolhida) direto na
  // ordem desta playlist — nunca na tabela musicas, ela não entra pro
  // repertório
  const confirmarAdicionarExtra = async ({ nome, artista, estilo }) => {
    if (!playlistAberta) return;
    const item = {
      extra_id: crypto.randomUUID(),
      nome,
      artista,
      estilo: estilo || null,
    };
    await salvarItens(playlistAberta.id, [...itensAbertos, item]);
    setAdicionandoExtra(false);
    setStatus(`✅ "${nome}" adicionada (fora do repertório)!`);
    setTimeout(() => setStatus(""), 2500);
  };

  const removerItem = (indice) => {
    if (!playlistAberta || salvandoOrdem) return;
    salvarItens(
      playlistAberta.id,
      itensAbertos.filter((_, i) => i !== indice)
    );
  };

  const moverItem = (indice, direcao) => {
    if (!playlistAberta || salvandoOrdem) return;
    const alvo = indice + direcao;
    if (alvo < 0 || alvo >= itensAbertos.length) return;
    const nova = [...itensAbertos];
    [nova[indice], nova[alvo]] = [nova[alvo], nova[indice]];
    salvarItens(playlistAberta.id, nova);
  };

  const idsNaPlaylist = new Set(itensAbertos.filter((it) => it.musica_id).map((it) => it.musica_id));
  const musicasDisponiveis = playlistAberta
    ? musicas.filter((m) => {
        if (idsNaPlaylist.has(m.id)) return false;
        const q = buscaAdicionar.trim().toLowerCase();
        if (!q) return true;
        return `${m.nome} ${m.artista}`.toLowerCase().includes(q);
      })
    : [];

  if (carregando) return <p className="text-cream-muted text-sm py-4">Carregando...</p>;

  return (
    <div className="space-y-6">
      {/* Playlists salvas */}
      <div className="border border-noir-700 rounded-2xl p-5 bg-noir-900/50">
        <h2 className="section-title text-sm mb-4">Playlists ({playlists.length})</h2>

        <form onSubmit={criarPlaylist} className="flex gap-2 mb-4">
          <input
            className="input-noir"
            placeholder="Nome da nova playlist (ex.: Repertório do show de sábado)"
            value={novoNome}
            onChange={(e) => setNovoNome(e.target.value)}
          />
          <button type="submit" className="btn-gold px-5 py-2.5 rounded-xl text-sm shrink-0">
            Criar
          </button>
        </form>

        {status && <p className="text-sm text-cream-muted mb-3">{status}</p>}

        {playlists.length === 0 ? (
          <p className="text-cream-muted text-sm py-2">Nenhuma playlist salva ainda.</p>
        ) : (
          <ul className="divide-y divide-noir-800">
            {playlists.map((p) => (
              <li key={p.id} className="py-3 flex items-center justify-between gap-3">
                <button
                  onClick={() => abrirPlaylist(p)}
                  className={`min-w-0 flex-1 text-left ${
                    abertaId === p.id ? "text-gold-300" : "text-cream hover:text-gold-300"
                  } transition`}
                >
                  <p className="truncate">{p.nome}</p>
                  <p className="text-cream-muted text-xs mt-0.5">
                    {itensDaPlaylist(p).length} música(s)
                  </p>
                </button>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => abrirPlaylist(p)}
                    className="px-3 py-1.5 rounded-lg border border-noir-700 text-xs text-cream-muted hover:text-gold-300 hover:border-gold-600 transition"
                  >
                    {abertaId === p.id ? "Editando" : "Abrir"}
                  </button>
                  <button
                    onClick={() => excluirPlaylist(p)}
                    className="px-3 py-1.5 rounded-lg border border-noir-700 text-xs text-cream-muted hover:text-red-400 hover:border-red-900 transition"
                  >
                    Excluir
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Editor da playlist aberta */}
      {playlistAberta && (
        <div className="border border-noir-700 rounded-2xl p-5 bg-noir-900/50">
          <div className="flex items-center gap-2 mb-4">
            <input
              className="input-noir"
              value={nomeEditando}
              onChange={(e) => setNomeEditando(e.target.value)}
              onBlur={renomear}
            />
            <button
              onClick={() => setAbertaId(null)}
              className="shrink-0 px-4 py-2.5 rounded-xl border border-noir-700 text-sm text-cream-muted hover:text-cream transition"
            >
              Fechar
            </button>
          </div>

          {/* Ordem da playlist */}
          <div className="flex items-center justify-between gap-3 mb-2">
            <p className="text-xs uppercase tracking-wider text-cream-muted">
              Ordem ({itensAbertos.length})
            </p>
            <button
              onClick={() => setMostrarAdicionar((v) => !v)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs shrink-0 btn-gold"
            >
              <Icone nome="mais" className="w-3.5 h-3.5" />
              Adicionar música
            </button>
          </div>

          {itensAbertos.length === 0 ? (
            <p className="text-cream-muted text-sm border border-noir-800 rounded-xl p-4">
              Nenhuma música ainda — clique em "Adicionar música".
            </p>
          ) : (
            <ol className="border border-noir-800 rounded-xl divide-y divide-noir-800 max-h-96 overflow-y-auto">
              {itensAbertos.map((item, i) => {
                const info = infoDoItem(item);
                return (
                  <li
                    key={item.musica_id ?? item.extra_id}
                    className="flex items-center gap-2 px-3 py-2"
                  >
                    <span className="text-cream-muted text-xs w-5 shrink-0 text-right">
                      {i + 1}.
                    </span>
                    <BotaoOuvir nome={info.nome} artista={info.artista} />
                    <span className="min-w-0 flex-1 truncate text-sm text-cream">
                      {info.artista ? `${info.nome} — ${info.artista}` : info.nome}
                      {info.extra && (
                        <span
                          title="Música avulsa — não está no repertório"
                          className="ml-2 text-[10px] uppercase tracking-wider text-gold-300 border border-gold-700 rounded-full px-2 py-0.5"
                        >
                          fora do repertório
                        </span>
                      )}
                    </span>
                    <button
                      onClick={() => moverItem(i, -1)}
                      disabled={i === 0 || salvandoOrdem}
                      aria-label="Mover para cima"
                      className="shrink-0 w-7 h-7 rounded-md border border-noir-700 text-cream-muted text-xs hover:text-gold-300 hover:border-gold-600 transition disabled:opacity-30 disabled:pointer-events-none"
                    >
                      ↑
                    </button>
                    <button
                      onClick={() => moverItem(i, 1)}
                      disabled={i === itensAbertos.length - 1 || salvandoOrdem}
                      aria-label="Mover para baixo"
                      className="shrink-0 w-7 h-7 rounded-md border border-noir-700 text-cream-muted text-xs hover:text-gold-300 hover:border-gold-600 transition disabled:opacity-30 disabled:pointer-events-none"
                    >
                      ↓
                    </button>
                    <button
                      onClick={() => removerItem(i)}
                      disabled={salvandoOrdem}
                      aria-label="Remover da playlist"
                      className="shrink-0 w-7 h-7 rounded-md border border-noir-700 text-cream-muted text-xs hover:text-red-400 hover:border-red-900 transition disabled:opacity-30 disabled:pointer-events-none"
                    >
                      ✕
                    </button>
                  </li>
                );
              })}
            </ol>
          )}

          {/* Painel "Adicionar música" — só aparece depois de clicar no botão */}
          {mostrarAdicionar && (
            <div className="mt-5 border border-noir-800 rounded-xl p-4 bg-noir-950/40">
              <div className="flex items-center justify-between gap-3 mb-2">
                <p className="text-xs uppercase tracking-wider text-cream-muted">
                  Adicionar do repertório
                </p>
                <button
                  onClick={() => setAdicionandoExtra(true)}
                  className="shrink-0 text-xs text-gold-300 hover:underline"
                >
                  Não está no repertório? Adicionar avulsa
                </button>
              </div>
              <input
                className="input-noir text-sm mb-2"
                placeholder="Buscar música ou artista..."
                value={buscaAdicionar}
                onChange={(e) => setBuscaAdicionar(e.target.value)}
              />
              <div className="max-h-72 overflow-y-auto border border-noir-800 rounded-xl divide-y divide-noir-800">
                {musicasDisponiveis.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => adicionarMusica(m.id)}
                    disabled={salvandoOrdem}
                    className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left hover:bg-noir-800 transition disabled:opacity-40 disabled:pointer-events-none"
                  >
                    <span className="min-w-0 truncate text-sm text-cream">
                      {m.nome} — {m.artista}
                    </span>
                    <Icone nome="mais" className="w-4 h-4 text-gold-400 shrink-0" />
                  </button>
                ))}
                {musicasDisponiveis.length === 0 && (
                  <p className="text-cream-muted text-sm px-3 py-4">
                    {musicas.length === 0 ? "Repertório vazio." : "Nada encontrado."}
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {adicionandoExtra && (
        <ModalBuscaItunes
          nomeInicial=""
          titulo="Adicionar música fora do repertório"
          descricao="Essa música entra só nesta playlist — não é cadastrada no repertório. Busque no iTunes pra preencher automático, ou digite manualmente."
          textoConfirmar="Adicionar à playlist"
          onFechar={() => setAdicionandoExtra(false)}
          onConfirmar={confirmarAdicionarExtra}
        />
      )}
    </div>
  );
}

function GerenciarVideos() {
  const [videos, setVideos] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [form, setForm] = useState({ titulo: "", link: "" });
  const [editandoId, setEditandoId] = useState(null);
  const [status, setStatus] = useState("");

  const carregar = async () => {
    setCarregando(true);
    const { data, error } = await supabase
      .from("videos")
      .select("*")
      .order("created_at", { ascending: false });
    if (!error) setVideos(data ?? []);
    setCarregando(false);
  };

  useEffect(() => {
    carregar();
  }, []);

  const salvar = async (e) => {
    e.preventDefault();
    const titulo = form.titulo.trim();
    const youtubeId = extrairYoutubeId(form.link);
    const instagramId = youtubeId ? null : extrairInstagramId(form.link);

    if (!titulo) return;
    if (!youtubeId && !instagramId) {
      setStatus("❌ Link inválido. Cole um link do YouTube ou de um Reel do Instagram.");
      return;
    }

    setStatus("⏳ Salvando...");
    const registro = { titulo, youtube_id: youtubeId, instagram_id: instagramId };
    const { error } = editandoId
      ? await supabase.from("videos").update(registro).eq("id", editandoId)
      : await supabase.from("videos").insert(registro);

    if (error) {
      console.error(error);
      setStatus("❌ Erro ao salvar. Tente novamente.");
      return;
    }

    setForm({ titulo: "", link: "" });
    setEditandoId(null);
    setStatus(editandoId ? "✅ Vídeo atualizado!" : "✅ Vídeo adicionado!");
    setTimeout(() => setStatus(""), 2500);
    carregar();
  };

  const editar = (v) => {
    setEditandoId(v.id);
    setForm({
      titulo: v.titulo,
      link: v.youtube_id
        ? `https://youtu.be/${v.youtube_id}`
        : `https://www.instagram.com/reel/${v.instagram_id}/`,
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const cancelarEdicao = () => {
    setEditandoId(null);
    setForm({ titulo: "", link: "" });
  };

  const excluir = async (v) => {
    if (!window.confirm(`Excluir o vídeo "${v.titulo}"?`)) return;
    const { error } = await supabase.from("videos").delete().eq("id", v.id);
    if (error) {
      console.error(error);
      setStatus("❌ Erro ao excluir.");
      return;
    }
    carregar();
  };

  return (
    <div>
      {/* Formulário */}
      <form
        onSubmit={salvar}
        className="border border-noir-700 rounded-2xl p-5 bg-noir-900/50 mb-6"
      >
        <h2 className="section-title text-sm mb-4">
          {editandoId ? "Editar vídeo" : "Adicionar vídeo"}
        </h2>

        <div className="grid gap-3 sm:grid-cols-2">
          <input
            className="input-noir"
            placeholder="Título (ex.: Trevo (Tu) - Anavitória) *"
            value={form.titulo}
            onChange={(e) => setForm({ ...form, titulo: e.target.value })}
            required
          />
          <input
            className="input-noir"
            placeholder="Link do YouTube ou Reel do Instagram *"
            value={form.link}
            onChange={(e) => setForm({ ...form, link: e.target.value })}
            required
          />
        </div>

        <div className="mt-4 flex items-center gap-3">
          <button type="submit" className="btn-gold px-6 py-2.5 rounded-xl text-sm">
            {editandoId ? "Salvar alterações" : "Adicionar"}
          </button>
          {editandoId && (
            <button
              type="button"
              onClick={cancelarEdicao}
              className="px-4 py-2.5 rounded-xl border border-noir-700 text-sm text-cream-muted hover:text-cream transition"
            >
              Cancelar
            </button>
          )}
          {status && <span className="text-sm text-cream-muted">{status}</span>}
        </div>
      </form>

      {/* Lista */}
      <div className="border border-noir-700 rounded-2xl p-5 bg-noir-900/50">
        <h2 className="section-title text-sm mb-3">Vídeos ({videos.length})</h2>

        {carregando ? (
          <p className="text-cream-muted text-sm py-4">Carregando...</p>
        ) : (
          <ul className="divide-y divide-noir-800">
            {videos.map((v) => (
              <li key={v.id} className="py-3 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  {v.youtube_id ? (
                    <img
                      src={`https://img.youtube.com/vi/${v.youtube_id}/default.jpg`}
                      alt=""
                      className="w-20 h-12 object-cover rounded-lg border border-noir-700 shrink-0"
                    />
                  ) : (
                    <span className="w-20 h-12 rounded-lg border border-noir-700 shrink-0 flex items-center justify-center">
                      <Icone nome="camera" className="w-5 h-5 text-cream-muted" />
                    </span>
                  )}
                  <div className="min-w-0">
                    <p className="text-cream truncate">{v.titulo}</p>
                    <a
                      href={
                        v.youtube_id
                          ? `https://youtu.be/${v.youtube_id}`
                          : `https://www.instagram.com/reel/${v.instagram_id}/`
                      }
                      target="_blank"
                      rel="noreferrer"
                      className="text-cream-muted text-xs hover:text-gold-300 transition"
                    >
                      {v.youtube_id
                        ? `youtu.be/${v.youtube_id}`
                        : `instagram.com/reel/${v.instagram_id}`}
                    </a>
                  </div>
                </div>
                <div className="flex gap-2 shrink-0">
                  <button
                    onClick={() => editar(v)}
                    className="px-3 py-1.5 rounded-lg border border-noir-700 text-xs text-cream-muted hover:text-gold-300 hover:border-gold-600 transition"
                  >
                    Editar
                  </button>
                  <button
                    onClick={() => excluir(v)}
                    className="px-3 py-1.5 rounded-lg border border-noir-700 text-xs text-cream-muted hover:text-red-400 hover:border-red-900 transition"
                  >
                    Excluir
                  </button>
                </div>
              </li>
            ))}
            {videos.length === 0 && (
              <li className="py-4 text-cream-muted text-sm">
                Nenhum vídeo. Cole o link de um vídeo do YouTube acima.
              </li>
            )}
          </ul>
        )}
      </div>
    </div>
  );
}

/* ------------------------- ACESSOS ------------------------- */

// Usa os componentes de data LOCAIS (ano/mês/dia), não toISOString() — essa
// converte pra UTC antes de formatar, e à noite num fuso atrás de UTC
// (Brasil, UTC-3) o "hoje" em UTC já é o dia seguinte, pedindo uma data
// futura pro GoatCounter (que aí não acha nada e responde 404)
const dataIso = (diasAtras = 0) => {
  const d = new Date();
  d.setDate(d.getDate() - diasAtras);
  const ano = d.getFullYear();
  const mes = String(d.getMonth() + 1).padStart(2, "0");
  const dia = String(d.getDate()).padStart(2, "0");
  return `${ano}-${mes}-${dia}`;
};

// Endpoint público de contador do GoatCounter (sem chave/senha)
async function contarAcessos(caminho, inicio) {
  try {
    // Obs.: o parâmetro "end" retorna 404 nesse endpoint — usar só "start"
    const url =
      `https://${GOATCOUNTER_CODE}.goatcounter.com/counter/` +
      `${encodeURIComponent(caminho)}.json?start=${inicio}`;
    const resp = await fetch(url);
    if (!resp.ok) return null;
    const json = await resp.json();
    // "count" vem formatado como texto (ex.: "1 234")
    const n = parseInt(String(json.count).replace(/\D/g, ""), 10);
    return Number.isNaN(n) ? 0 : n;
  } catch {
    return null;
  }
}

function AbaAcessos() {
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState(false);

  const carregar = async () => {
    setDados(null);
    setErro(false);
    const periodos = [
      ["hoje", dataIso(0)],
      ["7 dias", dataIso(6)],
      ["30 dias", dataIso(29)],
    ];
    // As 6 chamadas são independentes — paralelizar deixa o carregamento
    // bem mais rápido do que esperar uma de cada vez
    const resultado = await Promise.all(
      periodos.map(async ([rotulo, inicio]) => {
        const [publico, admin] = await Promise.all([
          contarAcessos("/", inicio),
          contarAcessos("/admin", inicio),
        ]);
        return { rotulo, publico, admin };
      })
    );
    if (resultado.every((r) => r.publico === null && r.admin === null)) {
      setErro(true);
      return;
    }
    setDados(resultado);
  };

  useEffect(() => {
    carregar();
  }, []);

  return (
    <div className="border border-noir-700 rounded-2xl p-5 bg-noir-900/50">
      <div className="flex items-center justify-between mb-4">
        <h2 className="section-title text-sm">Visitas ao site</h2>
        <div className="flex gap-4">
          <button
            onClick={carregar}
            className="text-xs text-cream-muted hover:text-gold-300 transition"
          >
            ↻ Atualizar
          </button>
          <a
            href={`https://${GOATCOUNTER_CODE}.goatcounter.com`}
            target="_blank"
            rel="noreferrer"
            className="text-xs text-cream-muted hover:text-gold-300 transition"
          >
            Painel completo ›
          </a>
        </div>
      </div>

      {erro ? (
        <p className="text-cream-muted text-sm py-4">
          Não foi possível carregar os números agora. Veja no{" "}
          <a
            href={`https://${GOATCOUNTER_CODE}.goatcounter.com`}
            target="_blank"
            rel="noreferrer"
            className="text-gold-300 hover:underline"
          >
            painel do GoatCounter
          </a>
          .
        </p>
      ) : !dados ? (
        <p className="text-cream-muted text-sm py-4">Carregando...</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-3">
          {dados.map((d) => (
            <div
              key={d.rotulo}
              className="border border-noir-700 rounded-xl p-4 text-center"
            >
              <p className="text-[10px] uppercase tracking-wider text-cream-muted mb-2">
                {d.rotulo}
              </p>
              <p className="text-3xl font-display text-gold-300">
                {d.publico ?? "—"}
              </p>
              <p className="text-xs text-cream-muted mt-1">visitas ao site</p>
              <p className="text-cream-muted/60 text-[11px] mt-2">
                área do músico: {d.admin ?? "—"}
              </p>
            </div>
          ))}
        </div>
      )}

      <p className="text-cream-muted/60 text-[11px] mt-4">
        "Visitas ao site"/"área do músico" contam cada carregamento de página
        (pageviews) — não visitantes únicos. Pra ver "Visits" (estimativa de
        visitantes únicos) x "Pageviews", confira o{" "}
        <a
          href={`https://${GOATCOUNTER_CODE}.goatcounter.com`}
          target="_blank"
          rel="noreferrer"
          className="text-gold-300 hover:underline"
        >
          painel completo do GoatCounter
        </a>
        .
      </p>
    </div>
  );
}

/* ------------------------- PEDIDOS ------------------------- */

// Prefixo usado pelo modal público quando a música não está no repertório
const PREFIXO_SUGESTAO = "[Sugestão]";
// Mesma origem (busca sem resultado → "Pedir para entrar no repertório"),
// mas o SugestaoModal detectou que a música já é nossa — só está oculta no
// momento (perfil ativo na aba Ocultar) — pra não virar sugestão de
// aprender algo que a dupla já sabe tocar
const PREFIXO_OCULTA = "[Oculta]";

const limparPrefixoPedido = (textoPedido) =>
  textoPedido.replace(PREFIXO_SUGESTAO, "").replace(PREFIXO_OCULTA, "").trim();

// Extrai o nome da música (antes do " — artista") de um texto de pedido
const nomeDoPedido = (textoPedido) => limparPrefixoPedido(textoPedido).split(" — ")[0].trim();

const DIAS_ATE_ARQUIVAR = 15;
const dataCorteArquivo = () => {
  const d = new Date();
  d.setDate(d.getDate() - DIAS_ATE_ARQUIVAR);
  return d.toISOString();
};

function GerenciarPedidos({ onMudanca, cifraPorNome }) {
  const [pedidos, setPedidos] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [mostrar, setMostrar] = useState("pendentes"); // pendentes | atendidos | arquivados
  // Contagem separada (query leve, sem limite) — evita o badge dizer "12
  // pendentes" enquanto a lista, limitada, mostra só alguns deles
  const [contagens, setContagens] = useState({ pendentes: 0, atendidos: 0, arquivados: 0 });
  const [pedidoAberto, setPedidoAberto] = useState(null);
  const [filtroDia, setFiltroDia] = useState(""); // Atendidos: um dia só
  const [filtroDe, setFiltroDe] = useState(""); // Arquivados: período
  const [filtroAte, setFiltroAte] = useState("");
  const navigate = useNavigate();

  // Arquivados junta duas origens: atendidos antigos (mais de 15 dias) e
  // qualquer ignorado (vai pro arquivo na hora, não espera prazo nenhum)
  const filtroArquivados = (query, corte) =>
    query.or(`ignorado.eq.true,and(atendido.eq.true,created_at.lt.${corte})`);

  const atualizarContagens = async () => {
    const corte = dataCorteArquivo();
    const [{ count: pendentes }, { count: atendidos }, { count: arquivados }] = await Promise.all([
      supabase
        .from("pedidos")
        .select("*", { count: "exact", head: true })
        .eq("atendido", false)
        .eq("ignorado", false),
      supabase
        .from("pedidos")
        .select("*", { count: "exact", head: true })
        .eq("atendido", true)
        .eq("ignorado", false)
        .gte("created_at", corte),
      filtroArquivados(
        supabase.from("pedidos").select("*", { count: "exact", head: true }),
        corte
      ),
    ]);
    setContagens({
      pendentes: pendentes ?? 0,
      atendidos: atendidos ?? 0,
      arquivados: arquivados ?? 0,
    });
  };

  const carregar = async (mostrarLoading = true) => {
    if (mostrarLoading) setCarregando(true);
    // Pendentes é a fila de trabalho: busca todos. Atendidos (últimos 15
    // dias) e Arquivados (atendidos mais antigos + ignorados) são só
    // histórico: limita a 200 pra não pesar a consulta.
    let query = supabase.from("pedidos").select("*");
    if (mostrar === "pendentes") {
      query = query.eq("atendido", false).eq("ignorado", false).limit(500);
    } else if (mostrar === "atendidos") {
      query = query
        .eq("atendido", true)
        .eq("ignorado", false)
        .gte("created_at", dataCorteArquivo())
        .limit(200);
    } else {
      query = filtroArquivados(query, dataCorteArquivo()).limit(200);
    }
    const { data, error } = await query.order("created_at", { ascending: false });
    if (!error) setPedidos(data ?? []);
    setCarregando(false);
    atualizarContagens();
    onMudanca?.();
  };

  useEffect(() => {
    carregar();
    // Atualiza sozinho enquanto a aba está aberta (sem piscar "Carregando")
    const timer = setInterval(() => carregar(false), 20_000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mostrar]);

  // Filtro de data (só relevante pra Atendidos/Arquivados — Pendentes é a
  // fila de trabalho, não faz sentido recortar por período). Atendidos usa
  // um único dia (lista mais curta, recente); Arquivados usa um período
  // (De/até), já que pode acumular muito tempo.
  const pedidosFiltrados = pedidos.filter((p) => {
    const dataPedido = new Date(p.created_at);
    if (mostrar === "atendidos") {
      if (filtroDia) {
        if (dataPedido < new Date(`${filtroDia}T00:00:00`)) return false;
        if (dataPedido > new Date(`${filtroDia}T23:59:59`)) return false;
      }
      return true;
    }
    if (mostrar === "arquivados") {
      if (filtroDe && dataPedido < new Date(`${filtroDe}T00:00:00`)) return false;
      if (filtroAte && dataPedido > new Date(`${filtroAte}T23:59:59`)) return false;
      return true;
    }
    return true; // pendentes: sem filtro de data
  });

  // Mapa nome→cifra vem de Painel (props) — evita disparar a mesma busca
  // duas vezes (uma pro pop-up de pedido novo, outra só pra esta aba)
  const cifraDoPedido = (p) => cifraPorNome[normalizarNome(nomeDoPedido(p.pedido))];

  const alternarAtendido = async (p) => {
    const { error } = await supabase
      .from("pedidos")
      .update({ atendido: !p.atendido })
      .eq("id", p.id);
    if (!error) carregar();
  };

  const excluir = async (p) => {
    if (!window.confirm("Excluir este pedido?")) return;
    const { error } = await supabase.from("pedidos").delete().eq("id", p.id);
    if (!error) carregar();
  };

  // Ignorar não exclui — só tira da fila de pendentes e manda pro Arquivo,
  // pra rever depois quais pedidos chegaram e o que foi feito com cada um
  const ignorarPedido = async (p) => {
    const { error } = await supabase.from("pedidos").update({ ignorado: true }).eq("id", p.id);
    if (!error) carregar();
  };

  const restaurarPedido = async (p) => {
    const { error } = await supabase.from("pedidos").update({ ignorado: false }).eq("id", p.id);
    if (!error) carregar();
  };

  // Manda o pedido para a lista "Aprender" (para Ambos) e marca como atendido
  const mandarParaAprender = async (p) => {
    const texto = limparPrefixoPedido(p.pedido);
    const [musica, artista] = texto.split(" — ");
    if (!window.confirm(`Adicionar "${texto}" à lista de músicas para aprender?`)) return;

    const { error } = await supabase.from("sugestoes").insert({
      musica: musica.trim(),
      artista: artista?.trim() || null,
      mensagem: p.mensagem,
      origem: "visitante",
      para: "Ambos",
    });
    if (error) {
      console.error(error);
      return;
    }
    await supabase.from("pedidos").update({ atendido: true }).eq("id", p.id);
    carregar();
  };

  return (
    <div className="border border-noir-700 rounded-2xl p-5 bg-noir-900/50">
      <div className="flex items-center justify-between mb-4">
        <h2 className="section-title text-sm">Últimos pedidos</h2>
        <button
          onClick={carregar}
          className="text-xs text-cream-muted hover:text-gold-300 transition"
        >
          ↻ Atualizar
        </button>
      </div>

      {/* Toggle pendentes / atendidos / arquivados */}
      <div className="flex gap-2 mb-3 flex-wrap">
        <button
          onClick={() => setMostrar("pendentes")}
          className={`px-4 py-1.5 rounded-full text-xs tracking-wide transition border ${
            mostrar === "pendentes"
              ? "btn-gold border-transparent"
              : "border-noir-700 text-cream-muted hover:text-cream"
          }`}
        >
          Pendentes ({contagens.pendentes})
        </button>
        <button
          onClick={() => setMostrar("atendidos")}
          className={`px-4 py-1.5 rounded-full text-xs tracking-wide transition border ${
            mostrar === "atendidos"
              ? "btn-gold border-transparent"
              : "border-noir-700 text-cream-muted hover:text-cream"
          }`}
        >
          Atendidos ({contagens.atendidos})
        </button>
        <button
          onClick={() => setMostrar("arquivados")}
          title={`Atendidos há mais de ${DIAS_ATE_ARQUIVAR} dias`}
          className={`inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs tracking-wide transition border ${
            mostrar === "arquivados"
              ? "btn-gold border-transparent"
              : "border-noir-700 text-cream-muted hover:text-cream"
          }`}
        >
          <Icone nome="arquivo" className="w-3.5 h-3.5" />
          Arquivados ({contagens.arquivados})
        </button>
      </div>

      {/* Filtro de data — Atendidos é um dia só (lista recente e curta);
          Arquivados é um período (De/até), já que acumula mais tempo */}
      {mostrar === "atendidos" && (
        <div className="flex items-center gap-2 mb-3 flex-nowrap">
          <label className="text-xs text-cream-muted shrink-0">Dia</label>
          <input
            type="date"
            className="input-noir !w-1/4 text-sm py-1.5 shrink-0"
            value={filtroDia}
            onChange={(e) => setFiltroDia(e.target.value)}
          />
          {filtroDia && (
            <button
              onClick={() => setFiltroDia("")}
              className="text-xs text-cream-muted hover:text-gold-300 transition shrink-0"
            >
              ✕ Limpar
            </button>
          )}
        </div>
      )}

      {mostrar === "arquivados" && (
        <div className="flex items-center gap-2 mb-3 flex-nowrap overflow-x-auto">
          <label className="text-xs text-cream-muted shrink-0">De</label>
          <input
            type="date"
            className="input-noir !w-1/4 text-sm py-1.5 shrink-0"
            value={filtroDe}
            onChange={(e) => setFiltroDe(e.target.value)}
          />
          <label className="text-xs text-cream-muted shrink-0">até</label>
          <input
            type="date"
            className="input-noir !w-1/4 text-sm py-1.5 shrink-0"
            value={filtroAte}
            onChange={(e) => setFiltroAte(e.target.value)}
          />
          {(filtroDe || filtroAte) && (
            <button
              onClick={() => {
                setFiltroDe("");
                setFiltroAte("");
              }}
              className="text-xs text-cream-muted hover:text-gold-300 transition shrink-0"
            >
              ✕ Limpar
            </button>
          )}
        </div>
      )}

      {carregando ? (
        <p className="text-cream-muted text-sm py-4">Carregando...</p>
      ) : (
        <ul className="divide-y divide-noir-800">
          {pedidosFiltrados.map((p) => (
            <li key={p.id} className="flex items-start gap-2">
              <button
                onClick={() => setPedidoAberto(p)}
                className="flex-1 min-w-0 py-3 flex items-start justify-between gap-3 text-left hover:bg-noir-800/50 rounded-lg px-2 -mx-2 transition"
              >
                <div className="min-w-0">
                  <p className={`truncate ${p.atendido ? "line-through text-cream-muted" : "text-cream"}`}>
                    {limparPrefixoPedido(p.pedido)}
                    {p.pedido.startsWith(PREFIXO_SUGESTAO) && (
                      <span className="ml-2 text-[10px] uppercase tracking-wider text-gold-300 border border-gold-600 rounded-full px-2 py-0.5">
                        fora do repertório
                      </span>
                    )}
                    {p.pedido.startsWith(PREFIXO_OCULTA) && (
                      <span className="ml-2 text-[10px] uppercase tracking-wider text-cream-muted border border-noir-600 rounded-full px-2 py-0.5">
                        🙈 já é nossa, só oculta
                      </span>
                    )}
                    {p.ignorado && (
                      <span className="ml-2 text-[10px] uppercase tracking-wider text-cream-muted border border-noir-600 rounded-full px-2 py-0.5">
                        ignorado
                      </span>
                    )}
                  </p>
                  {p.mensagem && (
                    <p className="text-cream-muted text-sm break-words">💬 {p.mensagem}</p>
                  )}
                  <p className="text-cream-muted/60 text-xs mt-1">
                    {new Date(p.created_at).toLocaleString("pt-BR")}
                  </p>
                </div>
                <span className="shrink-0 text-gold-300 text-sm">Ver ›</span>
              </button>
              {!p.atendido && p.pedido.startsWith(PREFIXO_SUGESTAO) && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    mandarParaAprender(p);
                  }}
                  title="Enviar para a lista de músicas para aprender"
                  className="shrink-0 self-center inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gold-600 text-xs text-gold-300 hover:bg-noir-800 transition"
                >
                  <Icone nome="aprender" className="w-3.5 h-3.5" />
                  Aprender
                </button>
              )}
              {mostrar === "pendentes" && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    ignorarPedido(p);
                  }}
                  title="Ignorar — vai pro Arquivo, sem excluir"
                  className="shrink-0 self-center inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-noir-700 text-xs text-cream-muted hover:text-cream hover:border-noir-600 transition"
                >
                  <Icone nome="arquivo" className="w-3.5 h-3.5" />
                  Ignorar
                </button>
              )}
              {mostrar === "arquivados" && p.ignorado && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    restaurarPedido(p);
                  }}
                  title="Restaurar para pendentes"
                  className="shrink-0 self-center inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-noir-700 text-xs text-cream-muted hover:text-gold-300 hover:border-gold-600 transition"
                >
                  Restaurar
                </button>
              )}
            </li>
          ))}
          {pedidosFiltrados.length === 0 && (
            <li className="py-4 text-cream-muted text-sm">
              {mostrar === "pendentes"
                ? "Nenhum pedido pendente. 🎉"
                : mostrar === "arquivados"
                  ? "Nenhum pedido arquivado nesse período."
                  : "Nenhum pedido atendido nesse período."}
            </li>
          )}
        </ul>
      )}

      {pedidoAberto && (
        <DetalhePedidoModal
          pedido={pedidoAberto}
          cifraId={cifraDoPedido(pedidoAberto)}
          onFechar={() => setPedidoAberto(null)}
          onVerCifra={(id) => {
            setPedidoAberto(null);
            navigate(`/cifra/${id}`);
          }}
          onAprender={(p) => {
            mandarParaAprender(p);
            setPedidoAberto(null);
          }}
          onAlternarAtendido={(p) => {
            alternarAtendido(p);
            setPedidoAberto(null);
          }}
          onIgnorar={(p) => {
            ignorarPedido(p);
            setPedidoAberto(null);
          }}
          onRestaurar={(p) => {
            restaurarPedido(p);
            setPedidoAberto(null);
          }}
          onExcluir={(p) => {
            excluir(p);
            setPedidoAberto(null);
          }}
        />
      )}
    </div>
  );
}

// Modal com todas as informações do pedido, aberto ao tocar num item da lista
function DetalhePedidoModal({
  pedido: p,
  cifraId,
  onFechar,
  onVerCifra,
  onAprender,
  onAlternarAtendido,
  onIgnorar,
  onRestaurar,
  onExcluir,
}) {
  const ehSugestao = p.pedido.startsWith(PREFIXO_SUGESTAO);
  const ehOculta = p.pedido.startsWith(PREFIXO_OCULTA);

  return (
    <div
      className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={onFechar}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-noir-700 bg-noir-900 p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h3 className="section-title text-base">Detalhes do pedido</h3>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              {ehSugestao && (
                <span className="text-[10px] uppercase tracking-wider text-gold-300 border border-gold-600 rounded-full px-2 py-0.5">
                  fora do repertório
                </span>
              )}
              {ehOculta && (
                <span className="text-[10px] uppercase tracking-wider text-cream-muted border border-noir-600 rounded-full px-2 py-0.5">
                  🙈 já é nossa, só oculta
                </span>
              )}
              <span
                className={`text-[10px] uppercase tracking-wider rounded-full px-2 py-0.5 border ${
                  p.ignorado
                    ? "text-cream-muted border-noir-600"
                    : p.atendido
                      ? "text-emerald-300 border-emerald-700"
                      : "text-amber-300 border-amber-700"
                }`}
              >
                {p.ignorado ? "ignorado" : p.atendido ? "atendido" : "pendente"}
              </span>
            </div>
          </div>
          <button
            onClick={onFechar}
            aria-label="Fechar"
            className="text-cream-muted hover:text-cream text-lg leading-none shrink-0"
          >
            ✕
          </button>
        </div>

        <p className="text-cream text-lg mt-4 break-words">{limparPrefixoPedido(p.pedido)}</p>

        {p.mensagem && (
          <p className="text-cream-muted mt-3 break-words whitespace-pre-wrap">
            💬 {p.mensagem}
          </p>
        )}

        <p className="text-cream-muted/60 text-xs mt-4">
          {new Date(p.created_at).toLocaleString("pt-BR")}
        </p>

        <div className="mt-5 flex flex-wrap gap-2 justify-end">
          {cifraId && (
            <button
              onClick={() => onVerCifra(cifraId)}
              className="btn-gold px-4 py-2 rounded-xl text-sm inline-flex items-center gap-1.5"
            >
              <Icone nome="cifras" className="w-4 h-4" />
              Ver cifra
            </button>
          )}
          {!p.atendido && !p.ignorado && ehSugestao && (
            <button
              onClick={() => onAprender(p)}
              className="px-4 py-2 rounded-xl border border-gold-600 text-sm text-gold-300 hover:bg-noir-800 transition inline-flex items-center gap-1.5"
            >
              <Icone nome="aprender" className="w-4 h-4" />
              Aprender
            </button>
          )}
          {!p.ignorado && (
            <button
              onClick={() => onAlternarAtendido(p)}
              className="px-4 py-2 rounded-xl border border-noir-700 text-sm text-cream-muted hover:text-gold-300 hover:border-gold-600 transition"
            >
              {p.atendido ? "Reabrir" : "✓ Atendido"}
            </button>
          )}
          {!p.atendido && !p.ignorado && (
            <button
              onClick={() => onIgnorar(p)}
              className="px-4 py-2 rounded-xl border border-noir-700 text-sm text-cream-muted hover:text-cream hover:border-noir-600 transition inline-flex items-center gap-1.5"
            >
              <Icone nome="arquivo" className="w-4 h-4" />
              Ignorar
            </button>
          )}
          {p.ignorado && (
            <button
              onClick={() => onRestaurar(p)}
              className="px-4 py-2 rounded-xl border border-noir-700 text-sm text-cream-muted hover:text-gold-300 hover:border-gold-600 transition"
            >
              Restaurar
            </button>
          )}
          <button
            onClick={() => onExcluir(p)}
            className="px-4 py-2 rounded-xl border border-noir-700 text-sm text-cream-muted hover:text-red-400 hover:border-red-900 transition"
          >
            Excluir
          </button>
        </div>
      </div>
    </div>
  );
}
