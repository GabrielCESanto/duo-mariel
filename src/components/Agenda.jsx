import { useEffect, useState } from "react";
import { supabase, supabaseConfigured } from "../lib/supabase";

const MESES_ABREV = [
  "Jan", "Fev", "Mar", "Abr", "Mai", "Jun",
  "Jul", "Ago", "Set", "Out", "Nov", "Dez",
];

const EVENTOS_DEMO = [
  {
    id: "demo-1",
    titulo: "Show acústico",
    local: "Café Demonstração",
    data: dataDaqui(5),
    hora: "20:00:00",
    observacao: null,
  },
  {
    id: "demo-2",
    titulo: "Casamento (fechado)",
    local: "Espaço Exemplo",
    data: dataDaqui(12),
    hora: "18:30:00",
    observacao: "Evento privado",
  },
];

function dataDaqui(dias) {
  const d = new Date();
  d.setDate(d.getDate() + dias);
  return d.toISOString().slice(0, 10);
}

// Evita deslocamento de fuso ao converter "YYYY-MM-DD" para Date
function dataLocal(iso) {
  const [ano, mes, dia] = iso.split("-").map(Number);
  return new Date(ano, mes - 1, dia);
}

function formatarHora(hora) {
  if (!hora) return null;
  return hora.slice(0, 5).replace(":", "h");
}

export default function Agenda() {
  const [proximos, setProximos] = useState([]);
  const [realizados, setRealizados] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [verRealizados, setVerRealizados] = useState(false);

  useEffect(() => {
    if (!supabaseConfigured) {
      setProximos(EVENTOS_DEMO);
      setCarregando(false);
      return;
    }
    const hoje = dataDaqui(0);
    Promise.all([
      supabase
        .from("eventos")
        .select("id, titulo, local, data, hora, observacao")
        .gte("data", hoje)
        .order("data")
        .order("hora"),
      // Mostra os shows já realizados também — dá pra quem visita ver que o
      // duo realmente toca por aí, não só os próximos compromissos
      supabase
        .from("eventos")
        .select("id, titulo, local, data, hora, observacao")
        .lt("data", hoje)
        .order("data", { ascending: false })
        .order("hora", { ascending: false })
        .limit(5),
    ]).then(([{ data: prox, error: e1 }, { data: real, error: e2 }]) => {
      if (!e1) setProximos(prox ?? []);
      if (!e2) setRealizados(real ?? []);
      setCarregando(false);
    });
  }, []);

  // Sem show nenhum (nem futuro, nem passado), a seção não aparece
  if (!carregando && proximos.length === 0 && realizados.length === 0) return null;

  const mostrarToggle = realizados.length > 0;
  const eventos = verRealizados ? realizados : proximos;

  return (
    <section className="border border-noir-700 rounded-2xl p-6 mt-10 bg-noir-900/50">
      <div className="flex items-center justify-between gap-4 mb-4 flex-wrap">
        <h2 className="section-title text-lg">Agenda de shows</h2>
        {mostrarToggle && (
          <div className="flex gap-2">
            <button
              onClick={() => setVerRealizados(false)}
              className={`px-3 py-1.5 rounded-full text-xs tracking-wide transition border ${
                !verRealizados
                  ? "btn-gold border-transparent"
                  : "border-noir-700 text-cream-muted hover:text-cream"
              }`}
            >
              Próximos
            </button>
            <button
              onClick={() => setVerRealizados(true)}
              className={`px-3 py-1.5 rounded-full text-xs tracking-wide transition border ${
                verRealizados
                  ? "btn-gold border-transparent"
                  : "border-noir-700 text-cream-muted hover:text-cream"
              }`}
            >
              Já tocamos
            </button>
          </div>
        )}
      </div>

      {carregando ? (
        <p className="text-cream-muted text-sm py-4">Carregando agenda...</p>
      ) : eventos.length === 0 ? (
        <p className="text-cream-muted text-sm py-4">
          {verRealizados ? "Nenhum show realizado ainda." : "Nenhum show marcado no momento."}
        </p>
      ) : (
        <ul className="divide-y divide-noir-800">
          {eventos.slice(0, verRealizados ? 5 : 8).map((ev) => {
            const d = dataLocal(ev.data);
            return (
              <li key={ev.id} className="py-3 flex items-center gap-4">
                <div
                  className={`shrink-0 w-14 text-center rounded-xl border py-1.5 ${
                    verRealizados ? "border-noir-800" : "border-noir-700"
                  }`}
                >
                  <p
                    className={`text-lg leading-none font-display ${
                      verRealizados ? "text-cream-muted" : "text-gold-300"
                    }`}
                  >
                    {d.getDate()}
                  </p>
                  <p className="text-cream-muted text-[10px] uppercase tracking-wider mt-0.5">
                    {MESES_ABREV[d.getMonth()]}/{String(d.getFullYear()).slice(2)}
                  </p>
                </div>
                <div className="min-w-0 flex-1">
                  <p className={`truncate ${verRealizados ? "text-cream-muted" : "text-cream"}`}>
                    {ev.titulo}
                  </p>
                  <p className="text-cream-muted text-sm truncate">
                    {[ev.local, formatarHora(ev.hora)].filter(Boolean).join(" • ")}
                  </p>
                  {ev.observacao && (
                    <p className="text-cream-muted/70 text-xs truncate">
                      {ev.observacao}
                    </p>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
