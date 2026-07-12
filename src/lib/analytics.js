import { GOATCOUNTER_CODE } from "../config";

// GoatCounter (analytics leve e gratuito, sem cookies).
// Só ativa em produção e se o código estiver preenchido no config.js.
export function iniciarAnalytics() {
  if (!GOATCOUNTER_CODE || import.meta.env.DEV) return;

  // Contagem manual para funcionar com o HashRouter (/#/ e /#/admin)
  window.goatcounter = { no_onload: true };

  const script = document.createElement("script");
  script.async = true;
  script.src = "https://gc.zgo.at/count.js";
  script.dataset.goatcounter = `https://${GOATCOUNTER_CODE}.goatcounter.com/count`;
  script.addEventListener("load", contarPagina);
  document.head.appendChild(script);

  window.addEventListener("hashchange", contarPagina);
}

function contarPagina() {
  window.goatcounter?.count?.({
    path: location.hash.replace(/^#/, "") || "/",
  });
}
