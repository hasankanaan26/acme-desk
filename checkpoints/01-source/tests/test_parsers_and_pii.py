# Tests: one parser per format, and PII redaction. No index, no network.

from pathlib import Path

from app.ingest.parsers import parse
from app.ingest.pii import redact

SITES = Path(__file__).resolve().parents[3] / "shared" / "data" / "sites"


def test_markdown_splits_on_headings():
    md = b"# Title\nintro line\n## Travel\n- per diem $85\n### Hotels\n- $230 a night\n"
    parsed = parse("policy.md", md)
    assert [s.heading for s in parsed.sections] == ["Overview", "Travel", "Travel > Hotels"]
    assert "per diem $85" in parsed.sections[1].text


def test_csv_one_section_per_row_with_column_names():
    parsed = parse("people.csv", b"name,role\nAda,DevOps Engineer\nBo,Designer\n")
    assert len(parsed.sections) == 2
    assert parsed.sections[0].heading == "Ada"
    assert parsed.sections[0].text == "name: Ada; role: DevOps Engineer"


def test_html_keeps_the_article_and_drops_the_page_chrome():
    parsed = parse("wiki.html", (SITES / "engineering" / "wiki-vector-database.html").read_bytes())
    text = " ".join(s.text for s in parsed.sections)
    assert "pgvector inside the main PostgreSQL cluster" in text
    for chrome in ("cookie", "Recently edited", "Acme Wiki home", "Internal use only", "window.analytics"):
        assert chrome not in text


def test_email_section_is_the_subject_with_sender_and_body():
    parsed = parse("notice.eml", (SITES / "it" / "phishing-notice-2026-10.eml").read_bytes())
    assert parsed.sections[0].heading.startswith("Security notice")
    assert "From: Acme Security Team" in parsed.sections[0].text
    assert "never asks you to re-confirm" in parsed.sections[0].text


def test_docx_and_xlsx_are_read_without_extra_packages():
    docx = parse("guide.docx", (SITES / "engineering" / "onboarding-guide.docx").read_bytes())
    assert "Day One" in [s.heading for s in docx.sections]
    xlsx = parse("metrics.xlsx", (SITES / "finance" / "q3-metrics.xlsx").read_bytes())
    assert [s.heading for s in xlsx.sections] == ["Sheet: Headcount", "Sheet: Budget"]
    assert "Category: Training" in xlsx.sections[1].text


def test_scanned_pdf_is_quarantined_not_indexed_empty():
    parsed = parse("scan.pdf", (SITES / "engineering" / "incident-report-scanned.pdf").read_bytes())
    assert parsed.needs_ocr is True
    assert parsed.sections == []


def test_unknown_format_is_reported():
    parsed = parse("slides.key", b"...")
    assert parsed.sections == [] and "no parser" in parsed.note


def test_pii_redacts_personal_contacts_but_keeps_business_ones():
    text = ("Customer jane.doe1984@gmail.com, +1 415 555 0134, (415) 555-0199. "
            "Write to security@acmecorp.com or call ext. 4357. Budget $1,500 from 2026-11-01.")
    cleaned, counts = redact(text, ["acmecorp.com"])
    assert "jane.doe1984" not in cleaned and "555 0134" not in cleaned and "555-0199" not in cleaned
    assert "security@acmecorp.com" in cleaned
    assert "ext. 4357" in cleaned and "$1,500" in cleaned and "2026-11-01" in cleaned
    assert counts == {"email": 1, "phone": 2}
