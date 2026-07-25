import { Component } from "react";

// Pega qualquer erro não tratado na árvore de componentes e mostra uma
// tela de recuperação em vez de deixar a página em branco (React 18
// desmonta a árvore inteira quando um erro de render não é capturado)
export default class ErrorBoundary extends Component {
  state = { comErro: false };

  static getDerivedStateFromError() {
    return { comErro: true };
  }

  componentDidCatch(error, info) {
    console.error("Erro não tratado:", error, info);
  }

  render() {
    if (!this.state.comErro) return this.props.children;

    return (
      <div className="min-h-screen flex items-center justify-center px-5 text-center">
        <div>
          <p className="text-3xl mb-3">🎸💥</p>
          <h1 className="section-title text-base mb-2">Algo deu errado</h1>
          <p className="text-cream-muted text-sm mb-6 max-w-xs mx-auto">
            A página encontrou um erro inesperado. Tente recarregar.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="btn-gold px-6 py-3 rounded-xl text-sm"
          >
            Recarregar
          </button>
        </div>
      </div>
    );
  }
}
