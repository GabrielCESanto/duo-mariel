import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { parseChordPro } from "../lib/chordpro";
import { normalizarNome } from "../lib/texto";
import { useAcompanhamentoPorAcorde } from "../hooks/useAcompanhamentoPorAcorde";

const BASE = import.meta.env.BASE_URL;

// Protótipo experimental: acompanhamento de cifra "por ouvido" — escuta o
// microfone e rola a tela sozinha, sem scroll manual nem velocidade fixa.
// Acessível pelo Menu do admin ("Acompanhamento (teste)") ou direto por
// /#/teste-acompanhamento (ou /#/teste-acompanhamento/<id da música>).
//
// O sinal principal é a VOZ (o que está sendo cantado, casado com a letra
// das próximas linhas) — reconhecer o acorde tocado por áudio, sozinho,
// exigiu calibração manual e ainda assim é bem mais impreciso (testado:
// ~35-40% de semelhança até acertando). O acorde continua disponível como
// reforço opcional (útil em trecho instrumental, sem letra pra comparar),
// mas começa desligado.
export default function TesteAcompanhamento() {
  const { id } = useParams();

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
            <span className="text-cream-muted text-xs">protótipo experimental — só escuta, não grava nem envia áudio</span>
          </div>
          <Link
            to="/admin"
            className="shrink-0 px-3 py-1.5 rounded-lg border border-noir-700 text-xs text-cream-muted hover:text-gold-300 hover:border-gold-600 transition"
          >
            ‹ Menu
          </Link>
        </header>

        {id ? <Viewer id={id} /> : <Selecionar />}
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

  const [usarVoz, setUsarVoz] = useState(true);
  const [usarAcorde, setUsarAcorde] = useState(false);

  const {
    frases,
    fraseAtual,
    ouvindo,
    similaridade,
    textoOuvido,
    vozSuportada,
    erro,
    iniciar,
    parar,
    avancarManual,
    voltarManual,
  } = useAcompanhamentoPorAcorde(blocos, { usarVoz, usarAcorde });

  if (musica === undefined) return <p className="text-cream-muted text-center py-10">Carregando...</p>;
  if (musica === null || !musica.cifra_cho) {
    return (
      <p className="text-cream-muted text-center py-10">
        Cifra não encontrada ou não está em ChordPro.{" "}
        <Link to="/teste-acompanhamento" className="text-gold-300">
          Escolher outra
        </Link>
      </p>
    );
  }

  return (
    <div>
      <Link to="/teste-acompanhamento" className="text-xs text-cream-muted hover:text-gold-300">
        ← Escolher outra
      </Link>
      <h1 className="text-cream text-xl mt-2">{musica.nome}</h1>
      <p className="text-cream-muted text-sm mb-4">{musica.artista}</p>

      <div className="border border-noir-700 rounded-2xl p-4 bg-noir-900/50 mb-4">
        <div className="flex items-center gap-2 flex-wrap">
          {!ouvindo ? (
            <button onClick={iniciar} className="btn-gold px-5 py-2.5 rounded-xl text-sm">
              🎤 Iniciar escuta
            </button>
          ) : (
            <button
              onClick={parar}
              className="px-5 py-2.5 rounded-xl text-sm border border-red-800 text-red-300 hover:bg-noir-800 transition"
            >
              ⏹ Parar
            </button>
          )}
          <button
            onClick={voltarManual}
            className="px-3 py-2.5 rounded-xl text-sm border border-noir-700 text-cream-muted hover:text-cream transition"
          >
            ◀
          </button>
          <button
            onClick={avancarManual}
            className="px-3 py-2.5 rounded-xl text-sm border border-noir-700 text-cream-muted hover:text-cream transition"
          >
            ▶
          </button>
          <span className="text-cream-muted text-xs">
            {frases.length === 0
              ? "sem letra nessa cifra"
              : `linha ${Math.min(frases.indexOf(fraseAtual) + 1, frases.length)}/${frases.length}`}
          </span>
        </div>

        <div className="mt-3 flex flex-col gap-1.5">
          <label
            className={`flex items-center gap-2 text-xs ${
              ouvindo ? "text-cream-muted/50" : "text-cream-muted cursor-pointer"
            }`}
          >
            <input
              type="checkbox"
              checked={usarVoz}
              disabled={ouvindo}
              onChange={(e) => setUsarVoz(e.target.checked)}
            />
            Acompanhar por voz (sinal principal — compara o que você canta com a letra)
          </label>
          <label
            className={`flex items-center gap-2 text-xs ${
              ouvindo ? "text-cream-muted/50" : "text-cream-muted cursor-pointer"
            }`}
          >
            <input
              type="checkbox"
              checked={usarAcorde}
              disabled={ouvindo}
              onChange={(e) => setUsarAcorde(e.target.checked)}
            />
            Reforçar com detecção de acorde (experimental, mais impreciso)
          </label>
        </div>
        {usarVoz && !vozSuportada && (
          <p className="text-amber-400/80 text-xs mt-1">
            ⚠️ Esse navegador não tem reconhecimento de voz (Web Speech API) — funciona no
            Chrome/Edge, não no Firefox.
          </p>
        )}

        {erro && <p className="text-red-400 text-sm mt-3">{erro}</p>}

        {ouvindo && (
          <div className="mt-3">
            {usarAcorde && (
              <>
                <p className="text-cream-muted text-xs mb-1">
                  esperando <span className="text-gold-300">{fraseAtual?.chord}</span> — semelhança{" "}
                  {Math.round(similaridade * 100)}%
                </p>
                <div className="h-1.5 rounded-full bg-noir-800 overflow-hidden">
                  <div
                    className="h-full bg-gold-500 transition-all"
                    style={{ width: `${Math.min(100, Math.round(similaridade * 100))}%` }}
                  />
                </div>
              </>
            )}
            {usarVoz && vozSuportada && (
              <p className="text-cream-muted/70 text-xs mt-2 truncate">
                🎙️ ouvindo: <span className="italic">{textoOuvido || "..."}</span>
              </p>
            )}
          </div>
        )}
      </div>

      <CifraChoAcompanhada blocos={blocos} fraseAtual={fraseAtual} />
    </div>
  );
}

function CifraChoAcompanhada({ blocos, fraseAtual }) {
  const refsLinha = useRef({});

  useEffect(() => {
    if (!fraseAtual) return;
    refsLinha.current[fraseAtual.blocoIndex]?.scrollIntoView({
      behavior: "smooth",
      block: "center",
    });
  }, [fraseAtual]);

  return (
    <div className="pb-10 text-cream">
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
