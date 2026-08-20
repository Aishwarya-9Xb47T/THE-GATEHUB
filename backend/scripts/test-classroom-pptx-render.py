#!/usr/bin/env python3
"""Fail-loud PPTX document-render diagnostic.

Usage:
  python backend/scripts/test-classroom-pptx-render.py "Unit-2 Discussion.pptx"

Inspects the original PPTX (especially slide 2 math/OMML), optionally converts
with LibreOffice if soffice is on PATH, and rasterizes PDF page 2.
"""
from __future__ import annotations

import os
import re
import shutil
import subprocess
import sys
import tempfile
import zipfile
from pathlib import Path


def fail(message: str) -> None:
    print(f"[PPTX_DIAGNOSTIC] FAIL {message}", file=sys.stderr)
    raise SystemExit(1)


def count(xml: str, pattern: str) -> int:
    return len(re.findall(pattern, xml, flags=re.I))


def inspect_pptx(path: Path) -> dict:
    if not path.is_file():
        fail(f"missing file {path}")
    data = path.read_bytes()
    if data[:2] != b"PK":
        fail("file is not a ZIP/PPTX")
    with zipfile.ZipFile(path) as zf:
        names = zf.namelist()
        slides = sorted(
            [name for name in names if re.match(r"ppt/slides/slide\d+\.xml$", name, re.I)],
            key=lambda name: int(re.search(r"slide(\d+)", name, re.I).group(1)),
        )
        report = {
            "originalBytes": len(data),
            "zipValid": True,
            "hasContentTypes": "[Content_Types].xml" in names,
            "hasPresentationXml": "ppt/presentation.xml" in names,
            "slideCount": len(slides),
            "media": sum(1 for name in names if name.startswith("ppt/media/")),
            "embeddings": sum(1 for name in names if name.startswith("ppt/embeddings/")),
            "slides": [],
            "slide2XmlExcerpt": None,
        }
        for name in slides:
            xml = zf.read(name).decode("utf-8", errors="replace")
            slide_no = int(re.search(r"slide(\d+)", name, re.I).group(1))
            report["slides"].append(
                {
                    "slide": slide_no,
                    "oMath": count(xml, r"<m:oMath[\s>]"),
                    "oMathPara": count(xml, r"<m:oMathPara[\s>]"),
                    "a14m": count(xml, r"<a14:m[\s>]"),
                    "alternateContent": count(xml, r"<mc:AlternateContent[\s>]"),
                    "groups": count(xml, r"<p:grpSp[\s>]"),
                    "pictures": count(xml, r"<p:pic[\s>]"),
                    "tables": count(xml, r"<a:tbl[\s>]"),
                    "graphicFrames": count(xml, r"<p:graphicFrame[\s>]"),
                    "hasChannel1": "Channel 1" in xml,
                    "hasStep1": "Step 1" in xml,
                }
            )
            if slide_no == 2:
                tags = re.findall(
                    r"<(?:a14:m|m:oMathPara|m:oMath|mc:AlternateContent|p:graphicFrame|p:grpSp)[\s>]",
                    xml,
                    flags=re.I,
                )
                report["slide2XmlExcerpt"] = {
                    "bytes": len(xml.encode("utf-8")),
                    "openingTags": tags[:40],
                    "hasMatrixMarkers": bool(re.search(r"<m:m[\s>]|<m:d[\s>]", xml, re.I)),
                }
        return report


def which(name: str) -> str | None:
    return shutil.which(name)


def main() -> None:
    if len(sys.argv) < 2:
        fail('usage: python backend/scripts/test-classroom-pptx-render.py "Unit-2 Discussion.pptx"')
    pptx = Path(sys.argv[1]).resolve()
    report = inspect_pptx(pptx)
    print("[PPTX_DIAGNOSTIC]", report)
    if report["slideCount"] < 1:
        fail("no slides")
    slide2 = next((item for item in report["slides"] if item["slide"] == 2), None)
    print("[PPTX_DIAGNOSTIC] slide2.xml", slide2)
    if slide2:
        mathish = slide2["oMath"] + slide2["oMathPara"] + slide2["a14m"] + slide2["tables"]
        if mathish == 0 and not slide2["hasStep1"]:
            print("[PPTX_DIAGNOSTIC] WARN slide 2 has no OMML/table/step markers in XML")

    soffice = which("soffice") or ("/usr/bin/soffice" if os.path.exists("/usr/bin/soffice") else None)
    pdftoppm = which("pdftoppm") or ("/usr/bin/pdftoppm" if os.path.exists("/usr/bin/pdftoppm") else None)
    pdfinfo = which("pdfinfo") or ("/usr/bin/pdfinfo" if os.path.exists("/usr/bin/pdfinfo") else None)
    if not soffice:
        fail("LibreOffice soffice not on PATH; XML inspect completed")
    work = Path(tempfile.mkdtemp(prefix="classroom-pptx-diag-"))
    try:
        profile = work / "profile"
        out = work / "out"
        profile.mkdir()
        out.mkdir()
        cmd = [
            soffice,
            f"-env:UserInstallation=file://{profile.as_posix()}",
            "--headless",
            "--norestore",
            "--nolockcheck",
            "--convert-to",
            "pdf:impress_pdf_Export",
            "--outdir",
            str(out),
            str(pptx),
        ]
        print("[CLASSROOM_PPTX] libreoffice_start", " ".join(cmd))
        env = os.environ.copy()
        env.setdefault("HOME", str(work))
        completed = subprocess.run(cmd, cwd=work, env=env, capture_output=True, text=True, timeout=180)
        print("[CLASSROOM_PPTX] libreoffice_exitCode=", completed.returncode)
        pdfs = list(out.glob("*.pdf"))
        if completed.returncode != 0 or not pdfs:
            fail(f"LibreOffice produced no PDF stderr={completed.stderr[-800:]}")
        pdf = pdfs[0]
        pdf_bytes = pdf.stat().st_size
        pages = 0
        if pdfinfo:
            info = subprocess.run([pdfinfo, str(pdf)], capture_output=True, text=True, timeout=15)
            match = re.search(r"Pages:\s+(\d+)", info.stdout + info.stderr)
            pages = int(match.group(1)) if match else 0
        print("[CLASSROOM_PPTX]", {"pdfPath": str(pdf), "pdfBytes": pdf_bytes, "pdfPages": pages})
        if pages and pages != report["slideCount"]:
            print(f"[PPTX_DIAGNOSTIC] WARN pdfPages={pages} pptxSlides={report['slideCount']}")
        if not pdftoppm:
            fail("pdftoppm missing after PDF conversion")
        page2 = work / "page2"
        subprocess.run(
            [pdftoppm, "-png", "-f", "2", "-l", "2", "-r", "144", str(pdf), str(page2)],
            check=False,
            timeout=45,
        )
        pngs = list(work.glob("page2*.png"))
        if not pngs:
            fail("page 2 PNG was not created")
        png = pngs[0]
        print("[PPTX_DIAGNOSTIC]", {"slide2Png": str(png), "pngBytes": png.stat().st_size})
        if png.stat().st_size < 8000:
            fail("page 2 PNG is too small")
        print("[PPTX_DIAGNOSTIC] PASS xml inspect + PDF page 2 raster completed")
        print("[PPTX_DIAGNOSTIC] Inspect the PNG visually for matrices/equations")
        keep = Path(sys.argv[2]).resolve() if len(sys.argv) > 2 else pptx.parent / f"{pptx.stem}.classroom-render-diag"
        keep.mkdir(parents=True, exist_ok=True)
        shutil.copy2(pdf, keep / "output.pdf")
        shutil.copy2(png, keep / "slide-02.png")
        (keep / "report.txt").write_text(
            f"originalBytes={report['originalBytes']}\nslideCount={report['slideCount']}\npdfBytes={pdf_bytes}\npdfPages={pages}\npngBytes={png.stat().st_size}\nslide2={slide2}\n",
            encoding="utf-8",
        )
        print("[PPTX_DIAGNOSTIC] saved", str(keep))
    finally:
        shutil.rmtree(work, ignore_errors=True)


if __name__ == "__main__":
    main()
