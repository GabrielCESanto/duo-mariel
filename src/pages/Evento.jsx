import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { supabase, supabaseConfigured } from "../lib/supabase";
import { buscarMusicasApi } from "../lib/preview";
import {
  loginEvento,
  listarPlaylistEvento,
  adicionarMusicaEvento,
  removerMusicaEvento,
} from "../lib/eventoPlaylist";

const BASE = import.meta.env.BASE_URL;
const CHAVE_SESSAO = "evento-playlist-auth-v1";

const dataHojeIso = () => new Date().toISOString().slice(0, 10);

// Evita deslocamento de fuso ao converter "YYYY-MM-DD" para Date
const dataLocal = (iso) => {
  const [ano, mes, dia] = iso.split("-").map(Number);
  return new Date(ano, mes - 1, dia);
};

const formatarData = (iso) =>
  dataLocal(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });

export default function Evento() {
  const [auth, setAuth] = useState(() => {
    try {
      return JSON.parse(sessionStorage.getItem(CHAVE_SESSAO));
    } catch {
      return null;
    }
  });

  const entrar = (dados) => {
    sessionStorage.setItem(CHAVE_SESSAO, JSON.stringify(dados));
    setAuth(dados);
  };

  const sair = () => {
    sessionStorage.removeItem(CHAVE_SESSAO);
    setAuth(null);
  };

  return (
    <div className="min-h-screen">
      <div className="max-w-2xl mx-auto px-5 py-8">
        <header className="flex items-center justify-between mb-8 gap-3">
          <Link to="/" className="flex items-center gap-3 group min-w-0">
            <img
              src={`${BASE}img/logo-circle.png`}
              alt="Duo Mariel"
              className="w-12 h-12 rounded-full border border-noir-700 group-hover:border-gold-500 transition shrink-0"
            />
            <span className="section-title text-sm truncate">Playlist do seu evento</span>
          </Link>
          {auth && (
            <button
              onClick={sair}
              className="text-xs text-cream-muted hover:text-gold-300 transition shrink-0"
            >
              Trocar evento
            </button>
          )}
        </header>

        {!supabaseConfigured ? (
          <div className="border border-noir-700 rounded-2xl p-6 bg-noir-900/50 text-cream-muted text-sm">
            ⚙️ Este recurso ainda não está disponível — fale com a gente pelo WhatsApp.
          </div>
        ) : !auth ? (
          <TelaLogin onEntrar={entrar} />
        ) : (
          <TelaPlaylist auth={auth} />
        )}
      </div>
    </div>
  );
}

function TelaLogin({ onEntrar }) {
  const [eventos, setEventos] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [eventoId, setEventoId] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState("");
  const [entrando, setEntrando] = useState(false);

  useEffect(() => {
    supabase
      .from("eventos")
      .select("id, titulo, local, data")
      .gte("data", dataHojeIso())
      .order("data")
      .then(({ data, error }) => {
        if (!error) setEventos(data ?? []);
        setCarregando(false);
      });
  }, []);

  const enviar = async (e) => {
    e.preventDefault();
    if (!eventoId || !senha.trim()) return;
    setErro("");
    setEntrando(true);
    try {
      await loginEvento(eventoId, senha.trim());
      const evento = eventos.find((ev) => ev.id === eventoId);
      onEntrar({ eventoId, senha: senha.trim(), titulo: evento?.titulo ?? "" });
    } catch (err) {
      setErro(
        err.message === "Senha incorreta" ? "Senha incorreta." : "Erro ao entrar. Tente novamente."
      );
    } finally {
      setEntrando(false);
    }
  };

  return (
    <div className="border border-noir-700 rounded-2xl p-6 bg-noir-900/50">
      <h1 className="section-title text-lg mb-1 text-center">Monte a playlist do seu show</h1>
      <p className="text-sm text-cream-muted text-center mb-6">
        Contratou o Duo Mariel? Escolha o seu evento e digite a senha que a
        gente te passou para escolher as músicas que quer ouvir.
      </p>

      {carregando ? (
        <p className="text-cream-muted text-sm text-center py-4">Carregando eventos...</p>
      ) : eventos.length === 0 ? (
        <p className="text-cream-muted text-sm text-center py-4">
          Nenhum evento futuro cadastrado no momento. Fale com a gente pelo WhatsApp.
        </p>
      ) : (
        <form onSubmit={enviar} className="space-y-4">
          <div>
            <label className="block text-sm text-cream-muted mb-1">Seu evento</label>
            <select
              className="input-noir"
              value={eventoId}
              onChange={(e) => setEventoId(e.target.value)}
              required
            >
              <option value="" disabled>
                Selecione...
              </option>
              {eventos.map((ev) => (
                <option key={ev.id} value={ev.id}>
                  {ev.titulo} — {formatarData(ev.data)}
                  {ev.local ? ` (${ev.local})` : ""}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm text-cream-muted mb-1">Senha</label>
            <input
              type="password"
              className="input-noir"
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              autoComplete="off"
              required
            />
          </div>

          {erro && <p className="text-red-400 text-sm">{erro}</p>}

          <button type="submit" className="btn-gold w-full py-3 rounded-xl" disabled={entrando}>
            {entrando ? "Entrando..." : "Entrar"}
          </button>
        </form>
      )}
    </div>
  );
}

function TelaPlaylist({ auth }) {
  const [lista, setLista] = useState([]);
  const [carregandoLista, setCarregandoLista] = useState(true);
  const [busca, setBusca] = useState("");
  const [resultados, setResultados] = useState([]);
  const [buscando, setBuscando] = useState(false);
  const [adicionandoChave, setAdicionandoChave] = useState(null);
  const [erro, setErro] = useState("");
  // Descarta respostas de buscas antigas quando a pessoa digita rápido
  const buscaRef = useRef(0);

  const audioRef = useRef(null);
  const [tocandoUrl, setTocandoUrl] = useState(null);

  useEffect(() => {
    listarPlaylistEvento(auth.eventoId, auth.senha)
      .then((r) => setLista(r.musicas ?? []))
      .catch(() => setErro("Não deu para carregar sua playlist. Recarregue a página."))
      .finally(() => setCarregandoLista(false));
  }, [auth]);

  useEffect(() => {
    const q = busca.trim();
    if (q.length < 2) {
      setResultados([]);
      setBuscando(false);
      return;
    }
    setBuscando(true);
    const minhaBusca = ++buscaRef.current;
    const timer = setTimeout(async () => {
      const r = await buscarMusicasApi(q);
      if (buscaRef.current !== minhaBusca) return; // busca mais nova já assumiu
      setResultados(r);
      setBuscando(false);
    }, 450);
    return () => clearTimeout(timer);
  }, [busca]);

  useEffect(() => () => audioRef.current?.pause(), []); // para o áudio ao sair da página

  const tocar = (url) => {
    if (!url) return;
    if (tocandoUrl === url) {
      audioRef.current?.pause();
      setTocandoUrl(null);
      return;
    }
    if (!audioRef.current) {
      const audio = new Audio();
      audio.addEventListener("ended", () => setTocandoUrl(null));
      audioRef.current = audio;
    }
    audioRef.current.src = url;
    audioRef.current.play().catch(() => setTocandoUrl(null));
    setTocandoUrl(url);
  };

  const jaEsta = (item) =>
    lista.some(
      (m) =>
        (item.id && m.itunes_track_id === item.id) ||
        (m.nome === item.nome && m.artista === item.artista)
    );

  const adicionar = async (item) => {
    const chave = item.id ?? `${item.nome}|${item.artista}`;
    if (jaEsta(item) || adicionandoChave) return;
    setAdicionandoChave(chave);
    setErro("");
    try {
      const r = await adicionarMusicaEvento(auth.eventoId, auth.senha, {
        nome: item.nome,
        artista: item.artista,
        capa: item.capa,
        itunes_track_id: item.id,
        preview_url: item.previewUrl,
      });
      setLista((l) => [...l, r.musica]);
    } catch (err) {
      setErro(
        err.message === "Limite de músicas atingido para este evento"
          ? "A playlist já chegou no limite de músicas — fale com a gente."
          : "Não deu para adicionar. Tente de novo."
      );
    } finally {
      setAdicionandoChave(null);
    }
  };

  const remover = async (item) => {
    try {
      await removerMusicaEvento(auth.eventoId, auth.senha, item.id);
      setLista((l) => l.filter((m) => m.id !== item.id));
    } catch {
      setErro("Não deu para remover. Tente de novo.");
    }
  };

  return (
    <div className="space-y-6">
      {/* Busca (iTunes) */}
      <div className="border border-noir-700 rounded-2xl p-6 bg-noir-900/50">
        <h1 className="section-title text-lg mb-1">{auth.titulo || "Seu evento"}</h1>
        <p className="text-sm text-cream-muted mb-4">
          Busque por música ou artista e adicione as que quiser ouvir no seu evento.
        </p>

        <input
          className="input-noir"
          placeholder="Buscar por música ou artista..."
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
        />

        {(buscando || resultados.length > 0) && (
          <ul className="mt-3 divide-y divide-noir-800 max-h-[360px] overflow-y-auto pr-2 border border-noir-800 rounded-xl">
            {buscando && resultados.length === 0 && (
              <li className="px-3 py-3 text-xs text-cream-muted">Buscando...</li>
            )}
            {resultados.map((r, i) => {
              const chave = r.id ?? `${r.nome}|${r.artista}`;
              const adicionada = jaEsta(r);
              return (
                <li key={i} className="flex items-center gap-3 px-3 py-2.5">
                  {r.capa ? (
                    <img
                      src={r.capa}
                      alt=""
                      className="w-10 h-10 rounded-lg border border-noir-700 shrink-0"
                    />
                  ) : (
                    <span className="w-10 h-10 rounded-lg border border-noir-700 shrink-0 flex items-center justify-center text-cream-muted">
                      ♪
                    </span>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-cream truncate">{r.nome}</p>
                    <p className="text-xs text-cream-muted truncate">{r.artista}</p>
                  </div>
                  {r.previewUrl && (
                    <button
                      onClick={() => tocar(r.previewUrl)}
                      aria-label={tocandoUrl === r.previewUrl ? "Parar trecho" : "Ouvir trecho"}
                      title="Ouvir um trecho de 30s"
                      className="shrink-0 w-8 h-8 rounded-full border border-gold-600 text-gold-300 text-xs hover:bg-noir-800 transition"
                    >
                      {tocandoUrl === r.previewUrl ? "❚❚" : "▶"}
                    </button>
                  )}
                  <button
                    onClick={() => adicionar(r)}
                    disabled={adicionada || adicionandoChave === chave}
                    className="shrink-0 btn-gold px-3 py-1.5 rounded-lg text-xs disabled:opacity-50"
                  >
                    {adicionada ? "Adicionada ✓" : adicionandoChave === chave ? "..." : "+ Adicionar"}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {erro && <p className="text-red-400 text-sm">{erro}</p>}

      {/* Playlist do evento (com opção de remover) */}
      <div className="border border-noir-700 rounded-2xl p-6 bg-noir-900/50">
        <h2 className="section-title text-sm mb-4">
          Sua lista {carregandoLista ? "" : `(${lista.length})`}
        </h2>
        {carregandoLista ? (
          <p className="text-cream-muted text-sm py-4">Carregando...</p>
        ) : lista.length === 0 ? (
          <p className="text-cream-muted text-sm py-4">
            Nenhuma música ainda — busque acima e adicione as suas favoritas.
          </p>
        ) : (
          <ul className="divide-y divide-noir-800 max-h-[420px] overflow-y-auto pr-2">
            {lista.map((m) => (
              <li key={m.id} className="flex items-center gap-3 py-3">
                {m.capa ? (
                  <img
                    src={m.capa}
                    alt=""
                    className="w-10 h-10 rounded-lg border border-noir-700 shrink-0"
                  />
                ) : (
                  <span className="w-10 h-10 rounded-lg border border-noir-700 shrink-0 flex items-center justify-center text-cream-muted">
                    ♪
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-cream truncate">{m.nome}</p>
                  <p className="text-xs text-cream-muted truncate">{m.artista}</p>
                </div>
                <button
                  onClick={() => remover(m)}
                  className="shrink-0 px-3 py-1.5 rounded-lg border border-noir-700 text-xs text-cream-muted hover:text-red-400 hover:border-red-900 transition"
                >
                  Remover
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
