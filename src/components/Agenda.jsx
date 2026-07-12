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
  const [eventos, setEventos] = useState([]);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    if (!supabaseConfigured) {
      setEventos(EVENTOS_DEMO);
      setCarregando(false);
      return;
    }
    supabase
      .from("eventos")
      .select("id, titulo, local, data, hora, observacao")
      .gte("data", dataDaqui(-1))
      .order("data")
      .order("hora")
      .then(({ data, error }) => {
        if (!error) setEventos(data ?? []);
        setCarregando(false);
      });
  }, []);

  // Sem eventos futuros, a seção não aparece para o visitante
  if (!carregando && eventos.length === 0) return null;

  return (
    <section className="border border-noir-700 rounded-2xl p-6 mt-10 bg-noir-900/50">
      <h2 className="section-title text-lg mb-4">Agenda de shows</h2>

      {carregando ? (
        <p className="text-cream-muted text-sm py-4">Carregando agenda...</p>
      ) : (
        <ul className="divide-y divide-noir-800">
          {eventos.slice(0, 8).map((ev) => {
            const d = dataLocal(ev.data);
            return (
              <li key={ev.id} className="py-3 flex items-center gap-4">
                <div className="shrink-0 w-14 text-center rounded-xl border border-noir-700 py-1.5">
                  <p className="text-gold-300 text-lg leading-none font-display">
                    {d.getDate()}
                  </p>
                  <p className="text-cream-muted text-[10px] uppercase tracking-wider mt-0.5">
                    {MESES_ABREV[d.getMonth()]}/{String(d.getFullYear()).slice(2)}
                  </p>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-cream truncate">{ev.titulo}</p>
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
