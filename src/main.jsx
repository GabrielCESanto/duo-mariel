import React, { Suspense, lazy } from "react";
import ReactDOM from "react-dom/client";
import { HashRouter, Routes, Route } from "react-router-dom";
import "./index.css";
import Home from "./pages/Home.jsx";
import Admin from "./pages/Admin.jsx";
import Especial from "./pages/Especial.jsx";
import TesteAcompanhamento from "./pages/TesteAcompanhamento.jsx";
import ErrorBoundary from "./components/ErrorBoundary.jsx";
import { iniciarAnalytics } from "./lib/analytics.js";

// pdf.js é pesado — só baixa quando alguém abre uma cifra
const Cifra = lazy(() => import("./pages/Cifra.jsx"));

iniciarAnalytics();

// O service worker (registerType: autoUpdate) troca de versão sozinho e
// assume o controle da aba na hora (skipWaiting + clientsClaim), SEM
// recarregar a página. Isso significa que o app que já estava rodando na
// memória do aparelho continua de pé com os nomes de arquivo (hashes) do
// deploy ANTERIOR — e assim que ele tentar carregar uma parte code-split
// (como a tela de cifra), a busca cai num arquivo que o novo deploy já não
// tem mais, e o import falha. Recarregar assim que o novo SW assume o
// controle evita esse descompasso.
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    window.location.reload();
  });
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ErrorBoundary>
      <HashRouter>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/admin" element={<Admin />} />
          <Route path="/especial" element={<Especial />} />
          <Route path="/teste-acompanhamento" element={<TesteAcompanhamento />} />
          <Route path="/teste-acompanhamento/:id" element={<TesteAcompanhamento />} />
          <Route
            path="/cifra/:id"
            element={
              <Suspense
                fallback={
                  <p className="text-cream-muted text-center py-20">Carregando...</p>
                }
              >
                <Cifra />
              </Suspense>
            }
          />
        </Routes>
      </HashRouter>
    </ErrorBoundary>
  </React.StrictMode>
);
