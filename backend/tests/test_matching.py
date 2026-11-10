import pytest

from app.matching.field_matcher import derived_values, find_key
from app.matching.option_picker import pick_option
from app.schemas.match_schemas import PageField
from tests.resume_files import pdf_resume

TOKEN_HEADER = "X-Apply-Copilot-Token"


def field(label: str = "", kind: str = "text", **extra) -> PageField:
    return PageField(id=extra.pop("id", "f1"), kind=kind, label=label, **extra)


@pytest.mark.parametrize(
    ("label", "key"),
    [
        ("First Name", "first_name"),
        ("Legal last name", "last_name"),
        ("Full name", "full_name"),
        ("Email Address", "email"),
        ("Confirm email", "email"),
        ("Mobile number", "phone"),
        ("Phone Device Type", None),
        ("Country phone code", "phone_country_code"),
        ("LinkedIn Profile", "linkedin_url"),
        ("GitHub URL", "github_url"),
        ("Current company", "current_company"),
        ("Total years of experience", "total_experience_years"),
        ("Notice period (in days)", "notice_period_days"),
        ("Expected CTC", "expected_ctc"),
        ("Will you now or in the future require sponsorship?", "needs_sponsorship"),
        ("Are you willing to relocate?", "willing_to_relocate"),
        ("How did you hear about us?", "how_did_you_hear"),
        ("Why do you want to work here?", None),
    ],
)
def test_labels_map_to_profile_keys(label, key) -> None:
    assert find_key(field(label)) == key


def test_autocomplete_and_name_attributes_are_used() -> None:
    assert find_key(field("", autocomplete="given-name")) == "first_name"
    assert find_key(field("", name="job_application[last_name]")) == "last_name"
    # A visible label beats a misleading name attribute.
    assert find_key(field("Email", name="job_application[first_name]")) == "email"


@pytest.mark.parametrize(
    ("value", "options", "expected"),
    [
        ("India", ["United States", "India (+91)", "Indonesia"], "India (+91)"),
        ("No", ["Yes, I will require sponsorship", "No, I will not require sponsorship"], "No, I will not require sponsorship"),
        ("Yes", ["Yes", "No"], "Yes"),
        ("Prefer not to say", ["Male", "Female", "I don't wish to answer"], "I don't wish to answer"),
        ("3", ["0-1 years", "2-4 years", "5+ years"], "2-4 years"),
        ("7", ["0-1 years", "2-4 years", "5+ years"], "5+ years"),
        ("Remote", ["On-site", "Remote first", "Hybrid"], "Remote first"),
        ("Mars", ["India", "Japan"], None),
    ],
)
def test_option_picker(value, options, expected) -> None:
    assert pick_option(value, options) == expected


def test_derived_values() -> None:
    values = derived_values({"first_name": "Asha", "last_name": "Verma", "phone_country_code": "+91", "phone": "98765 43210",
                             "city": "Pune", "country": "India"})
    assert values["full_name"] == "Asha Verma"
    assert values["phone_full"] == "+91 98765 43210"
    assert values["current_location"] == "Pune, India"
    assert values["preferred_name"] == "Asha"


def test_match_endpoint_fills_skips_and_explains(client) -> None:
    token = client.post("/api/pairing").json()["token"]
    headers = {TOKEN_HEADER: token}
    client.patch("/api/profile", json={"values": {"first_name": "Asha", "email": "asha@example.com", "needs_sponsorship": "No",
                                                  "country": "India", "summary": "x" * 50}})
    client.post("/api/resumes", files={"file": ("Asha_CV.pdf", pdf_resume(), "application/pdf")})

    fields = [
        {"id": "a", "kind": "text", "label": "First Name"},
        {"id": "b", "kind": "email", "label": "Email"},
        {"id": "c", "kind": "select", "label": "Require sponsorship?", "options": ["Yes", "No"]},
        {"id": "d", "kind": "file", "label": "Resume/CV"},
        {"id": "e", "kind": "checkbox", "label": "I agree to the privacy policy"},
        {"id": "f", "kind": "text", "label": "Last name"},
        {"id": "g", "kind": "textarea", "label": "Why us?"},
        {"id": "h", "kind": "select", "label": "Country", "options": ["Japan", "Brazil"]},
        {"id": "i", "kind": "custom-select", "label": "Country"},
    ]
    response = client.post("/api/ext/match", json={"site": "greenhouse", "fields": fields}, headers=headers)
    assert response.status_code == 200
    matches = {m["id"]: m for m in response.json()["matches"]}
    assert matches["a"] == {**matches["a"], "status": "fill", "value": "Asha", "profile_key": "first_name"}
    assert matches["b"]["value"] == "asha@example.com"
    assert matches["c"]["value"] == "No"
    assert matches["d"]["status"] == "fill" and matches["d"]["resume_filename"] == "Asha_CV.pdf"
    assert matches["e"]["status"] == "skipped" and "yourself" in matches["e"]["note"]
    assert matches["f"]["status"] == "empty_in_profile"
    assert matches["g"]["status"] == "unknown"
    assert matches["h"]["status"] == "no_option"
    assert matches["i"]["status"] == "skipped"

    file = client.get(f"/api/ext/resumes/{matches['d']['resume_id']}/file", headers=headers)
    assert file.status_code == 200 and file.content.startswith(b"%PDF")
    assert client.get(f"/api/ext/resumes/{matches['d']['resume_id']}/file").status_code == 401


def test_match_respects_max_length(client) -> None:
    token = client.post("/api/pairing").json()["token"]
    client.patch("/api/profile", json={"values": {"linkedin_url": "https://www.linkedin.com/in/a-very-long-profile-name"}})
    response = client.post("/api/ext/match", headers={TOKEN_HEADER: token},
                           json={"fields": [{"id": "x", "kind": "url", "label": "LinkedIn", "max_length": 20}]})
    assert len(response.json()["matches"][0]["value"]) == 20
