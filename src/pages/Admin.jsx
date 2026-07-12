import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase, supabaseConfigured } from "../lib/supabase";
import { GOATCOUNTER_CODE } from "../config";
import { buscarMusicasApi } from "../lib/preview";

const BASE = import.meta.env.BASE_URL;

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

function Painel() {
  const [aba, setAba] = useState("musicas");

  return (
    <div>
      <div className="flex flex-wrap gap-2 mb-6">
        <AbaBotao ativa={aba === "musicas"} onClick={() => setAba("musicas")}>
          Músicas
        </AbaBotao>
        <AbaBotao ativa={aba === "cifras"} onClick={() => setAba("cifras")}>
          Cifras
        </AbaBotao>
        <AbaBotao ativa={aba === "aprender"} onClick={() => setAba("aprender")}>
          Aprender
        </AbaBotao>
        <AbaBotao ativa={aba === "agenda"} onClick={() => setAba("agenda")}>
          Agenda
        </AbaBotao>
        <AbaBotao ativa={aba === "videos"} onClick={() => setAba("videos")}>
          Vídeos
        </AbaBotao>
        <AbaBotao ativa={aba === "pedidos"} onClick={() => setAba("pedidos")}>
          Pedidos
        </AbaBotao>
        {GOATCOUNTER_CODE && (
          <AbaBotao ativa={aba === "acessos"} onClick={() => setAba("acessos")}>
            Acessos
          </AbaBotao>
        )}
      </div>

      {aba === "musicas" && <GerenciarMusicas />}
      {aba === "cifras" && <AbaCifras />}
      {aba === "aprender" && <GerenciarSugestoes />}
      {aba === "agenda" && <GerenciarAgenda />}
      {aba === "videos" && <GerenciarVideos />}
      {aba === "pedidos" && <GerenciarPedidos />}
      {aba === "acessos" && <AbaAcessos />}
    </div>
  );
}

function AbaBotao({ ativa, onClick, children }) {
  return (
    <button
      onClick={onClick}
      className={`px-5 py-2 rounded-xl text-sm tracking-wide transition border ${
        ativa
          ? "btn-gold border-transparent"
          : "border-noir-700 text-cream-muted hover:text-cream hover:border-noir-600"
      }`}
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
  const navigate = useNavigate();

  // --- Autocomplete via iTunes (opcional; digitar manualmente sempre funciona) ---
  const [sugestoesApi, setSugestoesApi] = useState([]);
  const [buscandoApi, setBuscandoApi] = useState(false);
  const escolhaRef = useState({ atual: "" })[0];

  useEffect(() => {
    const q = form.nome.trim();
    // Não busca ao editar, com texto curto ou logo após escolher uma sugestão
    if (editandoId || q.length < 3 || q === escolhaRef.atual) {
      setSugestoesApi([]);
      setBuscandoApi(false);
      return;
    }
    setBuscandoApi(true);
    const timer = setTimeout(async () => {
      const resultados = await buscarMusicasApi(q);
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
      .order("artista")
      .order("nome");
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

  const excluir = async (m) => {
    if (!window.confirm(`Excluir "${m.nome} — ${m.artista}"?${m.cifra_path ? "\nA cifra em PDF também será apagada." : ""}`)) return;
    const { error } = await supabase.from("musicas").delete().eq("id", m.id);
    if (error) {
      console.error(error);
      setStatus("❌ Erro ao excluir.");
      return;
    }
    if (m.cifra_path) {
      await supabase.storage.from("cifras").remove([m.cifra_path]);
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
    const path = `${m.id}-${Date.now()}.pdf`;
    const { error: upError } = await supabase.storage
      .from("cifras")
      .upload(path, arquivo, { contentType: "application/pdf" });

    if (upError) {
      console.error(upError);
      setStatus("❌ Erro ao enviar a cifra.");
      setEnviandoCifraId(null);
      return;
    }

    if (m.cifra_path) {
      await supabase.storage.from("cifras").remove([m.cifra_path]);
    }
    const { error: dbError } = await supabase
      .from("musicas")
      .update({ cifra_path: path })
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
                    <li key={i}>
                      <button
                        type="button"
                        onClick={() => usarSugestao(s)}
                        className="w-full px-4 py-2.5 flex items-center gap-3 text-left hover:bg-noir-800 transition"
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

        {carregando ? (
          <p className="text-cream-muted text-sm py-4">Carregando...</p>
        ) : (
          <ul className="divide-y divide-noir-800 max-h-[480px] overflow-y-auto pr-2">
            {visiveis.map((m) => (
              <li key={m.id} className="py-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-cream truncate">{m.nome}</p>
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

/* ------------------------- CIFRAS ------------------------- */

function AbaCifras() {
  const [musicas, setMusicas] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [filtro, setFiltro] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    supabase
      .from("musicas")
      .select("id, nome, artista, estilo, cifra_path")
      .not("cifra_path", "is", null)
      .order("artista")
      .order("nome")
      .then(({ data, error }) => {
        if (!error) setMusicas(data ?? []);
        setCarregando(false);
      });
  }, []);

  const visiveis = musicas.filter((m) => {
    const q = filtro.trim().toLowerCase();
    if (!q) return true;
    return `${m.nome} ${m.artista} ${m.estilo ?? ""}`.toLowerCase().includes(q);
  });

  return (
    <div className="border border-noir-700 rounded-2xl p-5 bg-noir-900/50">
      <div className="flex items-center justify-between gap-4 mb-3">
        <h2 className="section-title text-sm">Cifras ({musicas.length})</h2>
        <span className="text-xs text-cream-muted">
          Dica: abra as cifras do show com internet — elas ficam salvas offline.
        </span>
      </div>

      <input
        className="input-noir mb-2"
        placeholder="Buscar cifra..."
        value={filtro}
        onChange={(e) => setFiltro(e.target.value)}
      />

      {carregando ? (
        <p className="text-cream-muted text-sm py-4">Carregando...</p>
      ) : (
        <ul className="divide-y divide-noir-800 max-h-[560px] overflow-y-auto pr-2">
          {visiveis.map((m) => (
            <li key={m.id}>
              <button
                onClick={() => navigate(`/cifra/${m.id}`)}
                className="w-full py-3 flex items-center justify-between gap-3 text-left hover:bg-noir-800/50 rounded-lg px-2 -mx-2 transition"
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
    </div>
  );
}

/* ---------------- MÚSICAS PARA APRENDER ---------------- */

function GerenciarSugestoes() {
  const [sugestoes, setSugestoes] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [form, setForm] = useState({ musica: "", artista: "" });
  const [status, setStatus] = useState("");

  const carregar = async () => {
    setCarregando(true);
    const { data, error } = await supabase
      .from("sugestoes")
      .select("*")
      .order("created_at", { ascending: false });
    if (!error) setSugestoes(data ?? []);
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
      origem: "admin",
    });

    if (error) {
      console.error(error);
      setStatus("❌ Erro ao adicionar.");
      return;
    }
    setForm({ musica: "", artista: "" });
    setStatus("✅ Adicionada à lista!");
    setTimeout(() => setStatus(""), 2500);
    carregar();
  };

  const moverParaRepertorio = async (s) => {
    let artista = s.artista;
    if (!artista) {
      artista = window.prompt(`Artista de "${s.musica}"?`);
      if (!artista || !artista.trim()) return;
      artista = artista.trim();
    }
    const estilo = window.prompt("Estilo (opcional, ex.: MPB):") || null;

    const { error } = await supabase
      .from("musicas")
      .insert({ nome: s.musica, artista, estilo: estilo?.trim() || null });

    if (error) {
      console.error(error);
      setStatus("❌ Erro ao mover para o repertório.");
      return;
    }
    await supabase.from("sugestoes").delete().eq("id", s.id);
    setStatus(`✅ "${s.musica}" agora está no repertório!`);
    setTimeout(() => setStatus(""), 3000);
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

  return (
    <div>
      {/* Formulário */}
      <form
        onSubmit={adicionar}
        className="border border-noir-700 rounded-2xl p-5 bg-noir-900/50 mb-6"
      >
        <h2 className="section-title text-sm mb-4">Adicionar música para aprender</h2>

        <div className="grid gap-3 sm:grid-cols-2">
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
        <h2 className="section-title text-sm mb-3">
          Para aprender ({sugestoes.length})
        </h2>

        {carregando ? (
          <p className="text-cream-muted text-sm py-4">Carregando...</p>
        ) : (
          <ul className="divide-y divide-noir-800 max-h-[480px] overflow-y-auto pr-2">
            {sugestoes.map((s) => (
              <li key={s.id} className="py-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-cream truncate">
                    {s.musica}
                    {s.origem === "visitante" && (
                      <span className="ml-2 text-[10px] uppercase tracking-wider text-gold-300 border border-gold-600 rounded-full px-2 py-0.5">
                        público
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
                  <button
                    onClick={() => moverParaRepertorio(s)}
                    className="px-3 py-1.5 rounded-lg border border-noir-700 text-xs text-cream-muted hover:text-gold-300 hover:border-gold-600 transition"
                  >
                    ✓ Aprendida
                  </button>
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
    </div>
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

  const carregar = async () => {
    setCarregando(true);
    const { data, error } = await supabase
      .from("eventos")
      .select("*")
      .order("data", { ascending: false })
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
      hora: form.hora || null,
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
      cache: ev.cache ?? "",
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
            type="time"
            className="input-noir"
            value={form.hora}
            onChange={(e) => setForm({ ...form, hora: e.target.value })}
          />
          <input
            className="input-noir"
            placeholder="Tempo de apresentação (ex.: 2h)"
            value={form.duracao}
            onChange={(e) => setForm({ ...form, duracao: e.target.value })}
          />
          <input
            className="input-noir"
            placeholder="Cachê (ex.: R$ 800) — só vocês veem"
            value={form.cache}
            onChange={(e) => setForm({ ...form, cache: e.target.value })}
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
        <h2 className="section-title text-sm mb-3">Shows ({eventos.length})</h2>

        {carregando ? (
          <p className="text-cream-muted text-sm py-4">Carregando...</p>
        ) : (
          <ul className="divide-y divide-noir-800 max-h-[480px] overflow-y-auto pr-2">
            {eventos.map((ev) => {
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
                      {ev.duracao ? ` • ${ev.duracao}` : ""}
                      {ev.local ? ` • ${ev.local}` : ""}
                    </p>
                    {ev.cache && (
                      <p className="text-gold-300/90 text-xs truncate">💰 {ev.cache}</p>
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
            {eventos.length === 0 && (
              <li className="py-4 text-cream-muted text-sm">Nenhum show cadastrado.</li>
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

    if (!titulo) return;
    if (!youtubeId) {
      setStatus("❌ Link do YouTube inválido. Cole o link do vídeo.");
      return;
    }

    setStatus("⏳ Salvando...");
    const { error } = await supabase
      .from("videos")
      .insert({ titulo, youtube_id: youtubeId });

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
            placeholder="Link do YouTube *"
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
                  <img
                    src={`https://img.youtube.com/vi/${v.youtube_id}/default.jpg`}
                    alt=""
                    className="w-20 h-12 object-cover rounded-lg border border-noir-700 shrink-0"
                  />
                  <div className="min-w-0">
                    <p className="text-cream truncate">{v.titulo}</p>
                    <a
                      href={`https://youtu.be/${v.youtube_id}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-cream-muted text-xs hover:text-gold-300 transition"
                    >
                      youtu.be/{v.youtube_id}
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
    const resultado = [];
    for (const [rotulo, inicio] of periodos) {
      const publico = await contarAcessos("/", inicio);
      const admin = await contarAcessos("/admin", inicio);
      resultado.push({ rotulo, publico, admin });
    }
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
        Visitantes únicos por período, contados pelo GoatCounter (sem cookies).
      </p>
    </div>
  );
}

/* ------------------------- PEDIDOS ------------------------- */

function GerenciarPedidos() {
  const [pedidos, setPedidos] = useState([]);
  const [carregando, setCarregando] = useState(true);

  const carregar = async () => {
    setCarregando(true);
    const { data, error } = await supabase
      .from("pedidos")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100);
    if (!error) setPedidos(data ?? []);
    setCarregando(false);
  };

  useEffect(() => {
    carregar();
  }, []);

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

      {carregando ? (
        <p className="text-cream-muted text-sm py-4">Carregando...</p>
      ) : (
        <ul className="divide-y divide-noir-800">
          {pedidos.map((p) => (
            <li key={p.id} className="py-3 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className={`truncate ${p.atendido ? "line-through text-cream-muted" : "text-cream"}`}>
                  {p.pedido}
                </p>
                {p.mensagem && (
                  <p className="text-cream-muted text-sm break-words">💬 {p.mensagem}</p>
                )}
                <p className="text-cream-muted/60 text-xs mt-1">
                  {new Date(p.created_at).toLocaleString("pt-BR")}
                </p>
              </div>
              <div className="flex gap-2 shrink-0">
                <button
                  onClick={() => alternarAtendido(p)}
                  className="px-3 py-1.5 rounded-lg border border-noir-700 text-xs text-cream-muted hover:text-gold-300 hover:border-gold-600 transition"
                >
                  {p.atendido ? "Reabrir" : "✓ Atendido"}
                </button>
                <button
                  onClick={() => excluir(p)}
                  className="px-3 py-1.5 rounded-lg border border-noir-700 text-xs text-cream-muted hover:text-red-400 hover:border-red-900 transition"
                >
                  Excluir
                </button>
              </div>
            </li>
          ))}
          {pedidos.length === 0 && (
            <li className="py-4 text-cream-muted text-sm">Nenhum pedido ainda.</li>
          )}
        </ul>
      )}
    </div>
  );
}
