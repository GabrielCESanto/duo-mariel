"""
Apaga do Storage as imagens de pagina (<id>-imgs<versao>-pN.jpg) das
musicas que ja tem cifra_cho -- ficaram orfas depois da migracao pra
ChordPro, ja que Cifra.jsx sempre prioriza o .cho quando ele existe (as
imagens nunca mais sao mostradas nesse caso). NAO mexe no PDF original
(cifra_path) nem na musica em si -- so as imagens geradas e as colunas
cifra_paginas/cifra_versao (voltam a null).

Por padrao roda em modo SIMULACAO (nao apaga nada, so mostra o que faria).
Passe --aplicar pra apagar de verdade.

Le SUPABASE_URL (ou VITE_SUPABASE_URL) e SUPABASE_SERVICE_ROLE_KEY do
ambiente ou do .env na raiz do projeto (mesmo esquema do
subir_cho_em_lote.py) -- NUNCA cole a chave no codigo nem em nenhum
arquivo do repo.

Uso:
  py scripts/limpar_imagens_geradas.py              # simula, nao apaga
  py scripts/limpar_imagens_geradas.py --aplicar    # apaga de verdade
"""
import json
import os
import sys
import urllib.error
import urllib.request

ENV_PATH = os.path.join(os.path.dirname(__file__), "..", ".env")
BUCKET = "cifras"


def carregar_env_local():
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


def buscar_musicas_com_imagens(url, chave):
    req = urllib.request.Request(
        f"{url}/rest/v1/musicas"
        "?select=id,nome,cifra_paginas,cifra_versao"
        "&cifra_cho=not.is.null"
        "&cifra_versao=not.is.null",
        headers={"apikey": chave, "Authorization": f"Bearer {chave}"},
    )
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read())


def remover_arquivos(url, chave, caminhos):
    corpo = json.dumps({"prefixes": caminhos}).encode("utf-8")
    req = urllib.request.Request(
        f"{url}/storage/v1/object/{BUCKET}",
        data=corpo,
        method="DELETE",
        headers={
            "apikey": chave,
            "Authorization": f"Bearer {chave}",
            "Content-Type": "application/json",
        },
    )
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read())


def limpar_colunas(url, chave, musica_id):
    corpo = json.dumps({"cifra_paginas": None, "cifra_versao": None}).encode("utf-8")
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

    print("Buscando musicas com .cho que ainda tem imagens geradas...")
    musicas = buscar_musicas_com_imagens(url, chave)

    if not musicas:
        print("Nenhuma musica com imagens orfas -- nada pra fazer.")
        return

    total_arquivos = sum(m["cifra_paginas"] or 0 for m in musicas)
    print(f"\n{len(musicas)} musica(s), {total_arquivos} arquivo(s) de imagem no total.\n")
    for m in musicas[:20]:
        print(f"  - {m['nome']} ({m['cifra_paginas']} pagina(s))")
    if len(musicas) > 20:
        print(f"  ... e mais {len(musicas) - 20}")

    if not aplicar:
        print("\nSimulacao -- nada foi apagado. Rode de novo com --aplicar pra apagar de verdade.")
        return

    print(f"\nApagando imagens de {len(musicas)} musica(s)...")
    falhas = []
    for i, m in enumerate(musicas, 1):
        caminhos = [
            f"{m['id']}-imgs{m['cifra_versao']}-p{p}.jpg"
            for p in range(1, (m["cifra_paginas"] or 0) + 1)
        ]
        try:
            if caminhos:
                remover_arquivos(url, chave, caminhos)
            limpar_colunas(url, chave, m["id"])
            print(f"[{i}/{len(musicas)}] OK: {m['nome']} ({len(caminhos)} arquivo(s))")
        except urllib.error.HTTPError as e:
            falhas.append(m["nome"])
            print(f"[{i}/{len(musicas)}] ERRO: {m['nome']}: {e} -- {e.read().decode(errors='replace')}")

    print(f"\nConcluido: {len(musicas) - len(falhas)} ok, {len(falhas)} falha(s).")
    if falhas:
        print("Falharam:", ", ".join(falhas))


if __name__ == "__main__":
    main()
