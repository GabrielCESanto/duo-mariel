import { useEffect, useRef, useState } from "react";
import { PitchDetector } from "pitchy";

// Ícone em traço fino (respeita a cor do site via currentColor) — combina
// com o padrão usado no Admin, em vez de emoji colorido
function IconeMicrofone({ className = "w-4 h-4" }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <rect x="9" y="2" width="6" height="12" rx="3" />
      <path d="M5 11a7 7 0 0014 0" />
      <line x1="12" y1="18" x2="12" y2="22" />
      <line x1="8" y1="22" x2="16" y2="22" />
    </svg>
  );
}

// Afinação padrão do violão, da corda mais grave (6ª) à mais aguda (1ª)
const CORDAS = [
  { nota: "E2", freq: 82.41 },
  { nota: "A2", freq: 110.0 },
  { nota: "D3", freq: 146.83 },
  { nota: "G3", freq: 196.0 },
  { nota: "B3", freq: 246.94 },
  { nota: "E4", freq: 329.63 },
];

const cordaMaisProxima = (freq) =>
  CORDAS.reduce((maisProxima, corda) =>
    Math.abs(Math.log2(freq / corda.freq)) < Math.abs(Math.log2(freq / maisProxima.freq))
      ? corda
      : maisProxima
  );

// Diferença de afinação em centavos (1/100 de semitom) entre a frequência
// captada e a da corda de referência mais próxima
const centavosDeDesvio = (freq, freqAlvo) => Math.round(1200 * Math.log2(freq / freqAlvo));

// Detecção de tom via pitchy (McLeod Pitch Method) em vez de uma
// autocorrelação caseira — depois de várias rodadas calibrando limiares às
// cegas (que ainda assim falhavam nas cordas graves, nylon e aço), trocamos
// pelo algoritmo de uma biblioteca madura, desenhado especificamente pra
// evitar erro de oitava/instabilidade. Os valores abaixo vêm de um afinador
// web real em produção que usa a mesma lib (github.com/chordbook/tuner),
// não de tentativa e erro:
// - TAMANHO_BUFFER maior (8192 em vez dos 2048 de antes) dá muito mais
//   períodos de onda pra analisar nas cordas graves (o E2, mais grave,
//   tinha só ~3,8 períodos numa janela de 2048 amostras — pouco pra uma
//   leitura confiável). Isso só é viável em custo de CPU porque pitchy usa
//   FFT (O(n log n)) por baixo, não o loop O(n²) que tínhamos.
// - CLAREZA_MINIMA de 0.9 é bem mais alta que a que tentamos antes (0.6),
//   mas a "clareza" do McLeod Pitch Method é uma medida bem mais
//   confiável que a nossa razão pico/energia caseira — nos testes de
//   quem já usa essa lib em produção, 0.9 funciona sem rejeitar tom limpo.
const TAMANHO_BUFFER = 8192;
const CLAREZA_MINIMA = 0.9;
// Faixa de frequência do violão (E2 a E4, com uma margem pra aceitar uma
// corda destinada) — usada tanto pra filtrar a leitura quanto pra
// configurar os filtros passa-alta/passa-baixa antes da análise
const FREQ_MINIMA = 70;
const FREQ_MAXIMA = 400;

const INTERVALO_MS = 100;
// Ticks seguidos sem leitura válida até considerar "silêncio de verdade"
// e limpar a nota — uma corda dedilhada tem altos e baixos naturais de
// volume, então um único tick sem sinal não pode apagar a nota na hora
const TICKS_ATE_SILENCIO = 6;

export default function Afinador() {
  const [ouvindo, setOuvindo] = useState(false);
  const [erro, setErro] = useState("");
  const [frequencia, setFrequencia] = useState(null);

  const audioCtxRef = useRef(null);
  const streamRef = useRef(null);
  const intervalRef = useRef(null);
  const bufferRef = useRef(null);
  const detectorRef = useRef(null);
  const ticksSilencioRef = useRef(0);

  const pararEscuta = () => {
    clearInterval(intervalRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    audioCtxRef.current?.close().catch(() => {});
    streamRef.current = null;
    audioCtxRef.current = null;
    ticksSilencioRef.current = 0;
    setOuvindo(false);
    setFrequencia(null);
  };

  useEffect(() => pararEscuta, []); // solta o microfone ao sair da aba

  const iniciarEscuta = async () => {
    setErro("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const AudioContextClasse = window.AudioContext || window.webkitAudioContext;
      const ctx = new AudioContextClasse();
      audioCtxRef.current = ctx;

      // Filtra fora da faixa do violão ANTES da análise — reduz ruído
      // grave (zumbido de rede, manuseio) e agudo (chiado, harmônicos
      // distantes) que só atrapalhariam a detecção
      const passaAlta = new BiquadFilterNode(ctx, { type: "highpass", frequency: FREQ_MINIMA });
      const passaBaixa = new BiquadFilterNode(ctx, { type: "lowpass", frequency: FREQ_MAXIMA });
      const fonte = ctx.createMediaStreamSource(stream);
      const analiser = ctx.createAnalyser();
      analiser.fftSize = TAMANHO_BUFFER;
      fonte.connect(passaAlta).connect(passaBaixa).connect(analiser);

      detectorRef.current = PitchDetector.forFloat32Array(analiser.fftSize);
      bufferRef.current = new Float32Array(analiser.fftSize);
      ticksSilencioRef.current = 0;

      setOuvindo(true);

      intervalRef.current = setInterval(() => {
        analiser.getFloatTimeDomainData(bufferRef.current);
        const [freq, clareza] = detectorRef.current.findPitch(bufferRef.current, ctx.sampleRate);

        const valida = clareza >= CLAREZA_MINIMA && freq >= FREQ_MINIMA && freq <= FREQ_MAXIMA;

        if (valida) {
          ticksSilencioRef.current = 0;
          setFrequencia(freq);
        } else {
          ticksSilencioRef.current++;
          if (ticksSilencioRef.current > TICKS_ATE_SILENCIO) setFrequencia(null);
        }
      }, INTERVALO_MS);
    } catch (e) {
      console.error("Erro ao acessar o microfone:", e);
      setErro("Não foi possível acessar o microfone. Confira a permissão do navegador.");
    }
  };

  const corda = frequencia ? cordaMaisProxima(frequencia) : null;
  const desvio = corda ? centavosDeDesvio(frequencia, corda.freq) : 0;
  const desvioClamp = Math.max(-50, Math.min(50, desvio));
  const posicaoPercent = 50 + (desvioClamp / 50) * 45; // 5% a 95%
  const afinado = corda && Math.abs(desvio) <= 5;

  return (
    <div className="border border-noir-700 rounded-2xl p-6 bg-noir-900/50">
      <h2 className="section-title text-sm mb-1">Afinador</h2>
      <p className="text-xs text-cream-muted mb-6">
        Toque uma corda por vez, perto do microfone, num lugar silencioso.
      </p>

      {erro && <p className="text-red-400 text-sm mb-4">{erro}</p>}

      {!ouvindo ? (
        <div className="text-center py-8">
          <button
            onClick={iniciarEscuta}
            className="btn-gold px-6 py-3 rounded-xl text-sm inline-flex items-center gap-2"
          >
            <IconeMicrofone className="w-4 h-4" />
            Começar a afinar
          </button>
        </div>
      ) : (
        <div className="text-center py-4">
          <p className="font-display text-6xl text-gold-300">{corda ? corda.nota : "—"}</p>
          <p className="text-cream-muted text-sm mt-1">
            {frequencia ? `${frequencia.toFixed(1)} Hz` : "Ouvindo..."}
          </p>

          {/* Ponteiro de desvio (-50 a +50 centavos) */}
          <div className="relative h-9 mt-6 mb-2 rounded-full bg-noir-800 overflow-hidden">
            <div className="absolute inset-y-0 left-1/2 w-px bg-noir-600" />
            {corda && (
              <div
                className={`absolute top-0 bottom-0 w-2.5 rounded-full transition-all ${
                  afinado ? "bg-emerald-400" : "bg-gold-400"
                }`}
                style={{ left: `${posicaoPercent}%`, transform: "translateX(-50%)" }}
              />
            )}
          </div>
          <div className="flex justify-between text-[10px] text-cream-muted/60 px-1">
            <span>grave</span>
            <span>agudo</span>
          </div>

          <p className={`mt-4 text-sm ${afinado ? "text-emerald-300" : "text-cream-muted"}`}>
            {!corda
              ? "Toque uma corda..."
              : afinado
                ? "✓ Afinado!"
                : desvio > 0
                  ? `Um pouco agudo (+${desvio}) — afrouxe um pouco`
                  : `Um pouco grave (${desvio}) — aperte um pouco`}
          </p>

          <div className="flex justify-center gap-2 mt-6 flex-wrap">
            {CORDAS.map((c) => (
              <span
                key={c.nota}
                className={`px-3 py-1.5 rounded-full text-xs border transition ${
                  corda?.nota === c.nota
                    ? "btn-gold border-transparent"
                    : "border-noir-700 text-cream-muted"
                }`}
              >
                {c.nota}
              </span>
            ))}
          </div>

          <button
            onClick={pararEscuta}
            className="mt-8 px-4 py-2 rounded-xl border border-noir-700 text-sm text-cream-muted hover:text-cream transition"
          >
            Parar
          </button>
        </div>
      )}
    </div>
  );
}
