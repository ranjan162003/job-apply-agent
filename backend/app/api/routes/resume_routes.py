"""Upload resumes, download them, and import them into the profile."""
from __future__ import annotations

from urllib.parse import quote

from fastapi import APIRouter, Depends, File, Form, Response, UploadFile, status
from sqlalchemy.orm import Session

from app.db.database_session import get_db_session
from app.schemas.resume_schemas import ImportApplyRequest, ImportPreview, ImportRequest, ResumeOut, ResumeUpdateRequest
from app.vault import resume_importer, resume_service

router = APIRouter(prefix="/resumes", tags=["resumes"])


@router.get("", response_model=list[ResumeOut])
def list_resumes(session: Session = Depends(get_db_session)) -> list[ResumeOut]:
    return resume_service.list_resumes(session)


@router.post("", response_model=ResumeOut, status_code=status.HTTP_201_CREATED)
async def upload_resume(
    file: UploadFile = File(...),
    name: str | None = Form(default=None, max_length=120),
    session: Session = Depends(get_db_session),
) -> ResumeOut:
    data = await file.read()
    return resume_service.save_resume(session, file.filename or "resume", data, name)


@router.patch("/{resume_id}", response_model=ResumeOut)
def update_resume(resume_id: int, body: ResumeUpdateRequest, session: Session = Depends(get_db_session)) -> ResumeOut:
    return resume_service.update_resume(session, resume_id, body)


@router.delete("/{resume_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_resume(resume_id: int, session: Session = Depends(get_db_session)) -> Response:
    resume_service.delete_resume(session, resume_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/{resume_id}/file")
def download_resume(resume_id: int, session: Session = Depends(get_db_session)) -> Response:
    resume, data = resume_service.read_resume_file(session, resume_id)
    return Response(
        content=data,
        media_type=resume.content_type,
        headers={"Content-Disposition": f"attachment; filename*=UTF-8''{quote(resume.original_filename)}"},
    )


@router.post("/{resume_id}/import-preview", response_model=ImportPreview)
def preview_import(resume_id: int, body: ImportRequest, session: Session = Depends(get_db_session)) -> ImportPreview:
    return resume_importer.preview_import(session, resume_id, body)


@router.post("/import-apply", status_code=status.HTTP_204_NO_CONTENT)
def apply_import(body: ImportApplyRequest, session: Session = Depends(get_db_session)) -> Response:
    resume_importer.apply_import(session, body)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
