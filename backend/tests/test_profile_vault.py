from app.vault.profile_catalog import fields_by_key, load_catalog


def test_catalog_loads_with_unique_keys_and_protected_fields() -> None:
    sections = load_catalog()
    assert {s.id for s in sections} >= {"contact", "links", "work", "salary", "authorisation", "eeo"}
    fields = fields_by_key()
    assert fields["needs_sponsorship"].never_ai and fields["expected_ctc"].never_ai and fields["gender"].never_ai
    assert not fields["first_name"].never_ai


def test_new_profile_has_defaults_and_low_completeness(client) -> None:
    profile = client.get("/api/profile").json()
    values = {f["key"]: f["value"] for s in profile["sections"] for f in s["fields"]}
    assert values["gender"] == "Prefer not to say"
    assert values["salary_currency"] == "INR"
    assert values["first_name"] is None
    assert profile["completeness"]["percent"] == 0
    assert "First name" in profile["completeness"]["missing"]


def test_update_normalises_values_by_type(client) -> None:
    response = client.patch(
        "/api/profile",
        json={"values": {
            "first_name": "  Asha ",
            "linkedin_url": "linkedin.com/in/asha",
            "expected_ctc": "15,00,000",
            "needs_sponsorship": "no",
            "work_mode_preference": "remote",
        }},
    )
    assert response.status_code == 200
    values = {f["key"]: f["value"] for s in response.json()["sections"] for f in s["fields"]}
    assert values["first_name"] == "Asha"
    assert values["linkedin_url"] == "https://linkedin.com/in/asha"
    assert values["expected_ctc"] == "1500000"
    assert values["needs_sponsorship"] == "No"
    assert values["work_mode_preference"] == "Remote"
    assert response.json()["completeness"]["percent"] > 0


def test_bad_values_are_rejected_and_nothing_is_saved(client) -> None:
    response = client.patch("/api/profile", json={"values": {"first_name": "Asha", "email": "not-an-email"}})
    assert response.status_code == 400 and "email" in response.json()["detail"].lower()
    values = {f["key"]: f["value"] for s in client.get("/api/profile").json()["sections"] for f in s["fields"]}
    assert values["first_name"] is None  # the whole update is validated before saving

    assert client.patch("/api/profile", json={"values": {"made_up": "x"}}).status_code == 400
    assert client.patch("/api/profile", json={"values": {"gender": "Robot"}}).status_code == 400


def test_empty_value_clears_and_restores_default(client) -> None:
    client.patch("/api/profile", json={"values": {"gender": "Female", "city": "Pune"}})
    client.patch("/api/profile", json={"values": {"gender": "", "city": None}})
    values = {f["key"]: f["value"] for s in client.get("/api/profile").json()["sections"] for f in s["fields"]}
    assert values["gender"] == "Prefer not to say" and values["city"] is None


def test_experiences_and_educations_replace_in_order(client) -> None:
    jobs = [
        {"title": "Engineer", "company": "Acme", "start_date": "2022-01", "end_date": "2023-05", "is_current": True},
        {"title": "Intern", "company": "Beta", "start_date": "2021-05", "end_date": "2021-08"},
    ]
    saved = client.put("/api/profile/experiences", json={"experiences": jobs}).json()
    assert [j["company"] for j in saved] == ["Acme", "Beta"]
    assert saved[0]["end_date"] == ""  # a current job has no end date

    assert client.put("/api/profile/experiences", json={"experiences": [{**jobs[0], "start_date": "Jan 2022"}]}).status_code == 422

    schools = [{"school": "IIT Madras", "degree": "B.Tech", "end_year": "2021"}]
    assert client.put("/api/profile/educations", json={"educations": schools}).json()[0]["school"] == "IIT Madras"
    profile = client.get("/api/profile").json()
    assert len(profile["experiences"]) == 2 and len(profile["educations"]) == 1


def test_mutating_requests_need_the_client_header(client) -> None:
    response = client.patch("/api/profile", json={"values": {}}, headers={"X-Apply-Copilot-Client": ""})
    assert response.status_code == 403
    assert client.get("/api/health").status_code == 200


def test_unknown_host_header_is_refused(client) -> None:
    assert client.get("/api/health", headers={"Host": "evil.example"}).status_code == 400
