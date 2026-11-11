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
        ("Role Description", "current_role_description"),
        ("Key responsibilities", "current_role_description"),
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
        ("SPPU", ["Mumbai University", "Savitribai Phule Pune University", "Pune Institute"], "Savitribai Phule Pune University"),
        ("Savitribai Phule Pune University", ["SPPU", "MU"], "SPPU"),
        ("IIT Madras", ["IIT Bombay", "IIT Madras, Chennai", "NIT Trichy"], "IIT Madras, Chennai"),
        ("Savitribai Phule Pune Univ", ["Savitribai Phule Pune University", "Pune University (Old)"], "Savitribai Phule Pune University"),
        ("B.E.", ["Bachelor of Engineering", "Bachelor of Arts", "Master of Engineering"], "Bachelor of Engineering"),
        ("Pune University", ["Delhi University", "Mumbai University"], None),
        ("M.Sc. (Information Technology)-Integrated",
         ["High School or Equivalent", "Associate's Degree", "Bachelor's Degree", "Master's Degree", "Doctorate"], "Master's Degree"),
        ("M.Sc. (Information Technology)-Integrated", ["Bachelor of Science", "Master of Science", "Master of Arts"], "Master of Science"),
        ("B.Tech", ["Bachelor's Degree", "Master's Degree"], "Bachelor's Degree"),
        ("MCA", ["Bachelors", "Masters", "PhD"], "Masters"),
        ("PhD in Physics", ["Master's Degree", "Doctorate"], "Doctorate"),
        ("COLLEGE OF ENGINEERING GUINDY, ANNA UNIVERSITY, CHENNAI",
         ["Anna University", "College of Engineering Guindy", "College of Engineering Pune"], "College of Engineering Guindy"),
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
    # A custom dropdown's choices appear only once opened: fill it by picking from the list.
    assert matches["i"]["status"] == "fill" and matches["i"]["pick_from_list"] and matches["i"]["value"] == "India"

    file = client.get(f"/api/ext/resumes/{matches['d']['resume_id']}/file", headers=headers)
    assert file.status_code == 200 and file.content.startswith(b"%PDF")
    assert client.get(f"/api/ext/resumes/{matches['d']['resume_id']}/file").status_code == 401


def test_match_respects_max_length(client) -> None:
    token = client.post("/api/pairing").json()["token"]
    client.patch("/api/profile", json={"values": {"linkedin_url": "https://www.linkedin.com/in/a-very-long-profile-name"}})
    response = client.post("/api/ext/match", headers={TOKEN_HEADER: token},
                           json={"fields": [{"id": "x", "kind": "url", "label": "LinkedIn", "max_length": 20}]})
    assert len(response.json()["matches"][0]["value"]) == 20


def test_newest_job_fills_role_description_and_missing_current_job(client) -> None:
    token = client.post("/api/pairing").json()["token"]
    client.put("/api/profile/experiences", json={"experiences": [
        {"title": "Security Analyst", "company": "CyberShield", "is_current": True, "description": "Triage alerts in Splunk."},
        {"title": "Intern", "company": "NetGuard"},
    ]})
    fields = [{"id": "t", "kind": "text", "label": "Job Title"}, {"id": "c", "kind": "text", "label": "Company"},
              {"id": "d", "kind": "textarea", "label": "Role Description"}]
    matches = client.post("/api/ext/match", headers={TOKEN_HEADER: token}, json={"fields": fields}).json()["matches"]
    assert [m["value"] for m in matches] == ["Security Analyst", "CyberShield", "Triage alerts in Splunk."]


PROFILE_JOBS = [
    {"title": "Security Analyst", "company": "CyberShield", "location": "Pune", "start_date": "2023-03", "is_current": True,
     "description": "Triage alerts in Splunk."},
    {"title": "SOC Intern", "company": "NetGuard", "location": "Mumbai", "start_date": "2021-07", "end_date": "2023-02"},
]
PROFILE_SCHOOLS = [{"school": "Savitribai Phule Pune University", "degree": "B.E.", "field_of_study": "Computer Engineering",
                    "start_year": "2017", "end_year": "2021", "grade": "8.2"}]


def test_workday_blocks_fill_from_the_profile_lists(client) -> None:
    token = client.post("/api/pairing").json()["token"]
    client.put("/api/profile/experiences", json={"experiences": PROFILE_JOBS})
    client.put("/api/profile/educations", json={"educations": PROFILE_SCHOOLS})
    w1, w2, w3, e1 = "Work Experience 1", "Work Experience 2", "Work Experience 3", "Education 1"
    fields = [
        {"id": "t1", "kind": "text", "label": "Job Title", "section": w1},
        {"id": "c1", "kind": "checkbox", "label": "I currently work here", "section": w1},
        {"id": "m1", "kind": "text", "label": "Month", "html_id": "workExperience-1--startDate-dateSectionMonth-input", "section": w1},
        {"id": "y1", "kind": "text", "label": "Year", "html_id": "workExperience-1--startDate-dateSectionYear-input", "section": w1},
        {"id": "e1", "kind": "text", "label": "Year", "html_id": "workExperience-1--endDate-dateSectionYear-input", "section": w1},
        {"id": "d1", "kind": "textarea", "label": "Role Description", "section": w1},
        {"id": "t2", "kind": "text", "label": "Job Title", "section": w2},
        {"id": "c2", "kind": "checkbox", "label": "I currently work here", "section": w2},
        {"id": "f2", "kind": "text", "label": "From", "placeholder": "MM/YYYY", "section": w2},
        {"id": "to2", "kind": "date", "label": "To", "section": w2},
        {"id": "t3", "kind": "text", "label": "Job Title", "section": w3},
        {"id": "s1", "kind": "combobox", "label": "School or University", "section": e1},
        {"id": "g1", "kind": "custom-select", "label": "Degree", "section": e1},
        {"id": "fy", "kind": "text", "label": "From", "placeholder": "YYYY", "section": e1},
        {"id": "gp", "kind": "text", "label": "Overall Result (GPA)", "section": e1},
    ]
    matches = {m["id"]: m for m in client.post("/api/ext/match", headers={TOKEN_HEADER: token}, json={"fields": fields}).json()["matches"]}
    value = lambda key: matches[key]["value"]  # noqa: E731
    assert value("t1") == "Security Analyst" and value("c1") == "true"
    assert (value("m1"), value("y1")) == ("03", "2023")
    assert matches["e1"]["status"] == "skipped"  # current job: no end date
    assert value("d1") == "Triage alerts in Splunk."
    assert value("t2") == "SOC Intern" and value("c2") == "false"
    assert value("f2") == "07/2021" and value("to2") == "2023-02-01"
    assert matches["t3"]["status"] == "empty_in_profile" and "number 3" in matches["t3"]["note"]
    assert matches["s1"]["pick_from_list"] and value("s1") == "Savitribai Phule Pune University"
    assert matches["g1"]["pick_from_list"] and value("g1") == "B.E."
    assert value("fy") == "2017" and value("gp") == "8.2"
    assert matches["t1"]["profile_label"] == "Job 1 · Job title"


def test_pick_endpoint(client) -> None:
    token = client.post("/api/pairing").json()["token"]
    pick = lambda value, options: client.post("/api/ext/pick", headers={TOKEN_HEADER: token},  # noqa: E731
                                              json={"value": value, "options": options}).json()["option"]
    assert pick("B.E.", ["Bachelor of Arts", "Bachelor of Engineering"]) == "Bachelor of Engineering"
    assert pick("Mars", ["India"]) is None
