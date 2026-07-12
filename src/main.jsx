import React, { Suspense, lazy } from "react";
import ReactDOM from "react-dom/client";
import { HashRouter, Routes, Route } from "react-router-dom";
import "./index.css";
import Home from "./pages/Home.jsx";
import Admin from "./pages/Admin.jsx";
import { iniciarAnalytics } from "./lib/analytics.js";

// pdf.js é pesado — só baixa quando alguém abre uma cifra
const Cifra = lazy(() => import("./pages/Cifra.jsx"));

iniciarAnalytics();

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <HashRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/admin" element={<Admin />} />
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
  </React.StrictMode>
);
