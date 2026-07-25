import { Component } from "react";

// Mensagens típicas quando um pedaço "code-split" (ex.: a tela de Cifra,
// carregada sob demanda) não carrega porque o app em memória ainda tem os
// nomes de arquivo (hashes) de um deploy anterior, já removido do servidor
const ERRO_CHUNK_DESATUALIZADO =
  /dynamically imported module|Importing a module script failed|Failed to fetch dynamically imported module|Loading chunk/i;

const CHAVE_JA_TENTOU_RECARREGAR = "cifra-recarregou-apos-erro";

// Pega qualquer erro não tratado na árvore de componentes e mostra uma
// tela de recuperação em vez de deixar a página em branco (React 18
// desmonta a árvore inteira quando um erro de render não é capturado)
export default class ErrorBoundary extends Component {
  state = { comErro: false, chunkDesatualizado: false };

  static getDerivedStateFromError(error) {
    return {
      comErro: true,
      chunkDesatualizado: ERRO_CHUNK_DESATUALIZADO.test(error?.message ?? ""),
    };
  }

  componentDidCatch(error, info) {
    console.error("Erro não tratado:", error, info);

    // Esse tipo de erro se resolve sozinho com um recarregamento (a página
    // volta a buscar os arquivos certos) — tenta uma vez automaticamente,
    // sem esperar o usuário perceber e tocar no botão. A trava por
    // sessionStorage evita um loop infinito de recarregamentos se o erro
    // persistir por outro motivo.
    if (ERRO_CHUNK_DESATUALIZADO.test(error?.message ?? "")) {
      try {
        if (sessionStorage.getItem(CHAVE_JA_TENTOU_RECARREGAR)) return;
        sessionStorage.setItem(CHAVE_JA_TENTOU_RECARREGAR, "1");
      } catch {
        // sessionStorage indisponível (raro) — segue e recarrega mesmo assim
      }
      window.location.reload();
    }
  }

  render() {
    if (!this.state.comErro) return this.props.children;

    return (
      <div className="min-h-screen flex items-center justify-center px-5 text-center">
        <div>
          <p className="text-3xl mb-3">🎸💥</p>
          <h1 className="section-title text-base mb-2">Algo deu errado</h1>
          <p className="text-cream-muted text-sm mb-6 max-w-xs mx-auto">
            {this.state.chunkDesatualizado
              ? "O app tinha uma versão desatualizada em memória. Recarregando..."
              : "A página encontrou um erro inesperado. Tente recarregar."}
          </p>
          <button
            onClick={() => {
              try {
                sessionStorage.removeItem(CHAVE_JA_TENTOU_RECARREGAR);
              } catch {
                // ignora
              }
              window.location.reload();
            }}
            className="btn-gold px-6 py-3 rounded-xl text-sm"
          >
            Recarregar
          </button>
        </div>
      </div>
    );
  }
}
