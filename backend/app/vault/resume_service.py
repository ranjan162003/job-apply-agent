"""Store uploaded resumes on disk and keep their text for import and AI drafting."""
from __future__ import annotations

import io
import logging
import re
import uuid
import zipfile
from pathlib import Path

from docx import Document
from pypdf import PdfReader
from pypdf.errors import PdfReadError
from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.core.app_exceptions import InvalidRequestError, ResourceNotFoundError
from app.core.app_settings import get_settings
from app.db.orm_models import Resume
from app.schemas.resume_schemas import ResumeOut, ResumeUpdateRequest

logger = logging.getLogger(__name__)

PDF_TYPE = "application/pdf"
DOCX_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
_EXTENSION_FOR_TYPE = {PDF_TYPE: ".pdf", DOCX_TYPE: ".docx"}


def _storage_dir() -> Path:
    directory = get_settings().resume_storage_dir
    directory.mkdir(parents=True, exist_ok=True)
    return directory


def detect_content_type(data: bytes) -> str:
    """Trust the bytes, not the file name or the browser's guess."""
    if data.startswith(b"%PDF"):
        return PDF_TYPE
    if data.startswith(b"PK\x03\x04"):
        try:
            with zipfile.ZipFile(io.BytesIO(data)) as archive:
                if "word/document.xml" in archive.namelist():
                    return DOCX_TYPE
        except zipfile.BadZipFile:
            pass
    raise InvalidRequestError("Upload a PDF or a Word (.docx) file.")


def extract_text(data: bytes, content_type: str) -> str:
    """Plain text of the resume. Link targets (often hidden behind icons) are listed at the end."""
    if content_type == PDF_TYPE:
        try:
            reader = PdfReader(io.BytesIO(data))
            pages = [page.extract_text() or "" for page in reader.pages]
            links = _pdf_link_targets(reader)
        except (PdfReadError, ValueError) as exc:
            raise InvalidRequestError("That PDF couldn't be read. Try exporting it again.") from exc
    else:
        document = Document(io.BytesIO(data))
        pages = [paragraph.text for paragraph in document.paragraphs]
        for table in document.tables:
            for row in table.rows:
                pages.append(" | ".join(cell.text for cell in row.cells))
        links = sorted(
            {rel.target_ref for rel in document.part.rels.values() if "hyperlink" in rel.reltype}
        )

    text = "\n".join(pages)
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text).strip()
    if links:
        text += "\n\nLinks:\n" + "\n".join(links)
    return text


def _pdf_link_targets(reader: PdfReader) -> list[str]:
    targets: set[str] = set()
    for page in reader.pages:
        for annotation in page.get("/Annots") or []:
            try:
                action = annotation.get_object().get("/A") or {}
                uri = action.get("/URI")
            except Exception:  # malformed annotations are common and harmless to skip
                continue
            if isinstance(uri, str) and uri.startswith(("http", "mailto:")):
                targets.add(uri)
    return sorted(targets)


def _to_out(resume: Resume) -> ResumeOut:
    return ResumeOut(
        id=resume.id,
        name=resume.name,
        original_filename=resume.original_filename,
        content_type=resume.content_type,
        size_bytes=resume.size_bytes,
        is_default=resume.is_default,
        created_at=resume.created_at,
        text_characters=len(resume.text),
    )


def get_resume(session: Session, resume_id: int) -> Resume:
    resume = session.get(Resume, resume_id)
    if resume is None:
        raise ResourceNotFoundError("That resume doesn't exist.")
    return resume


def list_resumes(session: Session) -> list[ResumeOut]:
    rows = session.scalars(select(Resume).order_by(Resume.is_default.desc(), Resume.created_at.desc()))
    return [_to_out(row) for row in rows]


def save_resume(session: Session, filename: str, data: bytes, name: str | None) -> ResumeOut:
    if not data:
        raise InvalidRequestError("The file is empty.")
    limit = get_settings().max_resume_bytes
    if len(data) > limit:
        raise InvalidRequestError(f"Resumes can be at most {limit // (1024 * 1024)} MB.")

    content_type = detect_content_type(data)
    text = extract_text(data, content_type)
    stored_filename = f"{uuid.uuid4().hex}{_EXTENSION_FOR_TYPE[content_type]}"
    (_storage_dir() / stored_filename).write_bytes(data)

    is_first = session.scalar(select(Resume.id).limit(1)) is None
    safe_original = Path(filename or "resume").name[:255]
    resume = Resume(
        name=(name or Path(safe_original).stem or "Resume").strip()[:120],
        original_filename=safe_original,
        stored_filename=stored_filename,
        content_type=content_type,
        size_bytes=len(data),
        text=text,
        is_default=is_first,
    )
    session.add(resume)
    session.commit()
    return _to_out(resume)


def update_resume(session: Session, resume_id: int, request: ResumeUpdateRequest) -> ResumeOut:
    resume = get_resume(session, resume_id)
    if request.name is not None:
        resume.name = request.name.strip()
    if request.is_default:
        session.execute(update(Resume).values(is_default=False))
        resume.is_default = True
    session.commit()
    return _to_out(resume)


def delete_resume(session: Session, resume_id: int) -> None:
    resume = get_resume(session, resume_id)
    was_default = resume.is_default
    (_storage_dir() / resume.stored_filename).unlink(missing_ok=True)
    session.delete(resume)
    session.flush()
    if was_default:
        newest = session.scalar(select(Resume).order_by(Resume.created_at.desc()).limit(1))
        if newest is not None:
            newest.is_default = True
    session.commit()


def read_resume_file(session: Session, resume_id: int) -> tuple[Resume, bytes]:
    resume = get_resume(session, resume_id)
    path = _storage_dir() / resume.stored_filename
    if not path.exists():
        raise ResourceNotFoundError("The resume file is missing from disk. Upload it again.")
    return resume, path.read_bytes()
