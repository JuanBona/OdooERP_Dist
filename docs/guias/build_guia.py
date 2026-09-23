"""Genera docs/guias/Guia_Sistema_Reparto.pdf a partir de MANUAL_USUARIO.md.

    python docs/guias/build_guia.py

Requiere `pip install markdown` y Google Chrome (variable CHROME para otra ruta).
"""
import os
import re
import subprocess
import sys
import tempfile
import unicodedata

import markdown

ROOT = os.path.join(os.path.dirname(__file__), "..", "..")
SRC = os.path.join(ROOT, "MANUAL_USUARIO.md")
OUT = os.path.abspath(os.path.join(os.path.dirname(__file__), "Guia_Sistema_Reparto.pdf"))
CHROME = os.environ.get("CHROME", r"C:\Program Files\Google\Chrome\Application\chrome.exe")

CSS = """
@page { size: A4; margin: 18mm 16mm; }
body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 10.5pt; line-height: 1.5; color: #222; }
h1 { color: #A81C21; font-size: 24pt; margin: 0 0 4pt; border-bottom: 3px solid #A81C21; padding-bottom: 6pt; }
h2 { color: #A81C21; font-size: 15pt; margin: 22pt 0 6pt; border-bottom: 1px solid #ddd; padding-bottom: 3pt; break-after: avoid; }
h3 { color: #333; font-size: 12pt; margin: 14pt 0 4pt; break-after: avoid; }
p, li { orphans: 3; widows: 3; }
a { color: #A81C21; text-decoration: none; }
table { border-collapse: collapse; width: 100%; margin: 8pt 0; font-size: 9.5pt; break-inside: avoid; }
th { background: #A81C21; color: #fff; text-align: left; padding: 5pt 7pt; }
td { border: 1px solid #ddd; padding: 5pt 7pt; vertical-align: top; }
tr:nth-child(even) td { background: #faf5f5; }
blockquote { margin: 8pt 0; padding: 6pt 12pt; background: #fff6e5; border-left: 4px solid #e8a33d; break-inside: avoid; }
blockquote p { margin: 3pt 0; }
code { background: #f2f2f2; padding: 1pt 4pt; border-radius: 3px; font-size: 9.5pt; }
hr { border: 0; border-top: 1px solid #ddd; margin: 14pt 0; }
"""


def slugify(value, separator):
    value = re.sub(r"[^\w\s-]", "", unicodedata.normalize("NFC", value).lower())
    return re.sub(r"[\s]+", separator, value.strip())


md = markdown.Markdown(extensions=["tables", "sane_lists", "toc"],
                       extension_configs={"toc": {"slugify": slugify}})
html = md.convert(open(SRC, encoding="utf-8").read())
page = f"<!doctype html><html lang='es'><head><meta charset='utf-8'><style>{CSS}</style></head><body>{html}</body></html>"

with tempfile.NamedTemporaryFile("w", suffix=".html", delete=False, encoding="utf-8") as f:
    f.write(page)
subprocess.run([CHROME, "--headless=new", "--disable-gpu", "--no-pdf-header-footer",
                f"--print-to-pdf={OUT}", "file:///" + f.name.replace("\\", "/")],
               check=True, capture_output=True)
os.unlink(f.name)
print("PDF:", OUT, os.path.getsize(OUT), "bytes")
