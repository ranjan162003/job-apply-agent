TOKEN_HEADER = "X-Apply-Copilot-Token"


def test_extension_routes_need_pairing(client) -> None:
    response = client.get("/api/ext/hello")
    assert response.status_code == 401 and "Not paired" in response.json()["detail"]
    assert client.get("/api/pairing").json() == {"is_paired": False, "paired_at": None}


def test_pairing_token_works_and_is_replaced_by_a_new_one(client) -> None:
    first = client.post("/api/pairing").json()["token"]
    assert first.startswith("ac_") and client.get("/api/pairing").json()["is_paired"]

    hello = client.get("/api/ext/hello", headers={TOKEN_HEADER: first})
    assert hello.status_code == 200 and hello.json()["profile_completeness"] == 0

    assert client.get("/api/ext/hello", headers={TOKEN_HEADER: "ac_wrong"}).status_code == 401

    second = client.post("/api/pairing").json()["token"]
    assert client.get("/api/ext/hello", headers={TOKEN_HEADER: first}).status_code == 401
    assert client.get("/api/ext/hello", headers={TOKEN_HEADER: second}).status_code == 200

    assert client.delete("/api/pairing").status_code == 204
    assert client.get("/api/ext/hello", headers={TOKEN_HEADER: second}).status_code == 401


def test_extension_reads_the_vault(client) -> None:
    token = client.post("/api/pairing").json()["token"]
    client.patch("/api/profile", json={"values": {"first_name": "Asha", "email": "asha@example.com"}})
    profile = client.get("/api/ext/profile", headers={TOKEN_HEADER: token}).json()
    assert profile["values"]["first_name"] == "Asha"
    assert profile["values"]["gender"] == "Prefer not to say"
    assert "needs_sponsorship" in profile["never_ai_keys"] and "first_name" not in profile["never_ai_keys"]
    assert profile["resumes"] == [] and profile["experiences"] == []


def test_cors_allows_the_dashboard_and_extension_pages_only(client) -> None:
    def preflight(origin: str):
        return client.options(
            "/api/profile",
            headers={"Origin": origin, "Access-Control-Request-Method": "PATCH",
                     "Access-Control-Request-Headers": "x-apply-copilot-client"},
        )

    assert preflight("http://localhost:5174").status_code == 200
    assert preflight("chrome-extension://abcdefghijklmnopabcdefghijklmnop").status_code == 200
    assert preflight("https://evil.example").status_code == 400
