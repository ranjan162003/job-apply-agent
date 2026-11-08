"""Build small PDF and DOCX resumes in memory for the import tests."""
from __future__ import annotations

import io

from docx import Document
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas

RESUME_LINES = [
    "Asha Verma",
    "Backend Engineer | asha.verma@example.com | +91 98765 43210",
    "github.com/ashaverma",
    "Experience",
    "Software Engineer, Acme Corp, Bengaluru  Jan 2022 - Present",
    "Built payment APIs in Python and FastAPI.",
    "Education",
    "B.Tech Computer Science, IIT Madras, 2017 - 2021, CGPA 8.6",
]


def pdf_resume(lines: list[str] = RESUME_LINES, link: str | None = "https://www.linkedin.com/in/asha-verma") -> bytes:
    buffer = io.BytesIO()
    pdf = canvas.Canvas(buffer, pagesize=A4)
    y = 800
    for line in lines:
        pdf.drawString(50, y, line)
        y -= 20
    if link:
        pdf.drawString(50, y, "LinkedIn")
        pdf.linkURL(link, (50, y - 2, 110, y + 10))
    pdf.save()
    return buffer.getvalue()


def docx_resume(lines: list[str] = RESUME_LINES) -> bytes:
    document = Document()
    for line in lines:
        document.add_paragraph(line)
    buffer = io.BytesIO()
    document.save(buffer)
    return buffer.getvalue()
