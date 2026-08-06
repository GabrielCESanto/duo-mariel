import os
import re
import sys
import csv

sys.path.insert(0, os.path.dirname(__file__))
from pdf_para_cho import processar_pdf

BASE = r"e:\Estudos e Projetos\Site Duo Mariel\Repertório\Repertório"
RELATORIO = os.path.join(os.path.dirname(__file__), "relatorio_lote.csv")

CHORD_BRACKET_RE = re.compile(r'\[[^\]]*\]')


def contar_acordes(texto_cho):
    total = 0
    for linha in texto_cho.splitlines():
        if linha.startswith(("{title:", "{artist:", "{comment:")):
            continue
        total += len(CHORD_BRACKET_RE.findall(linha))
    return total


def main():
    pdfs = []
    for root, dirs, files in os.walk(BASE):
        for fn in files:
            if fn.lower().endswith(".pdf"):
                pdfs.append(os.path.join(root, fn))
    pdfs.sort()

    linhas_relatorio = []
    for idx, caminho in enumerate(pdfs, 1):
        nome = os.path.basename(caminho)
        try:
            resultado, usou_ocr = processar_pdf(caminho)
        except Exception as e:
            linhas_relatorio.append([nome, "ERRO", str(e), 0, False])
            print(f"[{idx}/{len(pdfs)}] ERRO: {nome}: {e}")
            continue

        n_acordes = contar_acordes(resultado)
        tem_cid_garbage = "(cid:" in resultado

        destino = os.path.splitext(caminho)[0] + ".cho"
        with open(destino, "w", encoding="utf-8") as f:
            f.write(resultado)

        if tem_cid_garbage:
            status = "FONTE_QUEBRADA"
        elif n_acordes == 0:
            status = "SEM_ACORDES"
        else:
            status = "OK"

        linhas_relatorio.append([nome, status, "", n_acordes, usou_ocr])
        tag = " [OCR]" if usou_ocr else ""
        print(f"[{idx}/{len(pdfs)}] {status}{tag}: {nome} ({n_acordes} acordes)")

    with open(RELATORIO, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["arquivo", "status", "erro", "num_acordes", "usou_ocr"])
        w.writerows(linhas_relatorio)

    from collections import Counter
    contagem = Counter(l[1] for l in linhas_relatorio)
    print("\n=== RESUMO ===")
    for status, n in contagem.most_common():
        print(f"{status}: {n}")
    print(f"Total: {len(linhas_relatorio)}")


if __name__ == "__main__":
    main()
