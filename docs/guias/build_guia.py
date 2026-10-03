"""Genera docs/guias/Guia_de_Usuario_Sistema_de_Reparto.pdf a partir de GUIA_USUARIO.md.

    python docs/guias/build_guia.py

Requiere `pip install markdown` y Chrome o Edge (variable CHROME para indicar la ruta del ejecutable).
Para la copia del cliente con usuarios y claves: GUIA_ACCESOS=<accesos.md fuera del repo> y
GUIA_SALIDA=<pdf fuera del repo>.
Las capturas viven en docs/guias/img/ y se referencian como ![texto](img/archivo.jpg).
"""
import html
import os
import re
import subprocess
import tempfile
import unicodedata

import markdown

AQUI = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(AQUI, "GUIA_USUARIO.md")
OUT = os.environ.get("GUIA_SALIDA") or os.path.join(AQUI, "Guia_de_Usuario_Sistema_de_Reparto.pdf")
# Pagina de accesos con usuarios y claves, solo para la copia que se entrega al cliente: se pasa un
# .md por GUIA_ACCESOS y NUNCA se guarda en el repo (es publico).
ACCESOS = os.environ.get("GUIA_ACCESOS")
CANDIDATOS = [
    os.environ.get("CHROME", ""),
    r"C:\Program Files\Google\Chrome\Application\chrome.exe",
    r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
    r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
    r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
]
NAVEGADOR = next((c for c in CANDIDATOS if c and os.path.exists(c)), None)

CSS = """
@page { size: A4; margin: 16mm 15mm 18mm 15mm; @bottom-center { content: counter(page); font: 9pt 'Segoe UI', Arial, sans-serif; color: #888; } }
@page :first { margin: 0; @bottom-center { content: none; } }
* { box-sizing: border-box; }
body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 10.5pt; line-height: 1.5; color: #222; }
h1 { display: none; }
h2 { color: #A81C21; font-size: 17pt; margin: 0 0 8pt; padding-bottom: 4pt; border-bottom: 3px solid #A81C21; break-after: avoid; }
h3 { color: #333; font-size: 12.5pt; margin: 16pt 0 5pt; break-after: avoid; }
p, li { orphans: 3; widows: 3; }
a { color: #A81C21; text-decoration: none; }
ol, ul { padding-left: 20pt; }
li { margin: 3pt 0; }
table { border-collapse: collapse; width: 100%; margin: 8pt 0; font-size: 9.5pt; break-inside: avoid; }
th { background: #A81C21; color: #fff; text-align: left; padding: 5pt 7pt; }
td { border: 1px solid #ddd; padding: 5pt 7pt; vertical-align: top; }
tr:nth-child(even) td { background: #faf5f5; }
blockquote { margin: 9pt 0; padding: 6pt 12pt; background: #fff6e5; border-left: 4px solid #e8a33d; break-inside: avoid; }
blockquote p { margin: 3pt 0; }
code { background: #f2f2f2; padding: 1pt 4pt; border-radius: 3px; font-size: 9.5pt; }
hr { border: 0; border-top: 1px solid #ddd; margin: 14pt 0; }
.page-break { break-after: page; }

/* Portada: el primer h2 + el subtitulo + la version */
.portada { height: 297mm; padding: 70mm 22mm 0 22mm; background: linear-gradient(180deg, #A81C21 0%, #A81C21 52%, #fff 52%); color: #fff; break-after: page; }
.portada .marca { font-size: 13pt; letter-spacing: 3px; text-transform: uppercase; opacity: .85; }
.portada .titulo { font-size: 40pt; font-weight: 700; line-height: 1.1; margin: 10pt 0 6pt; }
.portada .sub { font-size: 18pt; opacity: .95; }
.portada .version { margin-top: 18pt; font-size: 11pt; opacity: .85; }
.portada .nota { margin-top: 62mm; color: #333; font-size: 11pt; line-height: 1.6; max-width: 150mm; }
.portada-nota { display: none; }

/* Figuras */
figure { margin: 10pt 0; text-align: center; break-inside: avoid; }
figure img { max-width: 100%; border: 1px solid #cfcfcf; border-radius: 4px; box-shadow: 0 1px 4px rgba(0,0,0,.12); }
figcaption { font-size: 8.8pt; color: #555; margin-top: 4pt; font-style: italic; }
.fila { display: flex; gap: 8pt; justify-content: center; align-items: flex-start; margin: 10pt 0; break-inside: avoid; }
.fila figure { margin: 0; flex: 1 1 0; min-width: 0; }
.fila.movil figure img { max-height: 118mm; width: auto; max-width: 100%; }
.fila.movil.n3 figure img { max-height: 98mm; }
.fila.movil.n4 figure img { max-height: 78mm; }
.fila.movil.n4 figcaption, .fila.movil.n3 figcaption { font-size: 8pt; }
.fila.esc figure img { max-height: 40mm; }
figure.solo.movil { float: right; width: 52mm; margin: 2pt 0 8pt 14pt; }
figure.solo.movil img { max-height: none; width: 100%; }
h2 { clear: both; }
h4 { font-size: 11pt; margin: 12pt 0 4pt; break-after: avoid; color: #333; }
figure.solo img { max-width: 94%; }
"""


def slugify(value, separator):
    value = re.sub(r"[^\w\s-]", "", unicodedata.normalize("NFC", value).lower())
    return re.sub(r"[\s]+", separator, value.strip())


def figura(src, alt):
    movil = os.path.basename(src).startswith("ch_")
    texto = html.escape(html.unescape(alt))
    return (f'<figure class="solo{" movil" if movil else ""}"><img src="{src}" alt="{texto}">'
            f'<figcaption>{texto}</figcaption></figure>'), movil


def procesar_figuras(doc):
    """Un parrafo con varias imagenes seguidas se renderiza como una fila; una sola, como figura centrada."""
    def repl(m):
        imgs = re.findall(r'<img alt="([^"]*)" src="([^"]*)"\s*/?>', m.group(0))
        if not imgs:
            return m.group(0)
        figs, moviles = zip(*(figura(src, alt) for alt, src in imgs))
        if len(figs) == 1:
            return figs[0]
        n = len(figs)
        if all(moviles):
            clase = "fila movil n%d" % n
        elif all(src.endswith("_inicio.jpg") for _alt, src in imgs):
            clase = "fila esc"
        else:  # capturas de escritorio: una debajo de otra para que se lean
            return "".join(figs)
        return f'<div class="{clase}">{"".join(f.replace("solo", "fig") for f in figs)}</div>'
    return re.sub(r"<p>(?:\s*<img [^>]*>\s*)+</p>", repl, doc)


def portada():
    return ('<div class="portada"><div class="marca">Rincón del Sur · Peyrano</div>'
            '<div class="titulo">Guía de Usuario</div><div class="sub">Sistema de Reparto</div>'
            '<div class="version">Versión 3 · Octubre 2026</div>'
            '<div class="nota">Cómo usar el sistema en el trabajo de todos los días, paso a paso y con fotografías '
            'de la pantalla. Organizada por rol: Chofer / Vendedor, Administración, Depósito, Gerencia y '
            'Administrador del sistema.</div></div>')


def main():
    if not NAVEGADOR:
        raise SystemExit("No encontre Chrome ni Edge: defini la variable CHROME con la ruta del ejecutable.")
    texto = open(SRC, encoding="utf-8").read()
    # La portada propia reemplaza el titulo y el texto de bienvenida (hasta el primer salto de pagina)
    texto = texto.split('<div class="page-break"></div>', 1)[1]
    if ACCESOS:
        accesos = open(ACCESOS, encoding="utf-8").read()
        salto = '\n\n<div class="page-break"></div>\n\n'
        texto = texto.replace("## 1. Antes de empezar", accesos + salto + "## 1. Antes de empezar", 1)
    md = markdown.Markdown(extensions=["tables", "sane_lists", "toc", "md_in_html"],
                           extension_configs={"toc": {"slugify": slugify}})
    cuerpo = procesar_figuras(md.convert(texto))
    pagina = (f"<!doctype html><html lang='es'><head><meta charset='utf-8'><style>{CSS}</style></head>"
              f"<body>{portada()}{cuerpo}</body></html>")
    with tempfile.NamedTemporaryFile("w", suffix=".html", delete=False, encoding="utf-8", dir=AQUI) as f:
        f.write(pagina)
    try:
        subprocess.run([NAVEGADOR, "--headless=new", "--disable-gpu", "--no-pdf-header-footer",
                        f"--print-to-pdf={OUT}", "file:///" + f.name.replace("\\", "/")],
                       check=True, capture_output=True, timeout=240)
    finally:
        os.unlink(f.name)
    print("PDF:", OUT, os.path.getsize(OUT) // 1024, "KB")


if __name__ == "__main__":
    main()
