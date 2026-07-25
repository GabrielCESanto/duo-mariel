import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { supabase, supabaseConfigured, ACESSOS_FUNCTION_URL, anonKey } from "../lib/supabase";
import {
  assinarDownloadCifras,
  baixarCifrasEmCache,
  cancelarDownloadCifras,
  estadoDownloadCifras,
} from "../lib/cifraCache";
import Afinador from "../components/Afinador";
import { GOATCOUNTER_CODE } from "../config";
import { buscarMusicasApi, existeNoItunes } from "../lib/preview";

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

// Compara nomes de músicas ignorando acentos, caixa e pontuação
const normalizarNome = (s) =>
  String(s ?? "")
    .toLowerCase()
    .normalize("NFD")
    // Remove os acentos (as marcas combinantes que o NFD separa das letras),
    // usando os pontos de código Unicode por extenso em vez de caracteres
    // combinantes literais no fonte — esses são invisíveis no editor e
    // quebrariam silenciosamente se alguma ferramenta reescrever o arquivo.
    .replace(new RegExp("[\\u0300-\\u036f]", "g"), "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

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
  ["musicas", "Músicas"],
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
    default:
      return null;
  }
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
      .not("cifra_path", "is", null)
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
      .eq("atendido", false);
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
                      setAba(valor);
                      setMenuOutrosAberto(false);
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
      {aba === "afinador" && <Afinador />}
      {aba === "videos" && <GerenciarVideos />}
      {aba === "pedidos" && <GerenciarPedidos onMudanca={contarPendentes} />}
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

  const ehSugestao = pedido.pedido.startsWith("[Sugestão]");

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
        <p className="text-cream text-lg mt-3 break-words">
          {pedido.pedido.replace("[Sugestão]", "").trim()}
        </p>
        {ehSugestao && (
          <p className="text-gold-300 text-xs mt-1 uppercase tracking-wider">
            fora do repertório
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
              className="px-4 py-2 rounded-xl border border-gold-600 text-gold-300 hover:bg-noir-800 text-sm transition"
            >
              🎼 Ver cifra
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
    const { data, error } = await supabase
      .from("musicas")
      .select("*")
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
    if (!window.confirm(`Excluir "${m.nome} — ${m.artista}"?${m.cifra_path ? "\nA cifra em PDF também será apagada." : ""}`)) return;
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

    // Gera e sobe as imagens das páginas agora, uma única vez — assim quem
    // abrir a cifra no celular só baixa imagens prontas, sem precisar
    // renderizar o PDF na hora (o que era lento e, em aparelhos mais
    // fracos, arriscado). Se isso falhar, a cifra ainda funciona — Cifra.jsx
    // cai pro PDF direto, só sem a abertura rápida.
    let totalPaginas = 0;
    let versao = null;
    try {
      // Import dinâmico: pdf.js é pesado, só baixa quando alguém realmente
      // for enviar/reprocessar uma cifra, não pra qualquer visitante do site
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

    const arquivosAntigos = arquivosDaCifra(m);
    if (arquivosAntigos.length > 0) {
      await supabase.storage.from("cifras").remove(arquivosAntigos);
    }
    const { error: dbError } = await supabase
      .from("musicas")
      .update({
        cifra_path: path,
        cifra_paginas: totalPaginas || null,
        cifra_versao: versao,
      })
      .eq("id", m.id);

    if (dbError) {
      console.error(dbError);
      setStatus("❌ Erro ao vincular a cifra.");
    } else {
      setStatus("✅ Cifra enviada!");
      setTimeout(() => setStatus(""), 2500);
    }
    setEnviandoCifraId(null);
    carregar();
  };

  const visiveis = musicas.filter((m) => {
    if (filtroCifra === "com" && !m.cifra_path) return false;
    if (filtroCifra === "sem" && m.cifra_path) return false;
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
      "Cifra": m.cifra_path ? "Sim" : "",
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
            ["com", `Com cifra (${musicas.filter((m) => m.cifra_path).length})`],
            ["sem", `Sem cifra (${musicas.filter((m) => !m.cifra_path).length})`],
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
            className="px-3 py-1.5 rounded-full text-xs tracking-wide transition border border-noir-700 text-cream-muted hover:text-gold-300 hover:border-gold-600 disabled:opacity-50"
          >
            {verificandoItunes ? `⏳ ${verificandoItunes}` : "🔎 Verificar iTunes"}
          </button>
        </div>

        {carregando ? (
          <p className="text-cream-muted text-sm py-4">Carregando...</p>
        ) : (
          <ul className="divide-y divide-noir-800 max-h-[480px] overflow-y-auto pr-2">
            {visiveis.map((m) => (
              <li key={m.id} className="py-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
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
                    title={m.cifra_path ? "Trocar o PDF da cifra" : "Enviar PDF da cifra"}
                    className={`px-3 py-1.5 rounded-lg border text-xs transition cursor-pointer ${
                      m.cifra_path
                        ? "border-gold-600 text-gold-300 hover:bg-noir-800"
                        : "border-noir-700 text-cream-muted hover:text-gold-300 hover:border-gold-600"
                    } ${enviandoCifraId === m.id ? "opacity-50 pointer-events-none" : ""}`}
                  >
                    {enviandoCifraId === m.id
                      ? "⏳..."
                      : m.cifra_path
                        ? "📎 Trocar PDF"
                        : "📎 PDF"}
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
    </div>
  );
}

/* ---------------- BOTÃO DE PREVIEW (admin) ---------------- */

// Um único áudio para o admin inteiro; ao tocar outro, o anterior para
let audioAdmin = null;
let pararBotaoAnterior = null;

function BotaoOuvir({ url }) {
  const [tocando, setTocando] = useState(false);

  useEffect(
    () => () => {
      if (pararBotaoAnterior) audioAdmin?.pause();
    },
    []
  );

  if (!url) return null;

  const alternar = (e) => {
    e.stopPropagation();
    if (tocando) {
      audioAdmin?.pause();
      setTocando(false);
      pararBotaoAnterior = null;
      return;
    }
    audioAdmin?.pause();
    pararBotaoAnterior?.();
    audioAdmin = new Audio(url);
    audioAdmin.addEventListener("ended", () => setTocando(false));
    audioAdmin.play().catch(() => setTocando(false));
    setTocando(true);
    pararBotaoAnterior = () => setTocando(false);
  };

  return (
    <button
      type="button"
      onClick={alternar}
      aria-label={tocando ? "Parar trecho" : "Ouvir trecho"}
      className="shrink-0 w-8 h-8 rounded-full border border-gold-600 text-gold-300 text-xs hover:bg-noir-800 transition"
    >
      {tocando ? "❚❚" : "▶"}
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
  const [reprocessando, setReprocessando] = useState(null); // { atual, total, nome } ou null
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
      .select("id, nome, artista, estilo, cifra_path, cifra_paginas, cifra_versao, favorito")
      .not("cifra_path", "is", null)
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
    const q = filtro.trim().toLowerCase();
    if (!q) return true;
    return `${m.nome} ${m.artista} ${m.estilo ?? ""}`.toLowerCase().includes(q);
  });

  const cliqueBaixar = () => {
    if (!progresso.baixando) baixarCifrasEmCache(musicas);
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

  // Cifras enviadas antes dessa funcionalidade só têm o PDF — abrem devagar
  // porque o celular precisa renderizar o PDF na hora. Esse botão gera as
  // imagens pra elas também, sem precisar reenviar o PDF de novo.
  const semImagens = musicas.filter((m) => !m.cifra_paginas || !m.cifra_versao);

  const reprocessarCifrasAntigas = async () => {
    if (semImagens.length === 0 || reprocessando) return;
    const { pdfParaImagensJpeg } = await import("../lib/pdfParaImagens");
    for (const [i, m] of semImagens.entries()) {
      setReprocessando({ atual: i + 1, total: semImagens.length, nome: m.nome });
      try {
        // Um lote longo pode passar do tempo de vida do token de sessão —
        // isso reconecta se estiver perto de expirar, evitando falhas de
        // RLS no meio do reprocessamento
        await supabase.auth.getSession();
        const { data: pub } = supabase.storage.from("cifras").getPublicUrl(m.cifra_path);
        const imagens = await pdfParaImagensJpeg(pub.publicUrl);
        const versao = Date.now();
        for (let p = 0; p < imagens.length; p++) {
          const { error } = await subirImagemPagina(
            caminhoImagemPagina(m.id, versao, p + 1),
            imagens[p]
          );
          if (error) throw error;
        }
        await supabase
          .from("musicas")
          .update({ cifra_paginas: imagens.length, cifra_versao: versao })
          .eq("id", m.id);
      } catch (e) {
        console.error(`Falha ao reprocessar "${m.nome}":`, e);
      }
      // Respira entre uma música e outra — processar várias em sequência
      // sem pausa é o que fazia páginas mais à frente no lote estourarem o
      // timeout de segurança
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
    setReprocessando(null);
    carregar();
  };

  return (
    <div className="border border-noir-700 rounded-2xl p-5 bg-noir-900/50">
      <div className="flex items-center justify-between gap-4 mb-3 flex-wrap">
        <h2 className="section-title text-sm">Cifras ({musicas.length})</h2>
        <div className="flex gap-2 flex-wrap">
          {semImagens.length > 0 && (
            <button
              onClick={reprocessarCifrasAntigas}
              disabled={!!reprocessando}
              title="Gera as imagens das páginas pras cifras enviadas antes dessa funcionalidade existir — deixa a abertura no celular bem mais rápida"
              className="px-3 py-1.5 rounded-lg border border-gold-600 text-xs text-gold-300 hover:bg-noir-800 transition disabled:opacity-40"
            >
              {reprocessando
                ? `⏳ ${reprocessando.atual}/${reprocessando.total}...`
                : `🔁 Acelerar cifras antigas (${semImagens.length})`}
            </button>
          )}
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
          placeholder="Buscar cifra..."
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
                <span className="shrink-0 text-gold-300 text-sm">🎼 Abrir ›</span>
              </button>
            </li>
          ))}
          {visiveis.length === 0 && (
            <li className="py-4 text-cream-muted text-sm">
              {musicas.length === 0
                ? "Nenhuma cifra enviada ainda. Envie os PDFs na aba Músicas (botão 📎 PDF)."
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
                  <span className="shrink-0 text-gold-300 text-xs">🎼 Abrir ›</span>
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
        <ModalMoverRepertorio
          sugestao={sugestaoParaMover}
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
function ModalMoverRepertorio({ sugestao, onFechar, onConfirmar }) {
  const [nome, setNome] = useState(sugestao.musica);
  const [artista, setArtista] = useState(sugestao.artista || "");
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
        <h3 className="section-title text-base mb-1">Adicionar ao repertório</h3>
        <p className="text-cream-muted text-xs mb-4">
          Busque no iTunes pra preencher automático, ou digite manualmente.
        </p>

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
            {salvando ? "Salvando..." : "Adicionar ao repertório"}
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
          placeholder="Observação (ex.: entrada gratuita, evento privado...)"
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

function GerenciarVideos() {
  const [videos, setVideos] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [form, setForm] = useState({ titulo: "", link: "" });
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

  const adicionar = async (e) => {
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
    const { error } = await supabase
      .from("videos")
      .insert({ titulo, youtube_id: youtubeId, instagram_id: instagramId });

    if (error) {
      console.error(error);
      setStatus("❌ Erro ao salvar. Tente novamente.");
      return;
    }

    setForm({ titulo: "", link: "" });
    setStatus("✅ Vídeo adicionado!");
    setTimeout(() => setStatus(""), 2500);
    carregar();
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
        onSubmit={adicionar}
        className="border border-noir-700 rounded-2xl p-5 bg-noir-900/50 mb-6"
      >
        <h2 className="section-title text-sm mb-4">Adicionar vídeo</h2>

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
            Adicionar
          </button>
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
                    <span className="w-20 h-12 rounded-lg border border-noir-700 shrink-0 flex items-center justify-center text-lg">
                      📷
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
                <button
                  onClick={() => excluir(v)}
                  className="px-3 py-1.5 rounded-lg border border-noir-700 text-xs text-cream-muted hover:text-red-400 hover:border-red-900 transition shrink-0"
                >
                  Excluir
                </button>
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

const dataIso = (diasAtras = 0) => {
  const d = new Date();
  d.setDate(d.getDate() - diasAtras);
  return d.toISOString().slice(0, 10);
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

// Aparelhos únicos por período — via edge function, que consulta a API
// privada do GoatCounter (o endpoint público de contador só dá pageviews,
// não diferencia aparelho). Só funciona com o secret GOATCOUNTER_API_TOKEN
// configurado na function; se não estiver, some da tela em vez de quebrar.
async function buscarAparelhosUnicos(periodos) {
  if (!ACESSOS_FUNCTION_URL) return null;
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) return null;

    const resp = await fetch(ACESSOS_FUNCTION_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: anonKey,
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        periodos: periodos.map(([rotulo, inicio]) => ({ rotulo, inicio })),
      }),
    });
    if (!resp.ok) return null;
    const { resultado } = await resp.json();
    return resultado; // [{ rotulo, unicos }]
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
    // As chamadas são independentes — paralelizar deixa o carregamento
    // bem mais rápido do que esperar uma de cada vez
    const [porPeriodo, unicos] = await Promise.all([
      Promise.all(
        periodos.map(async ([rotulo, inicio]) => {
          const [publico, admin] = await Promise.all([
            contarAcessos("/", inicio),
            contarAcessos("/admin", inicio),
          ]);
          return { rotulo, publico, admin };
        })
      ),
      buscarAparelhosUnicos(periodos),
    ]);
    if (porPeriodo.every((r) => r.publico === null && r.admin === null)) {
      setErro(true);
      return;
    }
    setDados(
      porPeriodo.map((r) => ({
        ...r,
        unicos: unicos?.find((u) => u.rotulo === r.rotulo)?.unicos ?? null,
      }))
    );
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
              <p className="text-gold-300/90 text-xs mt-2 pt-2 border-t border-noir-800">
                📱 {d.unicos ?? "—"} aparelho{d.unicos === 1 ? "" : "s"} diferente
                {d.unicos === 1 ? "" : "s"}
              </p>
            </div>
          ))}
        </div>
      )}

      <p className="text-cream-muted/60 text-[11px] mt-4">
        "Visitas ao site"/"área do músico" contam cada carregamento de página
        (pageviews). "Aparelhos diferentes" é uma estimativa de visitantes
        únicos feita pelo GoatCounter (sem cookies) — some da lista se a
        function de aparelhos únicos não estiver configurada.
      </p>
    </div>
  );
}

/* ------------------------- PEDIDOS ------------------------- */

// Prefixo usado pelo modal público quando a música não está no repertório
const PREFIXO_SUGESTAO = "[Sugestão]";

// Extrai o nome da música (antes do " — artista") de um texto de pedido
const nomeDoPedido = (textoPedido) =>
  textoPedido.replace(PREFIXO_SUGESTAO, "").trim().split(" — ")[0].trim();

const DIAS_ATE_ARQUIVAR = 15;
const dataCorteArquivo = () => {
  const d = new Date();
  d.setDate(d.getDate() - DIAS_ATE_ARQUIVAR);
  return d.toISOString();
};

function GerenciarPedidos({ onMudanca }) {
  const [pedidos, setPedidos] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [mostrar, setMostrar] = useState("pendentes"); // pendentes | atendidos | arquivados
  // Contagem separada (query leve, sem limite) — evita o badge dizer "12
  // pendentes" enquanto a lista, limitada, mostra só alguns deles
  const [contagens, setContagens] = useState({ pendentes: 0, atendidos: 0, arquivados: 0 });
  const [cifraPorNome, setCifraPorNome] = useState({});
  const [pedidoAberto, setPedidoAberto] = useState(null);
  const [filtroDia, setFiltroDia] = useState(""); // Atendidos: um dia só
  const [filtroDe, setFiltroDe] = useState(""); // Arquivados: período
  const [filtroAte, setFiltroAte] = useState("");
  const navigate = useNavigate();

  const atualizarContagens = async () => {
    const corte = dataCorteArquivo();
    const [{ count: pendentes }, { count: atendidos }, { count: arquivados }] = await Promise.all([
      supabase.from("pedidos").select("*", { count: "exact", head: true }).eq("atendido", false),
      supabase
        .from("pedidos")
        .select("*", { count: "exact", head: true })
        .eq("atendido", true)
        .gte("created_at", corte),
      supabase
        .from("pedidos")
        .select("*", { count: "exact", head: true })
        .eq("atendido", true)
        .lt("created_at", corte),
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
    // dias) e Arquivados (mais antigos que isso) são só histórico: limita
    // a 200 pra não pesar a consulta.
    let query = supabase.from("pedidos").select("*");
    if (mostrar === "pendentes") {
      query = query.eq("atendido", false).limit(500);
    } else if (mostrar === "atendidos") {
      query = query.eq("atendido", true).gte("created_at", dataCorteArquivo()).limit(200);
    } else {
      query = query.eq("atendido", true).lt("created_at", dataCorteArquivo()).limit(200);
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

  useEffect(() => {
    // Mapa nome→cifra, para o botão "Ver cifra" no detalhe do pedido
    supabase
      .from("musicas")
      .select("id, nome")
      .not("cifra_path", "is", null)
      .then(({ data, error }) => {
        if (error) return;
        const mapa = {};
        for (const m of data ?? []) mapa[normalizarNome(m.nome)] = m.id;
        setCifraPorNome(mapa);
      });
  }, []);

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

  // Manda o pedido para a lista "Aprender" (para Ambos) e marca como atendido
  const mandarParaAprender = async (p) => {
    const texto = p.pedido.replace(PREFIXO_SUGESTAO, "").trim();
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
          className={`px-4 py-1.5 rounded-full text-xs tracking-wide transition border ${
            mostrar === "arquivados"
              ? "btn-gold border-transparent"
              : "border-noir-700 text-cream-muted hover:text-cream"
          }`}
        >
          🗄 Arquivados ({contagens.arquivados})
        </button>
      </div>

      {/* Filtro de data — Atendidos é um dia só (lista recente e curta);
          Arquivados é um período (De/até), já que acumula mais tempo */}
      {mostrar === "atendidos" && (
        <div className="flex items-center gap-2 mb-3 flex-nowrap">
          <label className="text-xs text-cream-muted shrink-0">Dia</label>
          <input
            type="date"
            className="input-noir w-[12ch] text-sm py-1.5"
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
            className="input-noir w-[12ch] text-sm py-1.5 shrink-0"
            value={filtroDe}
            onChange={(e) => setFiltroDe(e.target.value)}
          />
          <label className="text-xs text-cream-muted shrink-0">até</label>
          <input
            type="date"
            className="input-noir w-[12ch] text-sm py-1.5 shrink-0"
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
                    {p.pedido.replace(PREFIXO_SUGESTAO, "").trim()}
                    {p.pedido.startsWith(PREFIXO_SUGESTAO) && (
                      <span className="ml-2 text-[10px] uppercase tracking-wider text-gold-300 border border-gold-600 rounded-full px-2 py-0.5">
                        fora do repertório
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
                  className="shrink-0 self-center px-3 py-1.5 rounded-lg border border-gold-600 text-xs text-gold-300 hover:bg-noir-800 transition"
                >
                  🎸 Aprender
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
  onExcluir,
}) {
  const ehSugestao = p.pedido.startsWith(PREFIXO_SUGESTAO);

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
              <span
                className={`text-[10px] uppercase tracking-wider rounded-full px-2 py-0.5 border ${
                  p.atendido
                    ? "text-emerald-300 border-emerald-700"
                    : "text-amber-300 border-amber-700"
                }`}
              >
                {p.atendido ? "atendido" : "pendente"}
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

        <p className="text-cream text-lg mt-4 break-words">
          {p.pedido.replace(PREFIXO_SUGESTAO, "").trim()}
        </p>

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
              className="btn-gold px-4 py-2 rounded-xl text-sm"
            >
              🎼 Ver cifra
            </button>
          )}
          {!p.atendido && ehSugestao && (
            <button
              onClick={() => onAprender(p)}
              className="px-4 py-2 rounded-xl border border-gold-600 text-sm text-gold-300 hover:bg-noir-800 transition"
            >
              🎸 Aprender
            </button>
          )}
          <button
            onClick={() => onAlternarAtendido(p)}
            className="px-4 py-2 rounded-xl border border-noir-700 text-sm text-cream-muted hover:text-gold-300 hover:border-gold-600 transition"
          >
            {p.atendido ? "Reabrir" : "✓ Atendido"}
          </button>
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
