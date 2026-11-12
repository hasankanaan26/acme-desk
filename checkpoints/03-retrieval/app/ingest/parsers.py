# ============================================================
# Parsers — one function per file format
# ============================================================
# Checkpoint 4's loader turned every file into one flat string and
# skipped anything that wasn't .md/.txt/.csv/.pdf/.json. Two problems:
#   1. .docx, .xlsx, .html and .eml were silently ignored.
#   2. Flattening threw away the structure (headings, sheets, the
#      subject line) that tells retrieval what a passage is about.
#
# Each parser here returns SECTIONS: a heading plus its text. The
# chunker keeps them apart, and every chunk carries its heading.
#
# Only the standard library and pypdf. No new installs:
#   .docx and .xlsx are ZIP files full of XML, so zipfile + xml do it.
#
# THE LESSON IN parse_pdf:
#   A "scanned" PDF is a picture of text. pypdf returns an empty
#   string and Checkpoint 4 embedded that empty string, happily. Here
#   we DETECT it and quarantine the file (needs_ocr=True) instead of
#   indexing nothing. OCR options: Tesseract (free), Azure Document
#   Intelligence or AWS Textract (managed), or a vision model.
#
# Bump PARSER_VERSION when a parser changes: it is part of every
# document's content hash, so the next sync re-parses everything.
# ============================================================

import csv
import email
import email.policy
import io
import re
import zipfile
import xml.etree.ElementTree as ET
from dataclasses import dataclass, field
from html.parser import HTMLParser
from pathlib import Path

PARSER_VERSION = "1"

# A PDF with fewer characters than this across all pages has no real text
# layer: it is a scan.
MIN_PDF_TEXT_CHARS = 50


@dataclass
class Section:
    heading: str
    text: str


@dataclass
class Parsed:
    sections: list[Section] = field(default_factory=list)
    parser: str = ""
    needs_ocr: bool = False
    note: str = ""

    @property
    def text_chars(self) -> int:
        return sum(len(s.text) for s in self.sections)


# Purpose:
# Pick the parser from the file extension. Unknown formats are reported,
# never guessed at.
def parse(path: str, data: bytes) -> Parsed:
    ext = Path(path).suffix.lower()
    parser = PARSERS.get(ext)
    if parser is None:
        return Parsed(parser="none", note=f"no parser for {ext} files")
    result = parser(data)
    result.sections = [s for s in result.sections if s.text.strip()]
    return result


def _clean(text: str) -> str:
    """Collapse runs of spaces, keep line breaks, trim."""
    lines = [re.sub(r"[ \t]+", " ", line).strip() for line in text.splitlines()]
    return re.sub(r"\n{3,}", "\n\n", "\n".join(lines)).strip()


# ---- Markdown / text ----

# Purpose:
# Split on ## and ### headings. The # title is the document's own title,
# so text right under it becomes an "Overview" section.
def parse_markdown(data: bytes) -> Parsed:
    text = data.decode("utf-8", errors="replace")
    sections: list[Section] = []
    h2 = ""
    heading = "Overview"
    buffer: list[str] = []

    def flush():
        body = _clean("\n".join(buffer))
        if body:
            sections.append(Section(heading=heading, text=body))
        buffer.clear()

    for line in text.splitlines():
        match = re.match(r"^(#{1,3})\s+(.*)$", line)
        if match:
            flush()
            level, title = len(match.group(1)), match.group(2).strip()
            if level == 1:
                heading = "Overview"
            elif level == 2:
                h2 = title
                heading = title
            else:
                heading = f"{h2} > {title}" if h2 else title
        else:
            buffer.append(line)
    flush()
    return Parsed(sections=sections, parser="markdown")


def parse_text(data: bytes) -> Parsed:
    return Parsed(sections=[Section("Text", _clean(data.decode("utf-8", errors="replace")))], parser="text")


# ---- CSV: one section per row ----

# Purpose:
# A row is a record (one person, one product). Keep it whole, labelled
# with its column names, so "who is the DevOps engineer?" finds one row.
def parse_csv(data: bytes) -> Parsed:
    reader = csv.DictReader(io.StringIO(data.decode("utf-8-sig", errors="replace")))
    sections = []
    for row in reader:
        values = {k.strip(): (v or "").strip() for k, v in row.items() if k}
        first = next(iter(values.values()), "row")
        sections.append(Section(heading=first, text="; ".join(f"{k}: {v}" for k, v in values.items())))
    return Parsed(sections=sections, parser="csv")


# ---- PDF: text layer, or quarantine ----

def parse_pdf(data: bytes) -> Parsed:
    from pypdf import PdfReader

    reader = PdfReader(io.BytesIO(data))
    pages = [(n, _clean(page.extract_text() or "")) for n, page in enumerate(reader.pages, 1)]
    total = sum(len(t) for _, t in pages)
    if total < MIN_PDF_TEXT_CHARS:
        return Parsed(parser="pdf", needs_ocr=True,
                      note=f"{len(pages)} page(s), {total} characters of text: a scan. Queued for OCR, not indexed.")
    sections = [Section(heading=f"Page {n}", text=t) for n, t in pages if t]
    return Parsed(sections=sections, parser="pdf")


# ---- DOCX: paragraphs under their headings ----

W = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"


def parse_docx(data: bytes) -> Parsed:
    with zipfile.ZipFile(io.BytesIO(data)) as z:
        root = ET.fromstring(z.read("word/document.xml"))
    sections: list[Section] = []
    heading, buffer = "Overview", []

    def flush():
        body = _clean("\n".join(buffer))
        if body:
            sections.append(Section(heading=heading, text=body))
        buffer.clear()

    for p in root.iter(f"{W}p"):
        style_el = p.find(f"{W}pPr/{W}pStyle")
        style = style_el.get(f"{W}val", "") if style_el is not None else ""
        text = "".join(t.text or "" for t in p.iter(f"{W}t")).strip()
        if not text:
            continue
        if style == "Title" or style.startswith("Heading1"):
            flush()
            heading = "Overview"
        elif style.startswith("Heading"):
            flush()
            heading = text
        else:
            buffer.append(text)
    flush()
    return Parsed(sections=sections, parser="docx")


# ---- XLSX: one section per sheet, rows labelled by the header ----

S = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"
R = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}"
PR = "{http://schemas.openxmlformats.org/package/2006/relationships}"


def parse_xlsx(data: bytes) -> Parsed:
    with zipfile.ZipFile(io.BytesIO(data)) as z:
        names = set(z.namelist())
        shared = []
        if "xl/sharedStrings.xml" in names:
            for si in ET.fromstring(z.read("xl/sharedStrings.xml")).iter(f"{S}si"):
                shared.append("".join(t.text or "" for t in si.iter(f"{S}t")))
        rels = {r.get("Id"): r.get("Target") for r in ET.fromstring(z.read("xl/_rels/workbook.xml.rels")).iter(f"{PR}Relationship")}
        sections = []
        for sheet in ET.fromstring(z.read("xl/workbook.xml")).iter(f"{S}sheet"):
            target = rels[sheet.get(f"{R}id")].lstrip("/")
            target = target if target.startswith("xl/") else f"xl/{target}"
            rows = []
            for row in ET.fromstring(z.read(target)).iter(f"{S}row"):
                cells = []
                for c in row.iter(f"{S}c"):
                    v = c.find(f"{S}v")
                    if c.get("t") == "s" and v is not None:
                        cells.append(shared[int(v.text)])
                    elif c.get("t") == "inlineStr":
                        cells.append("".join(t.text or "" for t in c.iter(f"{S}t")))
                    else:
                        cells.append(v.text if v is not None and v.text else "")
                if any(cells):
                    rows.append(cells)
            if not rows:
                continue
            header, body = rows[0], rows[1:]
            lines = ["; ".join(f"{h}: {v}" for h, v in zip(header, r)) for r in body]
            sections.append(Section(heading=f"Sheet: {sheet.get('name')}", text="\n".join(lines)))
    return Parsed(sections=sections, parser="xlsx")


# ---- HTML: the article, not the page ----

SKIP_TAGS = {"script", "style", "nav", "header", "footer", "aside", "form", "noscript", "button"}
SKIP_HINTS = ("cookie", "banner", "sidebar", "breadcrumb", "menu")
BLOCK_TAGS = {"p", "li", "td", "th", "pre", "blockquote", "dd", "dt"}


class _ArticleParser(HTMLParser):
    """Keeps headings and body text; drops navigation, banners, scripts."""

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.sections: list[Section] = []
        self.heading = "Overview"
        self.buffer: list[str] = []
        self._skip_tag: str | None = None
        self._skip_depth = 0
        self._in_heading: str | None = None
        self._heading_text: list[str] = []
        self._block: list[str] = []
        self._block_tag: str | None = None

    def _flush(self):
        body = _clean("\n".join(self.buffer))
        if body:
            self.sections.append(Section(self.heading, body))
        self.buffer = []

    def handle_starttag(self, tag, attrs):
        if self._skip_tag:
            if tag == self._skip_tag:
                self._skip_depth += 1
            return
        hints = " ".join(v or "" for k, v in attrs if k in ("class", "id")).lower()
        if tag in SKIP_TAGS or any(h in hints for h in SKIP_HINTS):
            self._skip_tag, self._skip_depth = tag, 1
            return
        if tag in ("h1", "h2", "h3"):
            self._in_heading, self._heading_text = tag, []
        elif tag in BLOCK_TAGS:
            self._block_tag, self._block = tag, []

    def handle_endtag(self, tag):
        if self._skip_tag:
            if tag == self._skip_tag:
                self._skip_depth -= 1
                if self._skip_depth == 0:
                    self._skip_tag = None
            return
        if tag == self._in_heading:
            title = " ".join("".join(self._heading_text).split())
            self._flush()
            self.heading = "Overview" if tag == "h1" else title
            self._in_heading = None
        elif tag == self._block_tag:
            text = " ".join("".join(self._block).split())
            if text:
                self.buffer.append(f"- {text}" if tag == "li" else text)
            self._block_tag = None

    def handle_data(self, data):
        if self._skip_tag:
            return
        if self._in_heading:
            self._heading_text.append(data)
        elif self._block_tag:
            self._block.append(data)

    def close(self):
        super().close()
        self._flush()


def parse_html(data: bytes) -> Parsed:
    parser = _ArticleParser()
    parser.feed(data.decode("utf-8", errors="replace"))
    parser.close()
    return Parsed(sections=parser.sections, parser="html")


# ---- Email: the body, labelled with the subject ----

def parse_eml(data: bytes) -> Parsed:
    msg = email.message_from_bytes(data, policy=email.policy.default)
    body_part = msg.get_body(preferencelist=("plain", "html"))
    body = body_part.get_content() if body_part is not None else ""
    if body_part is not None and body_part.get_content_type() == "text/html":
        body = "\n".join(s.text for s in parse_html(body.encode()).sections)
    attachments = [part.get_filename() for part in msg.iter_attachments() if part.get_filename()]
    header = f"From: {msg.get('From', '')}\nDate: {msg.get('Date', '')}"
    note = f"attachments not parsed: {', '.join(attachments)}" if attachments else ""
    subject = str(msg.get("Subject", "(no subject)"))
    return Parsed(sections=[Section(subject, _clean(f"{header}\n\n{body}"))], parser="eml", note=note)


PARSERS = {
    ".md": parse_markdown,
    ".txt": parse_text,
    ".csv": parse_csv,
    ".pdf": parse_pdf,
    ".docx": parse_docx,
    ".xlsx": parse_xlsx,
    ".html": parse_html,
    ".htm": parse_html,
    ".eml": parse_eml,
}
