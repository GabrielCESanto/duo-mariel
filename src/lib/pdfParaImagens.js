import * as pdfjs from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

const MAX_PIXELS = 12_000_000;
const MAX_DIMENSAO = 4096;
const TIMEOUT_PAGINA_MS = 30_000;
const LARGURA_BASE = 1000;
const ZOOM_ALVO = 2.0; // cobre bem até 200% de zoom com nitidez

// Converte um PDF (arquivo, blob ou URL) numa lista de imagens JPEG, uma por
// página — usado no upload da cifra (Admin), pra fazer esse trabalho pesado
// uma única vez, num só aparelho, em vez de cada celular que abrir a cifra
// ter que renderizar o PDF na hora (era o que deixava a abertura lenta e,
// em celulares mais fracos, arriscada).
export async function pdfParaImagensJpeg(origem, onProgresso) {
  const doc = await pdfjs.getDocument(origem).promise;
  try {
    const paginas = [];
    for (let i = 1; i <= doc.numPages; i++) {
      onProgresso?.(i, doc.numPages);

      const pagina = await doc.getPage(i);
      const base = pagina.getViewport({ scale: 1 });

      let escalaRender = (LARGURA_BASE * ZOOM_ALVO) / base.width;
      const pixels = base.width * escalaRender * (base.height * escalaRender);
      if (pixels > MAX_PIXELS) escalaRender *= Math.sqrt(MAX_PIXELS / pixels);
      const maiorLado = Math.max(base.width, base.height) * escalaRender;
      if (maiorLado > MAX_DIMENSAO) escalaRender *= MAX_DIMENSAO / maiorLado;

      const viewport = pagina.getViewport({ scale: escalaRender });
      const canvas = document.createElement("canvas");
      canvas.width = viewport.width;
      canvas.height = viewport.height;

      const tarefa = pagina.render({ canvasContext: canvas.getContext("2d"), viewport });
      await Promise.race([
        tarefa.promise,
        new Promise((_, rejeitar) =>
          setTimeout(() => rejeitar(new Error("Render travou nessa página")), TIMEOUT_PAGINA_MS)
        ),
      ]);

      const blob = await Promise.race([
        new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.92)),
        new Promise((_, rejeitar) =>
          setTimeout(() => rejeitar(new Error("Conversão travou nessa página")), TIMEOUT_PAGINA_MS)
        ),
      ]);
      canvas.width = 0;
      canvas.height = 0;
      if (!blob) throw new Error(`Falha ao converter a página ${i} em imagem`);

      paginas.push(blob);
    }
    return paginas;
  } finally {
    doc.destroy?.();
  }
}
