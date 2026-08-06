"""
Converte cifras em PDF (padrao Cifra Club: titulo/artista/tom no topo,
[Secoes] entre colchetes, pares linha-de-acorde + linha-de-letra) para
ChordPro (.cho) -- texto com os acordes embutidos entre colchetes.

Alguns PDFs tem fonte sem mapa de caracteres (texto extraido vira lixo tipo
"(cid:19)") ou nao tem texto nenhum (pagina escaneada). Nesses casos, cai
automaticamente para OCR (renderiza a pagina como imagem e le com Tesseract)
-- mais lento, mas ainda devolve palavra + posicao (x,y), entao a mesma
logica de acoplar acorde+letra funciona igual.

Uso: py pdf_para_cho.py <pdf1> <pdf2> ...
Escreve um .cho ao lado de cada .pdf convertido (mesmo nome, extensao .cho).
"""
import pdfplumber
import re
import sys
import os

TESSERACT_CMD = r"C:\Program Files\Tesseract-OCR\tesseract.exe"
TESSDATA_DIR = os.path.join(os.path.dirname(__file__), "tessdata")

CHORD_RE = re.compile(r'^[A-G](#|b)?[a-zA-Z0-9°ºΔ#\(\)\+\-/]{0,12}$')
TOLERANCIA_LINHA = 3.0  # px: palavras com "top" a menos que isso de distancia = mesma linha
RUIDO_DIAGRAMA_RE = re.compile(
    r'^(parte\s+\d+|\(repete parte \d+ e parte \d+\))$', re.IGNORECASE
)


def agrupar_linhas(palavras):
    """Agrupa palavras em linhas por proximidade vertical (não por round() do top,
    que quebra linhas que na verdade sao a mesma por causa de sub-pixel)."""
    palavras = sorted(palavras, key=lambda w: (w["top"], w["x0"]))
    linhas = []
    atual = []
    ultimo_top = None
    for w in palavras:
        if ultimo_top is not None and abs(w["top"] - ultimo_top) > TOLERANCIA_LINHA:
            linhas.append(atual)
            atual = []
        atual.append(w)
        ultimo_top = w["top"]
    if atual:
        linhas.append(atual)
    # ordena palavras dentro de cada linha por x
    for linha in linhas:
        linha.sort(key=lambda w: w["x0"])
    return linhas


def eh_linha_de_acordes(linha):
    if not linha:
        return False
    return all(CHORD_RE.match(w["text"]) for w in linha)


def eh_marcador_secao(linha):
    return len(linha) >= 1 and linha[0]["text"].startswith("[")


def dividir_marcador_secao(linha):
    """Uma linha de marcador pode trazer acordes colados na mesma linha visual
    (ex.: "[Intro] G D/F# Em C"). Separa o nome da secao do resto das palavras."""
    fechamento_idx = None
    for idx, w in enumerate(linha):
        if w["text"].endswith("]"):
            fechamento_idx = idx
            break
    if fechamento_idx is None:
        return texto_da_linha(linha).strip("[]"), []
    nome = texto_da_linha(linha[: fechamento_idx + 1]).strip("[]")
    resto = linha[fechamento_idx + 1 :]
    return nome, resto


def texto_da_linha(linha):
    return " ".join(w["text"] for w in linha)


def mesclar_acorde_letra(linha_acordes, linha_letra):
    """Insere [Acorde] no texto da letra na posicao x correspondente."""
    texto = texto_da_linha(linha_letra)
    # posicoes de insercao: para cada palavra da letra, sabemos seu x0 no texto
    # concatenado (com espaco simples entre palavras, como em texto_da_linha)
    posicoes = []
    cursor = 0
    for w in linha_letra:
        posicoes.append((w["x0"], cursor))
        cursor += len(w["text"]) + 1  # +1 pelo espaco

    insercoes = []  # (indice_no_texto, "[Acorde]")
    for ac in linha_acordes:
        alvo_x = ac["x0"]
        # acha a primeira palavra da letra cujo x0 >= alvo_x; senao usa a ultima
        idx_texto = len(texto)
        for x0, idx in posicoes:
            if x0 >= alvo_x - 1:  # pequena tolerancia
                idx_texto = idx
                break
        insercoes.append((idx_texto, f'[{ac["text"]}]'))

    # aplica de tras pra frente pra nao bagunçar os indices
    insercoes.sort(key=lambda t: t[0], reverse=True)
    for idx, marcado in insercoes:
        texto = texto[:idx] + marcado + texto[idx:]
    return texto


def linha_so_acordes_para_cho(linha):
    return " ".join(f'[{w["text"]}]' for w in linha)


HEADER_KEYWORDS = {
    "tom:": "key",
    "capotraste": "capo",
    "afinação:": "tuning",
    "composição de:": "composer",
}


def extrair_paginas_pdfplumber(caminho):
    """Cada pagina vira uma lista de palavras {"text","top","x0"}. Rapido,
    mas depende do PDF ter um mapa de caracteres embutido valido."""
    paginas = []
    with pdfplumber.open(caminho) as pdf:
        for pagina in pdf.pages:
            palavras = pagina.extract_words(use_text_flow=False, keep_blank_chars=False)
            paginas.append([{"text": w["text"], "top": w["top"], "x0": w["x0"]} for w in palavras])
    return paginas


def paginas_tem_problema(paginas):
    """Detecta fonte sem mapa de caracteres (vira "(cid:19)" etc.) ou pagina
    sem texto nenhum (PDF escaneado) -- os dois casos pedem OCR."""
    total_palavras = sum(len(p) for p in paginas)
    if total_palavras == 0:
        return True
    for pagina in paginas:
        for w in pagina:
            if "(cid:" in w["text"]:
                return True
    return False


def extrair_paginas_ocr(caminho, zoom=3):
    """Mesmo formato de saida que extrair_paginas_pdfplumber, mas lendo a
    imagem renderizada da pagina via Tesseract -- ignora completamente o
    texto embutido no PDF (por isso funciona em PDFs com fonte quebrada)."""
    import fitz
    import pytesseract
    from PIL import Image
    import io

    pytesseract.pytesseract.tesseract_cmd = TESSERACT_CMD
    # via variavel de ambiente (nao via config "--tessdata-dir ...") porque o
    # caminho deste projeto tem espaços, e o pytesseract so faz split() por
    # espaço na string de config, sem respeitar aspas
    os.environ["TESSDATA_PREFIX"] = TESSDATA_DIR

    paginas = []
    doc = fitz.open(caminho)
    try:
        for pagina_fitz in doc:
            mat = fitz.Matrix(zoom, zoom)
            pix = pagina_fitz.get_pixmap(matrix=mat)
            img = Image.open(io.BytesIO(pix.tobytes("png")))
            dados = pytesseract.image_to_data(
                img, lang="por", output_type=pytesseract.Output.DICT
            )
            palavras = []
            for i in range(len(dados["text"])):
                texto = dados["text"][i].strip()
                if not texto:
                    continue
                # divide por zoom pra manter a mesma escala usada pelo
                # resto do codigo (tolerancias/pontos de corte foram
                # calibrados em pontos do PDF, nao em pixels da imagem)
                palavras.append(
                    {"text": texto, "top": dados["top"][i] / zoom, "x0": dados["left"][i] / zoom}
                )
            paginas.append(palavras)
    finally:
        doc.close()
    return paginas


def processar_paginas(paginas):
    """Recebe uma lista de paginas (cada uma: lista de palavras
    {"text","top","x0"}) e devolve o texto final em ChordPro."""
    saida = []
    titulo = None
    artista = None
    meta_extra = []
    em_header = True
    primeira_pagina = True

    for palavras in paginas:
        if not palavras:
            continue
        linhas = agrupar_linhas(palavras)

        i = 0
        while i < len(linhas):
            linha = linhas[i]
            texto = texto_da_linha(linha)

            if em_header and primeira_pagina:
                if titulo is None:
                    titulo = texto
                    i += 1
                    continue
                if artista is None:
                    artista = texto
                    i += 1
                    continue
                texto_lower = texto.lower()
                bateu_keyword = any(texto_lower.startswith(kw) for kw in HEADER_KEYWORDS)
                if bateu_keyword:
                    meta_extra.append(texto)
                    i += 1
                    continue
                # nao bateu nenhuma palavra-chave de cabecalho -> cabecalho
                # acabou aqui, mesmo que essa cifra nunca tenha um [Marcador
                # de secao] (algumas cifras mais curtas/pop nao usam) --
                # cai pro processamento de corpo abaixo (nao avanca i)
                em_header = False

            # --- corpo ---
            if RUIDO_DIAGRAMA_RE.match(texto.strip()):
                # rotulos de diagrama de acorde ("Parte 1", "Parte 2"...),
                # nao fazem parte da letra/acorde de verdade
                i += 1
                continue

            if eh_marcador_secao(linha):
                nome_secao, resto = dividir_marcador_secao(linha)
                saida.append(f"{{comment: {nome_secao}}}")
                if resto:
                    linha = resto
                    texto = texto_da_linha(linha)
                else:
                    i += 1
                    continue

            if eh_linha_de_acordes(linha):
                proxima = linhas[i + 1] if i + 1 < len(linhas) else None
                if proxima and not eh_linha_de_acordes(proxima) and not eh_marcador_secao(proxima):
                    saida.append(mesclar_acorde_letra(linha, proxima))
                    i += 2
                    continue
                else:
                    saida.append(linha_so_acordes_para_cho(linha))
                    i += 1
                    continue

            # linha de letra sem acorde acima
            saida.append(texto)
            i += 1

        primeira_pagina = False
        saida.append("")  # respiro entre paginas

    cho = []
    if titulo:
        cho.append(f"{{title: {titulo}}}")
    if artista:
        cho.append(f"{{artist: {artista}}}")
    for m in meta_extra:
        cho.append(f"{{comment: {m}}}")
    cho.append("")
    cho.extend(saida)
    return "\n".join(cho)


def processar_pdf(caminho, permitir_ocr=True):
    """Retorna (texto_cho, usou_ocr)."""
    paginas = extrair_paginas_pdfplumber(caminho)
    usou_ocr = False
    if permitir_ocr and paginas_tem_problema(paginas):
        paginas = extrair_paginas_ocr(caminho)
        usou_ocr = True
    return processar_paginas(paginas), usou_ocr


if __name__ == "__main__":
    for caminho in sys.argv[1:]:
        try:
            resultado, usou_ocr = processar_pdf(caminho)
        except Exception as e:
            print(f"ERRO em {caminho}: {e}", file=sys.stderr)
            continue
        destino = os.path.splitext(caminho)[0] + ".cho"
        with open(destino, "w", encoding="utf-8") as f:
            f.write(resultado)
        tag = " (via OCR)" if usou_ocr else ""
        print(f"OK{tag}: {destino}")
