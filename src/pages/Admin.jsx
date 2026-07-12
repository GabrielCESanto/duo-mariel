import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase, supabaseConfigured } from "../lib/supabase";

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

    if (error) setErro("E-mail ou senha inválidos.");
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
      <div className="flex gap-2 mb-6">
        <AbaBotao ativa={aba === "musicas"} onClick={() => setAba("musicas")}>
          Músicas
        </AbaBotao>
        <AbaBotao ativa={aba === "pedidos"} onClick={() => setAba("pedidos")}>
          Pedidos
        </AbaBotao>
      </div>

      {aba === "musicas" ? <GerenciarMusicas /> : <GerenciarPedidos />}
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
    if (!window.confirm(`Excluir "${m.nome} — ${m.artista}"?`)) return;
    const { error } = await supabase.from("musicas").delete().eq("id", m.id);
    if (error) {
      console.error(error);
      setStatus("❌ Erro ao excluir.");
      return;
    }
    carregar();
  };

  const visiveis = musicas.filter((m) => {
    const q = filtro.trim().toLowerCase();
    if (!q) return true;
    return `${m.nome} ${m.artista} ${m.estilo ?? ""}`.toLowerCase().includes(q);
  });

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
                <div className="flex gap-2 shrink-0">
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
