import csv
import os

BASE = r"e:\Estudos e Projetos\Site Duo Mariel\Repertório\Repertório"
CSV_PATH = os.path.join(os.path.dirname(__file__), "relatorio_lote.csv")
SAIDA = os.path.join(os.path.dirname(__file__), "para_retranscrever.txt")

# monta um indice nome_arquivo -> caminho completo (procura em todo o repertorio)
indice = {}
for root, dirs, files in os.walk(BASE):
    for fn in files:
        if fn.lower().endswith(".pdf"):
            indice[fn] = os.path.join(root, fn)

with open(CSV_PATH, encoding="utf-8") as f:
    linhas = list(csv.DictReader(f))

problematicos = [l for l in linhas if l["status"] in ("FONTE_QUEBRADA", "SEM_ACORDES")]

with open(SAIDA, "w", encoding="utf-8") as f:
    f.write(f"FONTE QUEBRADA ({sum(1 for l in problematicos if l['status']=='FONTE_QUEBRADA')} arquivos)\n")
    f.write("Abrem normal num leitor de PDF -- so a extracao automatica de texto falha.\n")
    f.write("=" * 70 + "\n")
    for l in problematicos:
        if l["status"] == "FONTE_QUEBRADA":
            caminho = indice.get(l["arquivo"], "??? nao encontrado ???")
            f.write(f"{caminho}\n")

    f.write(f"\n\nSEM ACORDES ({sum(1 for l in problematicos if l['status']=='SEM_ACORDES')} arquivos)\n")
    f.write("Provavelmente PDF de letra sem cifra (impressao de site de letras) ou imagem escaneada.\n")
    f.write("=" * 70 + "\n")
    for l in problematicos:
        if l["status"] == "SEM_ACORDES":
            caminho = indice.get(l["arquivo"], "??? nao encontrado ???")
            f.write(f"{caminho}\n")

print(f"Escrito em: {SAIDA}")
print(f"Fonte quebrada: {sum(1 for l in problematicos if l['status']=='FONTE_QUEBRADA')}")
print(f"Sem acordes: {sum(1 for l in problematicos if l['status']=='SEM_ACORDES')}")
