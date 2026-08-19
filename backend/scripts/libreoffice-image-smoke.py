#!/usr/bin/env python3
"""Prove the production container can convert a real 11-slide PPTX with LibreOffice.

This runs at Docker image build time so a javaldx/Java/profile failure cannot ship.
"""
from __future__ import annotations

import os
import shutil
import subprocess
import sys
import tempfile
import zipfile
from pathlib import Path
from xml.sax.saxutils import escape

REQUIRED = [
    "Numerical example of 3D convolution",
    "Case 1: 3D Input Tensor with 2 Channels",
    "Given Input",
    "Channel 1",
    "Channel 2",
    "Filter",
    "Stride",
    "no padding",
    "Output size",
    "0.1",
    "1.0",
    "Numerical example on CNN",
    "Y = X",
    "W + b",
]


def which(name: str) -> str | None:
    return shutil.which(name)


def run(cmd: list[str], env: dict[str, str], cwd: str, timeout: int = 120) -> subprocess.CompletedProcess[str]:
    print("[CLASSROOM_RENDER] command=", " ".join(cmd), flush=True)
    return subprocess.run(
        cmd,
        cwd=cwd,
        env=env,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        timeout=timeout,
        check=False,
    )


def text_shape(shape_id: int, x: int, y: int, cx: int, cy: int, text: str, size: int = 1400, bold: bool = False) -> str:
    return f"""<p:sp>
      <p:nvSpPr><p:cNvPr id="{shape_id}" name="Shape {shape_id}"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr>
      <p:spPr><a:xfrm><a:off x="{x}" y="{y}"/><a:ext cx="{cx}" cy="{cy}"/></a:xfrm>
        <a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr>
      <p:txBody><a:bodyPr wrap="square"/><a:lstStyle/>
        <a:p><a:r><a:rPr lang="en-US" sz="{size}" b="{1 if bold else 0}"/><a:t>{escape(text)}</a:t></a:r></a:p>
      </p:txBody>
    </p:sp>"""


def table_frame(shape_id: int, x: int, y: int, col_w: int, row_h: int, rows: list[list[str]]) -> str:
    cols = len(rows[0])
    grid = "".join(f'<a:gridCol w="{col_w}"/>' for _ in range(cols))
    body = []
    for row in rows:
        cells = []
        for cell in row:
            cells.append(
                f"""<a:tc><a:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr lang="en-US" sz="1200"/><a:t>{escape(cell)}</a:t></a:r></a:p></a:txBody>
                <a:tcPr>
                  <a:lnL w="12700"><a:solidFill><a:srgbClr val="111827"/></a:solidFill></a:lnL>
                  <a:lnR w="12700"><a:solidFill><a:srgbClr val="111827"/></a:solidFill></a:lnR>
                  <a:lnT w="12700"><a:solidFill><a:srgbClr val="111827"/></a:solidFill></a:lnT>
                  <a:lnB w="12700"><a:solidFill><a:srgbClr val="111827"/></a:solidFill></a:lnB>
                </a:tcPr></a:tc>"""
            )
        body.append(f'<a:tr h="{row_h}">{"".join(cells)}</a:tr>')
    return f"""<p:graphicFrame>
      <p:nvGraphicFramePr><p:cNvPr id="{shape_id}" name="Table {shape_id}"/>
        <p:cNvGraphicFramePr><a:graphicFrameLocks noGrp="1"/></p:cNvGraphicFramePr><p:nvPr/></p:nvGraphicFramePr>
      <p:xfrm><a:off x="{x}" y="{y}"/><a:ext cx="{col_w * cols}" cy="{row_h * len(rows)}"/></p:xfrm>
      <a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/table">
        <a:tbl><a:tblGrid>{grid}</a:tblGrid>{"".join(body)}</a:tbl>
      </a:graphicData></a:graphic>
    </p:graphicFrame>"""


def slide_xml(index: int) -> str:
    channel1 = [["1.0", "2.0", "3.0"], ["4.0", "5.0", "6.0"], ["7.0", "8.0", "9.0"]]
    channel2 = [["0.1", "0.2", "0.3"], ["0.4", "0.5", "0.6"], ["0.7", "0.8", "0.9"]]
    filt = [["1", "0"], ["0", "-1"]]
    tree = [
        '<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>',
        '<p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>',
    ]
    if index == 0:
        tree += [
            text_shape(2, 274320, 137160, 8597900, 548640, "Numerical example of 3D convolution", 2800, True),
            text_shape(3, 274320, 731520, 8597900, 365760, "Case 1: 3D Input Tensor with 2 Channels", 1800, True),
            text_shape(4, 274320, 1097280, 4000000, 274320, "Given Input", 1600, True),
            text_shape(5, 274320, 1371600, 4000000, 228600, "Channel 1", 1400, True),
            table_frame(6, 274320, 1600200, 914400, 320040, channel1),
            text_shape(7, 4572000, 1371600, 4000000, 228600, "Channel 2", 1400, True),
            table_frame(8, 4572000, 1600200, 914400, 320040, channel2),
            text_shape(9, 274320, 2651760, 2000000, 228600, "Filter", 1400, True),
            table_frame(10, 274320, 2880360, 914400, 320040, filt),
            text_shape(11, 274320, 3657600, 8229600, 274320, "Stride = 1, no padding, Output size = (3-2)/1+1 = 2 x 2"),
        ]
    elif index < 5:
        tree += [
            text_shape(2, 274320, 137160, 8597900, 548640, "Numerical example of 3D convolution", 2800, True),
            text_shape(3, 274320, 822960, 8597900, 365760, f"Step {index + 1}: 3D convolution numerical work", 1800, True),
            text_shape(4, 274320, 1280160, 8229600, 457200, "Channel 1 output uses 1.0 2.0 3.0 4.0 5.0 6.0 7.0 8.0 9.0"),
            text_shape(5, 274320, 1828800, 8229600, 457200, "Channel 2 output uses 0.1 0.2 0.3 and filter weights"),
        ]
    else:
        tree += [
            text_shape(2, 274320, 137160, 8597900, 548640, "Numerical example on CNN", 2800, True),
            text_shape(3, 274320, 822960, 8597900, 365760, f"CNN numerical example slide {index + 1}", 1800, True),
            text_shape(4, 274320, 1280160, 8229600, 457200, "Y = X * W + b", 1800, True),
            text_shape(5, 274320, 1828800, 8229600, 457200, "Output size = (n - f) / s + 1"),
        ]
    return f"""<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld><p:spTree>{"".join(tree)}</p:spTree></p:cSld>
  <p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr>
</p:sld>"""


def write_pptx(path: Path, slide_count: int = 11) -> None:
    overrides = "\n  ".join(
        f'<Override PartName="/ppt/slides/slide{i}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>'
        for i in range(1, slide_count + 1)
    )
    rels = "\n  ".join(
        f'<Relationship Id="rId{i}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide{i}.xml"/>'
        for i in range(1, slide_count + 1)
    )
    sld_ids = "\n    ".join(f'<p:sldId id="{255 + i}" r:id="rId{i}"/>' for i in range(1, slide_count + 1))
    with zipfile.ZipFile(path, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        zf.writestr(
            "[Content_Types].xml",
            f"""<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>
  {overrides}
</Types>""",
        )
        zf.writestr(
            "_rels/.rels",
            """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/>
</Relationships>""",
        )
        zf.writestr(
            "ppt/presentation.xml",
            f"""<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:presentation xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:sldIdLst>
    {sld_ids}
  </p:sldIdLst>
  <p:sldSz cx="9144000" cy="5143500"/>
  <p:notesSz cx="6858000" cy="9144000"/>
</p:presentation>""",
        )
        zf.writestr(
            "ppt/_rels/presentation.xml.rels",
            f"""<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  {rels}
</Relationships>""",
        )
        for i in range(slide_count):
            zf.writestr(f"ppt/slides/slide{i + 1}.xml", slide_xml(i))


def main() -> int:
    soffice = which("soffice") or ("/usr/lib/libreoffice/program/soffice" if Path("/usr/lib/libreoffice/program/soffice").exists() else None)
    if not soffice:
        print("LIBREOFFICE_UNAVAILABLE soffice is not installed", file=sys.stderr)
        return 1
    pdfinfo = which("pdfinfo")
    pdftotext = which("pdftotext")
    pdftoppm = which("pdftoppm")
    if not pdfinfo or not pdftotext or not pdftoppm:
        print("PDF_RENDER_FAILED poppler-utils is incomplete", file=sys.stderr)
        return 1

    work = Path(tempfile.mkdtemp(prefix="classroom-lo-smoke-"))
    profile = work / "profile"
    output = work / "output"
    (profile / "user").mkdir(parents=True)
    output.mkdir(parents=True)
    (profile / "user" / "registrymodifications.xcu").write_text(
        """<?xml version="1.0" encoding="UTF-8"?>
<oor:items xmlns:oor="http://openoffice.org/2001/registry" xmlns:xs="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <item oor:path="/org.openoffice.Office.Common/Misc"><prop oor:name="UseJava" oor:op="fuse"><value>false</value></prop></item>
</oor:items>
""",
        encoding="utf-8",
    )
    pptx = work / "source.pptx"
    write_pptx(pptx)

    env = os.environ.copy()
    env.update(
        {
            "HOME": "/tmp",
            "TMPDIR": str(work),
            "TEMP": str(work),
            "TMP": str(work),
            "SAL_DISABLE_JAVA": "1",
            "SAL_DISABLE_OPENCL": "1",
            "LANG": env.get("LANG") or "C.UTF-8",
            "LC_ALL": env.get("LC_ALL") or "C.UTF-8",
        }
    )
    lo_program = "/usr/lib/libreoffice/program"
    if Path(lo_program).is_dir():
        env["LD_LIBRARY_PATH"] = lo_program + ((":" + env["LD_LIBRARY_PATH"]) if env.get("LD_LIBRARY_PATH") else "")

    print("[CLASSROOM_RENDER] executable=", soffice, flush=True)
    print("[CLASSROOM_RENDER] version=", flush=True)
    ver = run([soffice, f"-env:UserInstallation=file://{profile}", "--headless", "--version"], env, str(work), 30)
    sys.stdout.write(ver.stdout)
    sys.stderr.write(ver.stderr)
    print("[CLASSROOM_RENDER] java=", which("java") or "missing", flush=True)
    print("[CLASSROOM_RENDER] javaldx=", "/usr/lib/libreoffice/program/javaldx" if Path("/usr/lib/libreoffice/program/javaldx").exists() else "missing", flush=True)
    print("[CLASSROOM_RENDER] JAVA_HOME=", env.get("JAVA_HOME", "unset"), flush=True)
    print("[CLASSROOM_RENDER] HOME=", env["HOME"], flush=True)
    print("[CLASSROOM_RENDER] PATH=", env.get("PATH", ""), flush=True)

    convert = run(
        [
            soffice,
            f"-env:UserInstallation=file://{profile}",
            "--headless",
            "--norestore",
            "--nolockcheck",
            "--nodefault",
            "--nofirststartwizard",
            "--nologo",
            "--convert-to",
            "pdf",
            "--outdir",
            str(output),
            str(pptx),
        ],
        env,
        str(work),
        120,
    )
    sys.stdout.write(convert.stdout)
    sys.stderr.write(convert.stderr)
    pdf = output / "source.pdf"
    if convert.returncode != 0 and not pdf.exists():
        print(
            f"LIBREOFFICE_CONVERSION_FAILED exit={convert.returncode} stderr={convert.stderr[:800]}",
            file=sys.stderr,
        )
        return 1
    if not pdf.exists():
        print("LIBREOFFICE_CONVERSION_FAILED PDF was not created", file=sys.stderr)
        return 1

    info = run([pdfinfo, str(pdf)], env, str(work), 15)
    sys.stdout.write(info.stdout)
    pages_ok = any(
        line.strip().lower().startswith("pages:") and line.strip().split()[-1] == "11"
        for line in info.stdout.splitlines()
    )
    if not pages_ok:
        print("LIBREOFFICE_CONVERSION_FAILED expected 11 PDF pages", file=sys.stderr)
        print(info.stdout, file=sys.stderr)
        return 1

    text_file = output / "source.txt"
    run([pdftotext, "-layout", str(pdf), str(text_file)], env, str(work), 15)
    text = text_file.read_text(encoding="utf-8", errors="ignore")
    normalized = " ".join(text.split())
    missing = [item for item in REQUIRED if item not in normalized]
    if missing:
        print("LIBREOFFICE_CONVERSION_FAILED PDF missing:", ", ".join(missing), file=sys.stderr)
        print(normalized[:1500], file=sys.stderr)
        return 1

    for i in range(1, 12):
        prefix = output / f"slide-{i:03d}"
        png = run([pdftoppm, "-png", "-singlefile", "-r", "144", "-f", str(i), "-l", str(i), str(pdf), str(prefix)], env, str(work), 30)
        png_path = Path(str(prefix) + ".png")
        if png.returncode != 0 or not png_path.exists() or png_path.stat().st_size < 100:
            print(f"PDF_RENDER_FAILED page={i} exit={png.returncode}", file=sys.stderr)
            return 1

    print("[CLASSROOM_RENDER] stage=pptx-to-pdf status=success pdfPages=11", flush=True)
    print("[CLASSROOM_RENDER] stage=pdf-to-png status=success slides=11/11", flush=True)
    print("CLASSROOM LIBREOFFICE IMAGE SMOKE: PASS", flush=True)
    shutil.rmtree(work, ignore_errors=True)
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except subprocess.TimeoutExpired as exc:
        print(f"CLASSROOM_RENDER_TIMEOUT {exc}", file=sys.stderr)
        raise SystemExit(1)
