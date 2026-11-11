import pytest

from app.vault.resume_importer import find_patterns, normalize_month
from tests.resume_files import docx_resume, pdf_resume

PDF = "application/pdf"


def upload(client, data: bytes, filename: str = "Asha_Resume.pdf", name: str | None = None):
    form = {"name": name} if name else None
    return client.post("/api/resumes", files={"file": (filename, data, "application/octet-stream")}, data=form)


def ai_reply(**overrides):
    reply = {
        "fields": {
            "first_name": "Asha",
            "last_name": "Verma",
            "email": "wrong@example.com",  # the pattern pass must win over this
            "current_title": "Software Engineer",
            "current_company": "Acme Corp",
            "graduation_year": 2021,
            "total_experience_years": "not sure",  # doesn't fit a number: skipped
            "expected_ctc": "20 LPA",  # never_ai: not even in the schema, must be ignored
        },
        "experiences": [
            {"title": "Software Engineer", "company": "Acme Corp", "location": "Bengaluru",
             "start_date": "Jan 2022", "end_date": "Present", "description": "Built payment APIs."},
            {"title": "", "company": "Ghost"},
        ],
        "educations": [{"school": "IIT Madras", "degree": "B.Tech", "field_of_study": "Computer Science",
                        "start_year": 2017, "end_year": "2021", "grade": "8.6"}],
    }
    reply.update(overrides)
    return reply


def test_upload_pdf_extracts_text_and_link_targets(client, resume_folder) -> None:
    response = upload(client, pdf_resume())
    assert response.status_code == 201
    resume = response.json()
    assert resume["content_type"] == PDF and resume["is_default"] and resume["name"] == "Asha_Resume"
    assert resume["text_characters"] > 100
    assert len(list(resume_folder.iterdir())) == 1

    downloaded = client.get(f"/api/resumes/{resume['id']}/file")
    assert downloaded.content.startswith(b"%PDF")
    assert "Asha_Resume.pdf" in downloaded.headers["content-disposition"]


def test_upload_rejects_files_that_are_not_pdf_or_docx(client) -> None:
    assert upload(client, b"hello", "resume.pdf").status_code == 400
    assert upload(client, b"", "resume.pdf").status_code == 400


def test_upload_size_limit(client, monkeypatch) -> None:
    from app.core.app_settings import get_settings

    monkeypatch.setattr(get_settings(), "max_resume_bytes", 100)
    assert upload(client, pdf_resume()).status_code == 400


def test_default_resume_moves_on_switch_and_delete(client, resume_folder) -> None:
    first = upload(client, pdf_resume(), name="Backend").json()
    second = upload(client, docx_resume(), "security.docx", name="Security").json()
    assert not second["is_default"]

    client.patch(f"/api/resumes/{second['id']}", json={"is_default": True})
    listed = client.get("/api/resumes").json()
    assert [r["name"] for r in listed] == ["Security", "Backend"]  # default first

    assert client.delete(f"/api/resumes/{second['id']}").status_code == 204
    remaining = client.get("/api/resumes").json()
    assert remaining[0]["id"] == first["id"] and remaining[0]["is_default"]
    assert len(list(resume_folder.iterdir())) == 1
    assert client.delete("/api/resumes/999").status_code == 404


def test_patterns_find_contact_details() -> None:
    found = find_patterns(
        "Asha | asha.verma@example.com | +91 98765 43210\n2017 - 2021\ngithub.com/ashaverma\n"
        "Links:\nhttps://www.linkedin.com/in/asha-verma/"
    )
    assert found == {
        "email": "asha.verma@example.com",
        "phone_country_code": "+91",
        "phone": "98765 43210",
        "github_url": "https://github.com/ashaverma",
        "linkedin_url": "https://www.linkedin.com/in/asha-verma",
    }
    assert find_patterns("Call (555) 123-4567")["phone"] == "(555) 123-4567"
    assert "phone" not in find_patterns("Worked 2019 - 2021 at Acme")


@pytest.mark.parametrize(
    ("raw", "expected"),
    [("Jan 2022", "2022-01"), ("September, 2020", "2020-09"), ("03/2021", "2021-03"), ("2022-7", "2022-07"),
     ("2019", "2019-01"), ("Present", ""), ("sometime", ""), (None, "")],
)
def test_month_normalisation(raw, expected) -> None:
    assert normalize_month(raw) == expected


def test_import_without_a_model_uses_patterns_only(client) -> None:
    resume = upload(client, docx_resume(), "resume.docx").json()
    preview = client.post(f"/api/resumes/{resume['id']}/import-preview", json={}).json()
    assert not preview["used_ai"] and preview["note"]
    keys = {f["key"]: f for f in preview["fields"]}
    assert set(keys) == {"email", "phone_country_code", "phone", "github_url"}
    assert keys["email"]["source"] == "pattern" and keys["email"]["is_change"]


def test_import_with_ai_previews_then_applies(client, provider) -> None:
    resume = upload(client, pdf_resume()).json()
    client.patch("/api/profile", json={"values": {"first_name": "Asha"}})
    provider.queue(ai_reply())

    preview = client.post(f"/api/resumes/{resume['id']}/import-preview", json={"provider_id": "ollama"}).json()
    fields = {f["key"]: f for f in preview["fields"]}
    assert fields["email"]["suggested_value"] == "asha.verma@example.com"
    assert fields["email"]["source"] == "pattern"
    assert fields["linkedin_url"]["suggested_value"] == "https://www.linkedin.com/in/asha-verma"  # from the PDF link
    assert fields["graduation_year"]["suggested_value"] == "2021"
    assert fields["first_name"]["is_change"] is False
    assert "total_experience_years" not in fields and "expected_ctc" not in fields

    assert len(preview["experiences"]) == 1
    job = preview["experiences"][0]
    assert job["start_date"] == "2022-01" and job["is_current"] and job["end_date"] == ""
    assert preview["educations"][0]["start_year"] == "2017"

    prompt = provider.prompts[0]
    assert "<<<RESUME" in prompt and "Asha Verma" in prompt
    assert "expected_ctc" not in prompt and "needs_sponsorship" not in prompt

    apply = client.post(
        "/api/resumes/import-apply",
        json={"values": {"last_name": "Verma", "email": fields["email"]["suggested_value"]},
              "experiences": preview["experiences"], "educations": preview["educations"]},
    )
    assert apply.status_code == 204
    profile = client.get("/api/profile").json()
    values = {f["key"]: f["value"] for s in profile["sections"] for f in s["fields"]}
    assert values["last_name"] == "Verma" and values["email"] == "asha.verma@example.com"
    assert values["current_title"] is None  # not ticked, not saved
    assert profile["experiences"][0]["company"] == "Acme Corp"


def test_import_repairs_one_bad_reply(client, provider) -> None:
    resume = upload(client, pdf_resume()).json()
    provider.queue("Sure! Here is the profile:", ai_reply())
    preview = client.post(f"/api/resumes/{resume['id']}/import-preview", json={"provider_id": "ollama"})
    assert preview.status_code == 200 and len(provider.prompts) == 2


def test_import_of_image_only_pdf_explains_why(client) -> None:
    resume = upload(client, pdf_resume(lines=[], link=None)).json()
    response = client.post(f"/api/resumes/{resume['id']}/import-preview", json={})
    assert response.status_code == 400 and "scanned" in response.json()["detail"]
