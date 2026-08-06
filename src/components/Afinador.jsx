import { useEffect, useRef, useState } from "react";

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

// Abaixo desse limiar, o pico de autocorrelação não é confiável o
// suficiente pra virar leitura (som não-periódico: ruído de fundo, ou o
// instante em que a corda apagando vira mais harmônico/ruído do que tom
// fundamental). Segue a mesma ideia de "clarity threshold" usada por
// outros afinadores web (ex.: Pitchy/McLeod), que descartam a leitura em
// vez de aceitar qualquer pico.
// Começou em 0.85, mas isso rejeitava TODA leitura das 3 cordas mais
// graves de nylon — cordas encordoadas têm harmônicos mais fortes/
// complexos em relação à fundamental (mais ainda em nylon), então a
// proporção pico/energia raramente chegava perto de 0.85 mesmo com a nota
// certa soando limpa. 0.6 ainda filtra ruído de fundo/silêncio de verdade
// (que fica bem mais perto de 0), só não exige um tom quase perfeitamente
// limpo pra aceitar a leitura.
const CLAREZA_MINIMA = 0.6;

// Detecta a frequência fundamental por autocorrelação (algoritmo ACF2+,
// clássico para afinadores — bom equilíbrio entre precisão e custo).
// Devolve { freq, clareza, rms }: freq é -1 quando não há leitura válida
// (silêncio/ruído/pico fraco demais); clareza é o quão "limpo" foi o pico
// (0 a ~1), usada pelo chamador pra descartar leituras pouco confiáveis;
// rms (volume do trecho) vem sempre preenchido, mesmo em leitura inválida
// — é usado pra detectar o instante do dedilhado (ver LIMIAR_ATAQUE_RMS).
function detectarFrequencia(buffer, sampleRate) {
  const tamanho = buffer.length;

  let rms = 0;
  for (let i = 0; i < tamanho; i++) rms += buffer[i] * buffer[i];
  rms = Math.sqrt(rms / tamanho);
  const invalida = { freq: -1, clareza: 0, rms };
  if (rms < 0.01) return invalida; // silêncio ou ruído fraco demais

  const limiar = 0.2;
  let inicio = 0;
  let fim = tamanho - 1;
  for (let i = 0; i < tamanho / 2; i++) {
    if (Math.abs(buffer[i]) < limiar) {
      inicio = i;
      break;
    }
  }
  for (let i = 1; i < tamanho / 2; i++) {
    if (Math.abs(buffer[tamanho - i]) < limiar) {
      fim = tamanho - i;
      break;
    }
  }

  const recorte = buffer.slice(inicio, fim);
  const n = recorte.length;
  if (n < 2) return invalida;

  const correlacao = new Array(n).fill(0);
  for (let defasagem = 0; defasagem < n; defasagem++) {
    for (let j = 0; j < n - defasagem; j++) {
      correlacao[defasagem] += recorte[j] * recorte[j + defasagem];
    }
  }

  let d = 0;
  while (d + 1 < n && correlacao[d] > correlacao[d + 1]) d++;

  let melhorValor = -1;
  let melhorPos = -1;
  for (let i = d; i < n; i++) {
    if (correlacao[i] > melhorValor) {
      melhorValor = correlacao[i];
      melhorPos = i;
    }
  }
  if (melhorPos <= 0 || melhorPos >= n - 1) return invalida;

  // correlacao[0] é a autocorrelação em defasagem zero (a energia do
  // trecho) — por Cauchy-Schwarz é sempre >= qualquer outro lag, então a
  // razão do pico encontrado por ela mede o quão periódico o sinal
  // realmente é (perto de 1 = tom limpo; perto de 0 = ruído/transiente)
  const clareza = correlacao[0] > 0 ? melhorValor / correlacao[0] : 0;
  if (clareza < CLAREZA_MINIMA) return invalida;

  // Interpolação parabólica em torno do pico para refinar o período
  let periodo = melhorPos;
  const x1 = correlacao[periodo - 1];
  const x2 = correlacao[periodo];
  const x3 = correlacao[periodo + 1];
  const a = (x1 + x3 - 2 * x2) / 2;
  const b = (x3 - x1) / 2;
  if (a !== 0) periodo -= b / (2 * a);

  return periodo > 0 ? { freq: sampleRate / periodo, clareza, rms } : invalida;
}

// Tamanho do histórico de leituras válidas usado pra suavizar a frequência
// exibida (mediana das últimas N) — sem isso, cada frame (60x/s) mostra a
// leitura bruta da autocorrelação, que varia bastante de um frame pro outro
// (ruído, harmônicos, o ataque da corda) e fazia a nota piscar/trocar rápido
// demais mesmo tocando uma corda só
const HISTORICO_TAMANHO = 10;
// Não atualiza a nota exibida mais rápido que isso — a corda não muda de
// verdade a esse ritmo, então atualizar a cada frame só deixa a leitura
// bruta (com ruído) piscando na tela
const INTERVALO_ATUALIZACAO_MS = 160;
// Frames seguidos sem detecção válida até considerar "silêncio de verdade"
// e limpar a nota — uma corda dedilhada tem altos e baixos naturais de
// volume, então um único frame sem sinal não pode apagar a nota na hora
const FRAMES_ATE_SILENCIO = 20;

// Detecta o "ataque" (o instante em que a corda é dedilhada) por um salto
// de volume — mesma ideia usada pelo afinador de referência do Chrome Team
// (github.com/googlearchive/guitar-tuner). Só decide DE NOVO qual corda
// está tocando durante essa janela logo após o ataque; fora dela, a
// decisão fica travada na última corda escolhida, então o ruído/harmônico
// da cauda apagando não consegue mais trocar a nota exibida — só um novo
// dedilhado (novo salto de volume) reabre a decisão.
const LIMIAR_ATAQUE_RMS = 0.006;
const JANELA_REAVALIACAO_MS = 250;

export default function Afinador() {
  const [ouvindo, setOuvindo] = useState(false);
  const [erro, setErro] = useState("");
  const [frequencia, setFrequencia] = useState(null);
  const [cordaTravada, setCordaTravada] = useState(null);

  const audioCtxRef = useRef(null);
  const streamRef = useRef(null);
  const rafRef = useRef(null);
  const bufferRef = useRef(null);
  const historicoRef = useRef([]);
  const framesSilencioRef = useRef(0);
  const ultimaAtualizacaoRef = useRef(0);
  const rmsAnteriorRef = useRef(0);
  const reavaliarAteRef = useRef(0);
  const cordaTravadaRef = useRef(null);

  const pararEscuta = () => {
    cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    audioCtxRef.current?.close().catch(() => {});
    streamRef.current = null;
    audioCtxRef.current = null;
    historicoRef.current = [];
    framesSilencioRef.current = 0;
    rmsAnteriorRef.current = 0;
    reavaliarAteRef.current = 0;
    cordaTravadaRef.current = null;
    setOuvindo(false);
    setFrequencia(null);
    setCordaTravada(null);
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

      const fonte = ctx.createMediaStreamSource(stream);
      const analiser = ctx.createAnalyser();
      analiser.fftSize = 2048;
      fonte.connect(analiser);
      bufferRef.current = new Float32Array(analiser.fftSize);
      historicoRef.current = [];
      framesSilencioRef.current = 0;
      ultimaAtualizacaoRef.current = 0;
      rmsAnteriorRef.current = 0;
      reavaliarAteRef.current = 0;
      cordaTravadaRef.current = null;

      setOuvindo(true);

      const loop = () => {
        analiser.getFloatTimeDomainData(bufferRef.current);
        const { freq: freqBruta, clareza, rms } = detectarFrequencia(
          bufferRef.current,
          ctx.sampleRate
        );
        // clareza já vem filtrada pelo mínimo dentro de detectarFrequencia
        // (freqBruta é -1 quando não passou) — a checagem aqui é só pra
        // deixar explícito o que faz uma leitura "valer"
        const leituraValida = freqBruta > 0 && clareza > 0;

        // Salto de volume = ataque novo — reabre a janela em que é
        // permitido trocar qual corda está travada como "a" corda atual
        const agoraFrame = performance.now();
        if (rms > rmsAnteriorRef.current + LIMIAR_ATAQUE_RMS) {
          reavaliarAteRef.current = agoraFrame + JANELA_REAVALIACAO_MS;
        }
        rmsAnteriorRef.current = rms;

        if (leituraValida) {
          framesSilencioRef.current = 0;
          const historico = historicoRef.current;
          historico.push(freqBruta);
          if (historico.length > HISTORICO_TAMANHO) historico.shift();
        } else {
          framesSilencioRef.current++;
          if (framesSilencioRef.current > FRAMES_ATE_SILENCIO) {
            historicoRef.current = [];
            cordaTravadaRef.current = null; // silêncio de verdade: destrava
          }
        }

        const agora = performance.now();
        if (agora - ultimaAtualizacaoRef.current >= INTERVALO_ATUALIZACAO_MS) {
          ultimaAtualizacaoRef.current = agora;
          const historico = historicoRef.current;
          if (historico.length === 0) {
            setFrequencia(null);
            cordaTravadaRef.current = null;
            setCordaTravada(null);
          } else {
            // Mediana em vez de média: um único harmônico/ruído fora da
            // curva não arrasta o resultado como puxaria numa média
            const ordenado = [...historico].sort((a, b) => a - b);
            const mediana = ordenado[Math.floor(ordenado.length / 2)];
            setFrequencia(mediana);

            // Só reavalia qual corda é essa dentro da janela pós-ataque
            // (ou se ainda não há nenhuma travada) — fora dela, mantém a
            // última escolha mesmo que a leitura oscile um pouco
            if (agora < reavaliarAteRef.current || !cordaTravadaRef.current) {
              cordaTravadaRef.current = cordaMaisProxima(mediana);
            }
            setCordaTravada(cordaTravadaRef.current);
          }
        }

        rafRef.current = requestAnimationFrame(loop);
      };
      loop();
    } catch (e) {
      console.error("Erro ao acessar o microfone:", e);
      setErro("Não foi possível acessar o microfone. Confira a permissão do navegador.");
    }
  };

  const corda = frequencia ? cordaTravada : null;
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
