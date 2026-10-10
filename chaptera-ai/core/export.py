"""Export manuscript to TXT and DOCX."""

import base64
import io
import re
from pathlib import Path

from docx import Document
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Inches, Mm, Pt


IMAGE_MARKER_RE = re.compile(
    r"\[\[IMAGE:(quarter|half|full)(?::(\d+):(-?\d+(?:\.\d+)?):(-?\d+(?:\.\d+)?))?\]\]([\s\S]*?)\[\[/IMAGE\]\]"
)
IMAGE_WIDTHS = {
    "quarter": 0.25,
    "half": 0.5,
    "full": 1.0,
}


def manuscript_has_page_numbers(text: str) -> bool:
    import re

    page_num_re = re.compile(r"^\s*(?:page\s*)?\d{1,4}\s*$|^\s*[-]\s*\d{1,4}\s*[-]\s*$", re.I)
    count = 0
    for line in (text or "").splitlines():
        if page_num_re.match(line.strip()):
            count += 1
    return count >= 2 or (count >= 1 and "\f" in (text or ""))


def _docx_font_name(font_name: str) -> str:
    first = (font_name or "Times New Roman").split(",")[0].strip()
    return first.strip("'\"") or "Times New Roman"


def _set_run_font(run, font_name: str, font_size: int | None = None) -> None:
    font_name = _docx_font_name(font_name)
    run.font.name = font_name
    if font_size is not None:
        run.font.size = Pt(font_size)
    rpr = run._element.get_or_add_rPr()
    rfonts = rpr.rFonts
    if rfonts is None:
        rfonts = OxmlElement("w:rFonts")
        rpr.append(rfonts)
    for attr in ("ascii", "hAnsi", "eastAsia", "cs"):
        rfonts.set(qn(f"w:{attr}"), font_name)


def build_txt_content(title: str, author: str, chapter: str, body: str) -> str:
    parts = []
    if title.strip():
        parts.append(title.strip())
        parts.append("")
    if author.strip():
        parts.append(f"By {author.strip()}")
        parts.append("")
    if chapter.strip():
        parts.append(chapter.strip())
        parts.append("")
    parts.append(_plain_export_text(body or ""))
    return "\n".join(parts).strip() + "\n"


def _pdf_escape(text: str) -> str:
    return (text or "").replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")


def _pdf_font_name(font_name: str) -> str:
    low = (font_name or "").lower()
    if "courier" in low or "mono" in low:
        return "Courier"
    if "arial" in low or "helvetica" in low or "sans" in low:
        return "Helvetica"
    return "Times-Roman"


def _pdf_page_points(value: float, unit: str) -> float:
    return float(value) * (72.0 if (unit or "mm").lower() == "in" else 72.0 / 25.4)


def _wrap_pdf_line(line: str, max_chars: int) -> list[str]:
    words = line.split()
    if not words:
        return [""]
    lines: list[str] = []
    current = ""
    for word in words:
        candidate = f"{current} {word}".strip()
        if len(candidate) <= max_chars:
            current = candidate
        else:
            if current:
                lines.append(current)
            current = word
    if current:
        lines.append(current)
    return lines


def build_pdf_bytes(
    title: str,
    author: str,
    chapter: str,
    body: str,
    font_name: str = "Times New Roman",
    font_size: int = 11,
    line_height: float = 1.25,
    margin: float = 20,
    page_width: float = 148,
    page_height: float = 210,
    page_unit: str = "mm",
) -> bytes:
    width = max(144.0, _pdf_page_points(page_width, page_unit))
    height = max(144.0, _pdf_page_points(page_height, page_unit))
    margin_pt = max(18.0, _pdf_page_points(margin, "mm" if margin > 3 else "in"))
    font = _pdf_font_name(font_name)
    size = max(7, min(24, int(font_size or 11)))
    leading = max(size + 2, size * max(1.0, min(2.5, float(line_height or 1.25))))
    usable_w = max(72.0, width - margin_pt * 2)
    usable_h = max(72.0, height - margin_pt * 2)
    max_chars = max(20, int(usable_w / max(3.2, size * 0.48)))

    raw_parts: list[str] = []
    if title.strip():
        raw_parts.extend([title.strip(), ""])
    if author.strip():
        raw_parts.extend([f"By {author.strip()}", ""])
    if chapter.strip():
        raw_parts.extend([chapter.strip(), ""])
    raw_parts.extend(_plain_export_text(body or "").replace("\f", "\n\n[[PAGE_BREAK]]\n\n").splitlines())

    pages: list[list[str]] = [[]]
    lines_per_page = max(1, int(usable_h / leading))
    for raw_line in raw_parts:
        if raw_line.strip() == "[[PAGE_BREAK]]":
            if pages[-1]:
                pages.append([])
            continue
        wrapped = _wrap_pdf_line(raw_line, max_chars) if raw_line.strip() else [""]
        for line in wrapped:
            if len(pages[-1]) >= lines_per_page:
                pages.append([])
            pages[-1].append(line)
    if not pages[-1]:
        pages[-1].append("")

    objects: list[bytes] = []

    def add_obj(content: bytes) -> int:
        objects.append(content)
        return len(objects)

    catalog_id = add_obj(b"<< /Type /Catalog /Pages 2 0 R >>")
    pages_id = add_obj(b"")
    font_id = add_obj(f"<< /Type /Font /Subtype /Type1 /BaseFont /{font} >>".encode("ascii"))
    page_ids: list[int] = []
    for page_no, page_lines in enumerate(pages, 1):
        y = height - margin_pt
        commands = [f"BT /F1 {size} Tf {leading:.2f} TL {margin_pt:.2f} {y:.2f} Td"]
        for idx, line in enumerate(page_lines):
            if idx:
                commands.append("T*")
            commands.append(f"({_pdf_escape(line)}) Tj")
        commands.append("ET")
        if not manuscript_has_page_numbers(body):
            commands.append(
                f"BT /F1 {max(7, size - 2)} Tf {width / 2 - 12:.2f} {margin_pt / 2:.2f} Td (- {page_no} -) Tj ET"
            )
        stream = "\n".join(commands).encode("latin-1", errors="replace")
        content_id = add_obj(b"<< /Length " + str(len(stream)).encode("ascii") + b" >>\nstream\n" + stream + b"\nendstream")
        page_id = add_obj(
            f"<< /Type /Page /Parent {pages_id} 0 R /MediaBox [0 0 {width:.2f} {height:.2f}] "
            f"/Resources << /Font << /F1 {font_id} 0 R >> >> /Contents {content_id} 0 R >>"
            .encode("ascii")
        )
        page_ids.append(page_id)

    objects[pages_id - 1] = (
        f"<< /Type /Pages /Kids [{' '.join(f'{pid} 0 R' for pid in page_ids)}] /Count {len(page_ids)} >>"
        .encode("ascii")
    )
    objects[catalog_id - 1] = b"<< /Type /Catalog /Pages 2 0 R >>"

    out = bytearray(b"%PDF-1.4\n%\xe2\xe3\xcf\xd3\n")
    offsets = [0]
    for idx, obj in enumerate(objects, 1):
        offsets.append(len(out))
        out.extend(f"{idx} 0 obj\n".encode("ascii"))
        out.extend(obj)
        out.extend(b"\nendobj\n")
    xref = len(out)
    out.extend(f"xref\n0 {len(objects) + 1}\n0000000000 65535 f \n".encode("ascii"))
    for offset in offsets[1:]:
        out.extend(f"{offset:010d} 00000 n \n".encode("ascii"))
    out.extend(
        f"trailer\n<< /Size {len(objects) + 1} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF\n".encode("ascii")
    )
    return bytes(out)


def _plain_export_text(text: str) -> str:
    return IMAGE_MARKER_RE.sub("[Image]", text or "").replace("**", "")


def _iter_text_and_images(text: str):
    pos = 0
    for match in IMAGE_MARKER_RE.finditer(text or ""):
        before = (text or "")[pos:match.start()]
        if before:
            yield {"type": "text", "text": before}
        yield {
            "type": "image",
            "size": match.group(1),
            "data": (match.group(5) or "").strip(),
        }
        pos = match.end()
    tail = (text or "")[pos:]
    if tail:
        yield {"type": "text", "text": tail}


def _image_bytes(data_url: str):
    if not data_url.startswith("data:image/") or "," not in data_url:
        return None
    try:
        return io.BytesIO(base64.b64decode(data_url.split(",", 1)[1]))
    except Exception:
        return None


def _iter_bold_segments(text: str):
    parts = (text or "").split("**")
    for idx, part in enumerate(parts):
        if part:
            yield part, idx % 2 == 1


def _docx_alignment(value: str):
    value = (value or "justify").lower()
    return {
        "center": WD_ALIGN_PARAGRAPH.CENTER,
        "right": WD_ALIGN_PARAGRAPH.RIGHT,
        "left": WD_ALIGN_PARAGRAPH.LEFT,
        "justify": WD_ALIGN_PARAGRAPH.JUSTIFY,
    }.get(value, WD_ALIGN_PARAGRAPH.JUSTIFY)


def _add_formatted_runs(paragraph, text: str, font_name: str, font_size: int) -> None:
    font_name = _docx_font_name(font_name)
    for segment, bold in _iter_bold_segments(text):
        run = paragraph.add_run(segment)
        run.bold = bold
        _set_run_font(run, font_name, font_size)


def _add_page_number_header(section, font_name: str, font_size: int) -> None:
    paragraph = section.header.paragraphs[0]
    paragraph.clear()
    paragraph.alignment = WD_ALIGN_PARAGRAPH.CENTER
    run = paragraph.add_run()
    _set_run_font(run, font_name, font_size)

    run.add_text("- ")
    fld_begin = OxmlElement("w:fldChar")
    fld_begin.set(qn("w:fldCharType"), "begin")
    instr = OxmlElement("w:instrText")
    instr.set(qn("xml:space"), "preserve")
    instr.text = " PAGE "
    fld_end = OxmlElement("w:fldChar")
    fld_end.set(qn("w:fldCharType"), "end")
    run._r.extend([fld_begin, instr, fld_end])
    run.add_text(" -")


def build_docx_bytes(
    title: str,
    author: str,
    chapter: str,
    body: str,
    font_name: str = "Times New Roman",
    font_size: int = 11,
    line_height: float = 1.25,
    text_align: str = "justify",
    margin: float = 20,
    page_width: float = 148,
    page_height: float = 210,
    page_unit: str = "mm",
) -> bytes:
    font_name = _docx_font_name(font_name)
    doc = Document()
    section = doc.sections[0]
    if (page_unit or "mm").lower() == "in":
        section.page_width = Inches(page_width)
        section.page_height = Inches(page_height)
        margin_len = Inches(margin / 25.4 if margin > 3 else margin)
    else:
        section.page_width = Mm(page_width)
        section.page_height = Mm(page_height)
        margin_len = Mm(margin)
    section.top_margin = margin_len
    section.bottom_margin = margin_len
    section.left_margin = margin_len
    section.right_margin = margin_len
    content_width_in = max(1.0, (section.page_width - section.left_margin - section.right_margin) / 914400)

    style = doc.styles["Normal"]
    style.font.name = font_name
    style.font.size = Pt(font_size)
    rpr = style._element.get_or_add_rPr()
    rfonts = rpr.rFonts
    if rfonts is None:
        rfonts = OxmlElement("w:rFonts")
        rpr.append(rfonts)
    for attr in ("ascii", "hAnsi", "eastAsia", "cs"):
        rfonts.set(qn(f"w:{attr}"), font_name)
    style.paragraph_format.line_spacing = max(0.5, min(4.0, line_height))
    add_page_numbers = not manuscript_has_page_numbers(body)
    if add_page_numbers:
        _add_page_number_header(section, font_name, font_size)

    if title.strip():
        p = doc.add_paragraph()
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        run = p.add_run(title.strip())
        run.bold = True
        _set_run_font(run, font_name, font_size + 6)

    if author.strip():
        p = doc.add_paragraph()
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        run = p.add_run(author.strip())
        _set_run_font(run, font_name, font_size)

    if chapter.strip():
        doc.add_paragraph()
        p = doc.add_paragraph()
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        run = p.add_run(chapter.strip())
        run.bold = True
        _set_run_font(run, font_name, font_size + 4)
        doc.add_paragraph()

    sections = (body or "").split("\f")
    for sec_idx, section_text in enumerate(sections):
        if sec_idx > 0:
            doc.add_page_break()
        for item in _iter_text_and_images(section_text):
            if item["type"] == "image":
                image_stream = _image_bytes(item["data"])
                if image_stream:
                    para = doc.add_paragraph()
                    para.alignment = WD_ALIGN_PARAGRAPH.CENTER
                    run = para.add_run()
                    width_in = max(0.8, min(content_width_in, content_width_in * IMAGE_WIDTHS.get(item["size"], 1.0)))
                    run.add_picture(image_stream, width=Inches(width_in))
                continue
            for block in item["text"].split("\n\n"):
                block = block.strip()
                if not block:
                    continue
                for line in block.split("\n"):
                    line = line.strip()
                    if line:
                        para = doc.add_paragraph()
                        para.alignment = _docx_alignment(text_align)
                        para.paragraph_format.line_spacing = max(0.5, min(4.0, line_height))
                        _add_formatted_runs(para, line, font_name, font_size)

    buf = io.BytesIO()
    doc.save(buf)
    buf.seek(0)
    return buf.getvalue()
