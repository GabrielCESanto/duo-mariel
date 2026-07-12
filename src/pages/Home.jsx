import { useEffect, useMemo, useRef, useState } from "react";
import { buscarPreview } from "../lib/preview";
import { Link } from "react-router-dom";
import { TAGLINE, SOBRE } from "../config";
import { useMusicas } from "../hooks/useMusicas";
import { useVideos } from "../hooks/useVideos";
import SocialLinks from "../components/SocialLinks";
import PedidoModal from "../components/PedidoModal";
import SugestaoModal from "../components/SugestaoModal";
import Agenda from "../components/Agenda";

const BASE = import.meta.env.BASE_URL;

export default function Home() {
  const { musicas, carregando } = useMusicas();
  const { videos } = useVideos();

  const [busca, setBusca] = useState("");
  const [filtroArtista, setFiltroArtista] = useState("Todos");
  const [filtroEstilo, setFiltroEstilo] = useState("Todos");
  const [pedidoAtual, setPedidoAtual] = useState(null);
  const [sugestaoAberta, setSugestaoAberta] = useState(false);

  // --- Preview de 30s (iTunes) ---
  const audioRef = useRef(null);
  const [previewId, setPreviewId] = useState(null); // música tocando
  const [previewBuscandoId, setPreviewBuscandoId] = useState(null);
  const [semPreview, setSemPreview] = useState(() => new Set());

  const pararPreview = () => {
    audioRef.current?.pause();
    setPreviewId(null);
  };

  useEffect(() => pararPreview, []); // para o áudio ao sair da página

  const alternarPreview = async (m) => {
    if (previewId === m.id) {
      pararPreview();
      return;
    }

    // iOS: o elemento de áudio precisa ser criado e "desbloqueado" com um
    // play() síncrono DENTRO do toque — depois do await o gesto não vale mais
    let audio = audioRef.current;
    if (!audio) {
      audio = new Audio();
      audio.addEventListener("ended", () => setPreviewId(null));
      audioRef.current = audio;
    }
    audio.pause();
    audio.play().catch(() => {});

    setPreviewId(null);
    setPreviewBuscandoId(m.id);

    const url = await buscarPreview(m.nome, m.artista);
    setPreviewBuscandoId(null);

    if (!url) {
      audio.pause();
      setSemPreview((s) => new Set(s).add(m.id));
      return;
    }

    audio.src = url;
    setPreviewId(m.id);
    audio.play().catch(() => setPreviewId(null));
  };

  const artistas = useMemo(() => {
    const set = new Set(musicas.map((m) => m.artista).filter(Boolean));
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [musicas]);

  const estilos = useMemo(() => {
    const set = new Set(musicas.map((m) => m.estilo).filter(Boolean));
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [musicas]);

  const resultados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return musicas.filter((m) => {
      const okArtista = filtroArtista === "Todos" || m.artista === filtroArtista;
      const okEstilo = filtroEstilo === "Todos" || m.estilo === filtroEstilo;
      if (!q) return okArtista && okEstilo;
      const texto = `${m.nome} ${m.artista} ${m.estilo ?? ""}`.toLowerCase();
      return okArtista && okEstilo && texto.includes(q);
    });
  }, [musicas, busca, filtroArtista, filtroEstilo]);

  const pedirDaLista = (m) => {
    setPedidoAtual({
      musicaFinal: `${m.nome} — ${m.artista}`,
      detalhe: m.estilo || "",
    });
  };

  return (
    <div className="min-h-screen">
      <div className="max-w-3xl mx-auto px-5 pb-10">
        {/* HERO */}
        <header className="pt-10 pb-4 text-center">
          <img
            src={`${BASE}img/logo-hero.png`}
            alt="Duo Mariel — voz e violão"
            className="logo-blend w-full max-w-xl mx-auto"
          />

          <p className="text-cream-muted italic mt-2 text-lg">{TAGLINE}</p>

          <div className="mt-6">
            <SocialLinks />
          </div>

          <div className="gold-rule mt-10" />
        </header>

        {/* REPERTÓRIO */}
        <section className="border border-noir-700 rounded-2xl p-6 mt-8 bg-noir-900/50">
          <h2 className="section-title text-lg mb-1">Peça sua música</h2>
          <p className="text-sm text-cream-muted mb-4">
            A lista abaixo é o nosso repertório — busque e toque em Pedir.
          </p>

          <input
            className="input-noir text-lg"
            placeholder="Buscar por música, artista ou estilo..."
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />

          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <select
              className="input-noir"
              value={filtroArtista}
              onChange={(e) => setFiltroArtista(e.target.value)}
            >
              <option value="Todos">Todos os artistas</option>
              {artistas.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>

            <select
              className="input-noir"
              value={filtroEstilo}
              onChange={(e) => setFiltroEstilo(e.target.value)}
            >
              <option value="Todos">Todos os estilos</option>
              {estilos.map((e) => (
                <option key={e} value={e}>
                  {e}
                </option>
              ))}
            </select>
          </div>

          <div className="mt-4 text-sm text-cream-muted">
            {carregando
              ? "Carregando repertório..."
              : `${resultados.length} música${resultados.length === 1 ? "" : "s"} encontrada${resultados.length === 1 ? "" : "s"}`}
          </div>

          <ul className="mt-2 divide-y divide-noir-800 max-h-[420px] overflow-y-auto pr-2">
            {resultados.map((m) => (
              <li key={m.id} className="py-3 flex items-center justify-between gap-3">
                {!semPreview.has(m.id) && (
                  <button
                    onClick={() => alternarPreview(m)}
                    aria-label={previewId === m.id ? "Parar trecho" : "Ouvir trecho"}
                    title="Ouvir um trecho de 30s"
                    className="btn-gold shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-full text-xs font-medium"
                  >
                    {previewBuscandoId === m.id ? (
                      "⏳"
                    ) : previewId === m.id ? (
                      <>❚❚ Parar</>
                    ) : (
                      <>▶ Ouvir</>
                    )}
                  </button>
                )}
                <div className="min-w-0 flex-1">
                  <p className="font-normal text-cream truncate">{m.nome}</p>
                  <p className="text-cream-muted text-sm truncate">
                    {m.artista}
                    {m.estilo ? ` • ${m.estilo}` : ""}
                  </p>
                </div>
                <button
                  className="btn-gold shrink-0 px-4 py-2 rounded-xl text-sm"
                  onClick={() => pedirDaLista(m)}
                >
                  Pedir
                </button>
              </li>
            ))}

            {!carregando && resultados.length === 0 && (
              <li className="py-6 text-cream-muted text-sm">
                Nada encontrado. Tente outro termo — ou sugira logo abaixo! 👇
              </li>
            )}
          </ul>

          {/* Sugerir música fora do repertório — sempre visível */}
          <div className="mt-4 pt-5 border-t border-noir-800 text-center">
            <p className="text-sm text-cream-muted mb-3">
              Não encontrou a música que queria?
            </p>
            <button
              onClick={() => setSugestaoAberta(true)}
              className="btn-gold px-6 py-3 rounded-xl text-sm"
            >
              🎸 Pedir para entrar no repertório
            </button>
          </div>
        </section>

        {/* VÍDEOS */}
        {videos.length > 0 && (
          <section className="mt-10">
            <h2 className="section-title text-lg mb-4">Vídeos</h2>
            <div className="grid sm:grid-cols-2 gap-4">
              {videos.map((v) => (
                <div
                  key={v.id}
                  className="rounded-2xl overflow-hidden border border-noir-700 bg-noir-900/40"
                >
                  {v.youtube_id ? (
                    <iframe
                      loading="lazy"
                      className="w-full aspect-video"
                      src={`https://www.youtube.com/embed/${v.youtube_id}`}
                      title={v.titulo}
                      allowFullScreen
                    />
                  ) : (
                    <iframe
                      loading="lazy"
                      className="w-full aspect-[9/16] max-h-[540px]"
                      src={`https://www.instagram.com/reel/${v.instagram_id}/embed`}
                      title={v.titulo}
                      allowFullScreen
                    />
                  )}
                  <p className="p-3 text-center text-sm text-cream-muted">{v.titulo}</p>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* AGENDA */}
        <Agenda />

        {/* SOBRE */}
        <section className="border border-noir-700 rounded-2xl p-6 mt-10 bg-noir-900/50">
          <h2 className="section-title text-lg mb-4 text-center">Sobre o duo</h2>
          <div className="text-cream leading-relaxed space-y-4">
            {SOBRE.map((paragrafo, i) => (
              <p key={i}>{paragrafo}</p>
            ))}
          </div>
          <p className="mt-6 text-center text-gold-300 font-display tracking-[0.2em] text-sm">
            🎶 ESPERAMOS VOCÊ NO PRÓXIMO SHOW 🎶
          </p>
        </section>

        {/* FOOTER */}
        <footer className="mt-12 pt-6 border-t border-noir-800 flex items-center justify-between text-xs text-cream-muted">
          <span>© {new Date().getFullYear()} Duo Mariel</span>
          <Link to="/admin" className="hover:text-gold-300 transition">
            Área do músico
          </Link>
        </footer>
      </div>

      <PedidoModal pedido={pedidoAtual} onFechar={() => setPedidoAtual(null)} />
      <SugestaoModal
        aberto={sugestaoAberta}
        musicaInicial={busca.trim()}
        onFechar={() => setSugestaoAberta(false)}
      />
    </div>
  );
}
