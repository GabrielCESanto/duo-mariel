"""
Sobe em lote os .cho ja convertidos (pdf_para_cho.py / lote_cho.py) pras
musicas correspondentes no Supabase -- casa pelo nome do arquivo com o
nome da musica cadastrada (normalizado: sem acento/pontuacao/caixa).

So processa arquivos marcados como "OK" em relatorio_lote.csv (pula
SEM_ACORDES/FONTE_QUEBRADA/ERRO -- esses ainda precisam de uma cifra de
verdade, nao vale subir um .cho pela metade).

Por padrao roda em modo SIMULACAO (nao grava nada, so mostra o que faria).
Passe --aplicar pra gravar de verdade.

Precisa de SUPABASE_URL (ou VITE_SUPABASE_URL) e SUPABASE_SERVICE_ROLE_KEY.
Le automaticamente do .env na raiz do projeto se essas variaveis nao
estiverem definidas no ambiente -- NUNCA cole a chave no codigo nem em
nenhum arquivo do repo (o .env ja e ignorado pelo git, mantenha assim).

  SUPABASE_SERVICE_ROLE_KEY -- Dashboard > Project Settings > API >
                                service_role. Essa chave ignora TODA a
                                seguranca do banco (RLS) -- trate como
                                senha de root, nunca comite, nunca
                                compartilhe, nunca cole em chat.

Uso:
  py scripts/subir_cho_em_lote.py              # simula, nao grava
  py scripts/subir_cho_em_lote.py --aplicar    # grava de verdade
"""
import csv
import json
import os
import re
import sys
import unicodedata
import urllib.error
import urllib.request

BASE = r"e:\Estudos e Projetos\Site Duo Mariel\Repertório\Repertório"
RELATORIO = os.path.join(os.path.dirname(__file__), "relatorio_lote.csv")
ENV_PATH = os.path.join(os.path.dirname(__file__), "..", ".env")


def carregar_env_local():
    """Le KEY=valor (ou KEY = valor) do .env na raiz -- so preenche o que
    ainda nao estiver definido no ambiente de verdade, pra uma variavel
    exportada na mao continuar tendo prioridade."""
    if not os.path.exists(ENV_PATH):
        return
    with open(ENV_PATH, encoding="utf-8") as f:
        for linha in f:
            linha = linha.strip()
            if not linha or linha.startswith("#") or "=" not in linha:
                continue
            chave, valor = linha.split("=", 1)
            chave, valor = chave.strip(), valor.strip()
            if chave and chave not in os.environ:
                os.environ[chave] = valor


def normalizar(nome):
    """Mesma ideia do normalizarNome() do site (src/lib/texto.js): minusculo,
    sem acento, so letras/numeros -- pra casar nome de arquivo com nome
    cadastrado mesmo com pequenas diferencas de grafia/pontuacao."""
    nome = unicodedata.normalize("NFD", nome.lower())
    nome = "".join(c for c in nome if unicodedata.category(c) != "Mn")
    nome = re.sub(r"[^a-z0-9]+", " ", nome).strip()
    return nome


def carregar_nomes_ok():
    """Nomes de arquivo (sem extensao) marcados como OK no relatorio do lote."""
    if not os.path.exists(RELATORIO):
        print(f"AVISO: {RELATORIO} nao encontrado -- vou processar TODO .cho que"
              " achar, sem filtrar os que falharam (SEM_ACORDES/FONTE_QUEBRADA).")
        return None
    ok = set()
    with open(RELATORIO, encoding="utf-8") as f:
        for linha in csv.DictReader(f):
            if linha["status"] == "OK":
                ok.add(os.path.splitext(linha["arquivo"])[0])
    return ok


def buscar_musicas(url, chave):
    req = urllib.request.Request(
        f"{url}/rest/v1/musicas?select=id,nome,cifra_cho",
        headers={"apikey": chave, "Authorization": f"Bearer {chave}"},
    )
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read())


def atualizar_cifra_cho(url, chave, musica_id, texto):
    corpo = json.dumps({"cifra_cho": texto}).encode("utf-8")
    req = urllib.request.Request(
        f"{url}/rest/v1/musicas?id=eq.{musica_id}",
        data=corpo,
        method="PATCH",
        headers={
            "apikey": chave,
            "Authorization": f"Bearer {chave}",
            "Content-Type": "application/json",
            "Prefer": "return=minimal",
        },
    )
    urllib.request.urlopen(req).close()


def main():
    aplicar = "--aplicar" in sys.argv

    carregar_env_local()
    url = (os.environ.get("SUPABASE_URL") or os.environ.get("VITE_SUPABASE_URL") or "").rstrip("/")
    chave = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not chave:
        print("Defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY (ambiente ou .env) antes de rodar.")
        sys.exit(1)

    nomes_ok = carregar_nomes_ok()

    # Indexa os .cho locais (recursivo: pega Repertorio/ e Repertorio/Done/)
    chos_locais = {}
    for root, _dirs, files in os.walk(BASE):
        for fn in files:
            if not fn.lower().endswith(".cho"):
                continue
            nome_base = os.path.splitext(fn)[0]
            if nomes_ok is not None and nome_base not in nomes_ok:
                continue
            chos_locais[normalizar(nome_base)] = os.path.join(root, fn)

    print(f"{len(chos_locais)} arquivo(s) .cho prontos pra subir (status OK no relatorio).")

    print("Buscando musicas cadastradas no Supabase...")
    musicas = buscar_musicas(url, chave)
    por_nome_normalizado = {}
    for m in musicas:
        por_nome_normalizado.setdefault(normalizar(m["nome"]), []).append(m)

    combinados = []
    sem_correspondencia = []
    ambiguos = []
    ja_tinham_cho = 0

    for nome_norm, caminho in chos_locais.items():
        candidatos = por_nome_normalizado.get(nome_norm)
        if not candidatos:
            sem_correspondencia.append(caminho)
            continue
        if len(candidatos) > 1:
            ambiguos.append((caminho, candidatos))
            continue
        musica = candidatos[0]
        if musica.get("cifra_cho"):
            ja_tinham_cho += 1
        combinados.append((musica, caminho))

    print(f"\n{len(combinados)} musica(s) serao atualizadas.")
    if ja_tinham_cho:
        print(f"  ({ja_tinham_cho} ja tinham um .cho -- serao SUBSTITUIDAS)")

    if sem_correspondencia:
        print(f"\n{len(sem_correspondencia)} arquivo(s) .cho sem musica correspondente no banco:")
        for c in sem_correspondencia:
            print(f"  - {os.path.basename(c)}")

    if ambiguos:
        print(f"\n{len(ambiguos)} nome(s) bateram com MAIS DE UMA musica (pulei, resolva na mao):")
        for c, cands in ambiguos:
            nomes = ", ".join(f'{m["nome"]} (id {m["id"]})' for m in cands)
            print(f"  - {os.path.basename(c)} -> {nomes}")

    if not aplicar:
        print("\nSimulacao -- nada foi gravado. Rode de novo com --aplicar pra gravar de verdade.")
        return

    print(f"\nGravando {len(combinados)} musica(s)...")
    falhas = []
    for i, (musica, caminho) in enumerate(combinados, 1):
        with open(caminho, encoding="utf-8") as f:
            texto = f.read()
        try:
            atualizar_cifra_cho(url, chave, musica["id"], texto)
            print(f"[{i}/{len(combinados)}] OK: {musica['nome']}")
        except urllib.error.HTTPError as e:
            falhas.append(musica["nome"])
            print(f"[{i}/{len(combinados)}] ERRO: {musica['nome']}: {e} -- {e.read().decode(errors='replace')}")

    print(f"\nConcluido: {len(combinados) - len(falhas)} ok, {len(falhas)} falha(s).")
    if falhas:
        print("Falharam:", ", ".join(falhas))


if __name__ == "__main__":
    main()
