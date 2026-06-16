# apps/backend/tests/test_knowledge_route.py
"""Tests for GET/POST/PATCH/DELETE /knowledge routes."""
import pytest
from app.extensions import db as _db
from app.models.knowledge_entry import KnowledgeEntry, SourceType, Visibility


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _auth(token):
    return {"Authorization": f"Bearer {token}"}


def _seed_entry(app, title="Test Entry", content="Some content", agency_id=None,
                visibility=Visibility.global_sanitized):
    """Insert a KnowledgeEntry directly and return its id."""
    with app.app_context():
        entry = KnowledgeEntry(
            title=title,
            content=content,
            source_type=SourceType.doc,
            visibility=visibility,
            agency_id=agency_id,
        )
        _db.session.add(entry)
        _db.session.commit()
        return entry.id


# ---------------------------------------------------------------------------
# Auth guard
# ---------------------------------------------------------------------------

def test_list_requires_auth(client):
    rv = client.get("/knowledge")
    assert rv.status_code == 401


# ---------------------------------------------------------------------------
# List (GET /knowledge)
# ---------------------------------------------------------------------------

def test_admin_can_list_all_entries(client, app, admin_token, agencies):
    moh_id = agencies["MOH"]
    nea_id = agencies["NEA"]
    _seed_entry(app, title="MOH Entry", agency_id=moh_id, visibility=Visibility.agency_specific)
    _seed_entry(app, title="NEA Entry", agency_id=nea_id, visibility=Visibility.agency_specific)
    _seed_entry(app, title="Global Entry", agency_id=None, visibility=Visibility.global_sanitized)

    rv = client.get("/knowledge", headers=_auth(admin_token))
    assert rv.status_code == 200
    titles = {e["title"] for e in rv.get_json()}
    assert titles == {"MOH Entry", "NEA Entry", "Global Entry"}


def test_pm_can_list_scoped_entries(client, app, pm_token, agencies):
    """PM scoped to MOH should see MOH entries + global entries, NOT NEA entries."""
    moh_id = agencies["MOH"]
    nea_id = agencies["NEA"]
    _seed_entry(app, title="MOH Entry", agency_id=moh_id, visibility=Visibility.agency_specific)
    _seed_entry(app, title="NEA Entry", agency_id=nea_id, visibility=Visibility.agency_specific)
    _seed_entry(app, title="Global Entry", agency_id=None, visibility=Visibility.global_sanitized)

    rv = client.get("/knowledge", headers=_auth(pm_token))
    assert rv.status_code == 200
    titles = {e["title"] for e in rv.get_json()}
    assert "MOH Entry" in titles
    assert "Global Entry" in titles
    assert "NEA Entry" not in titles


def test_list_search_filter(client, app, admin_token):
    _seed_entry(app, title="Alpha Knowledge", content="alpha specific")
    _seed_entry(app, title="Beta Knowledge", content="beta specific")

    rv = client.get("/knowledge?search=alpha", headers=_auth(admin_token))
    assert rv.status_code == 200
    data = rv.get_json()
    assert len(data) == 1
    assert data[0]["title"] == "Alpha Knowledge"


def test_list_visibility_filter(client, app, admin_token):
    _seed_entry(app, title="Global Entry", visibility=Visibility.global_sanitized)
    _seed_entry(app, title="Admin Only", visibility=Visibility.internal_admin_only)

    rv = client.get("/knowledge?visibility=global_sanitized", headers=_auth(admin_token))
    assert rv.status_code == 200
    data = rv.get_json()
    assert all(e["visibility"] == "global_sanitized" for e in data)


def test_list_agency_id_filter(client, app, admin_token, agencies):
    moh_id = agencies["MOH"]
    nea_id = agencies["NEA"]
    _seed_entry(app, title="MOH Entry", agency_id=moh_id)
    _seed_entry(app, title="NEA Entry", agency_id=nea_id)

    rv = client.get(f"/knowledge?agency_id={moh_id}", headers=_auth(admin_token))
    assert rv.status_code == 200
    data = rv.get_json()
    assert len(data) == 1
    assert data[0]["agency_id"] == moh_id


# ---------------------------------------------------------------------------
# Get single entry (GET /knowledge/:id)
# ---------------------------------------------------------------------------

def test_get_entry_by_id(client, app, admin_token):
    entry_id = _seed_entry(app, title="Single Entry", content="Detailed content")
    rv = client.get(f"/knowledge/{entry_id}", headers=_auth(admin_token))
    assert rv.status_code == 200
    data = rv.get_json()
    assert data["id"] == entry_id
    assert data["title"] == "Single Entry"
    assert data["content"] == "Detailed content"
    assert "source_type" in data
    assert "visibility" in data
    assert "created_at" in data


def test_get_entry_not_found(client, admin_token):
    rv = client.get("/knowledge/99999", headers=_auth(admin_token))
    assert rv.status_code == 404


def test_pm_cannot_get_out_of_scope_entry(client, app, pm_token, agencies):
    nea_id = agencies["NEA"]
    entry_id = _seed_entry(app, title="NEA Only", agency_id=nea_id,
                            visibility=Visibility.agency_specific)
    rv = client.get(f"/knowledge/{entry_id}", headers=_auth(pm_token))
    assert rv.status_code == 403


# ---------------------------------------------------------------------------
# Create (POST /knowledge)
# ---------------------------------------------------------------------------

def test_admin_can_create_entry(client, admin_token):
    payload = {
        "title": "New KB Article",
        "content": "This is the content.",
        "source_type": "doc",
        "visibility": "global_sanitized",
    }
    rv = client.post("/knowledge", json=payload, headers=_auth(admin_token))
    assert rv.status_code == 201
    data = rv.get_json()
    assert data["title"] == "New KB Article"
    assert data["visibility"] == "global_sanitized"
    assert data["id"] is not None


def test_pm_can_create_entry(client, pm_token, agencies):
    moh_id = agencies["MOH"]
    payload = {
        "title": "PM Article",
        "content": "Content from PM.",
        "source_type": "doc",
        "visibility": "agency_specific",
        "agency_id": moh_id,
    }
    rv = client.post("/knowledge", json=payload, headers=_auth(pm_token))
    assert rv.status_code == 201
    data = rv.get_json()
    assert data["agency_id"] == moh_id


def test_pm_cannot_create_entry_for_other_agency(client, pm_token, agencies):
    nea_id = agencies["NEA"]
    payload = {
        "title": "Sneaky Article",
        "content": "Content.",
        "source_type": "doc",
        "visibility": "agency_specific",
        "agency_id": nea_id,
    }
    rv = client.post("/knowledge", json=payload, headers=_auth(pm_token))
    assert rv.status_code == 403


def test_create_entry_missing_title_returns_400(client, admin_token):
    rv = client.post("/knowledge", json={"content": "No title"}, headers=_auth(admin_token))
    assert rv.status_code == 400


# ---------------------------------------------------------------------------
# Update (PATCH /knowledge/:id)
# ---------------------------------------------------------------------------

def test_admin_can_update_entry(client, app, admin_token):
    entry_id = _seed_entry(app, title="Old Title")
    rv = client.patch(
        f"/knowledge/{entry_id}",
        json={"title": "New Title", "visibility": "internal_admin_only"},
        headers=_auth(admin_token),
    )
    assert rv.status_code == 200
    data = rv.get_json()
    assert data["title"] == "New Title"
    assert data["visibility"] == "internal_admin_only"


def test_uiux_cannot_update_entry(client, app, agencies):
    """UIUX role is read-only — PATCH should return 403."""
    from app.models.user import User
    from app.models.role import Role
    from app.services.auth_service import auth_service as _svc

    with app.app_context():
        role = _db.session.scalar(_db.select(Role).where(Role.name == "UIUX"))
        user = User(email="uiux@test.com", name="UI User", role=role,
                    password_hash=_svc.hash_password("testpass"))
        _db.session.add(user)
        _db.session.commit()

    client_inst = app.test_client()
    login = client_inst.post("/auth/login", json={"email": "uiux@test.com", "password": "testpass"})
    token = login.get_json()["token"]

    entry_id = _seed_entry(app, title="Read Only Entry")
    rv = client_inst.patch(
        f"/knowledge/{entry_id}",
        json={"title": "Hacked"},
        headers=_auth(token),
    )
    assert rv.status_code == 403


# ---------------------------------------------------------------------------
# Delete (DELETE /knowledge/:id)
# ---------------------------------------------------------------------------

def test_admin_can_delete_entry(client, app, admin_token):
    entry_id = _seed_entry(app, title="To Delete")
    rv = client.delete(f"/knowledge/{entry_id}", headers=_auth(admin_token))
    assert rv.status_code == 200
    assert rv.get_json()["ok"] is True

    # Verify it's gone
    rv2 = client.get(f"/knowledge/{entry_id}", headers=_auth(admin_token))
    assert rv2.status_code == 404


def test_pm_cannot_delete_entry(client, app, pm_token, agencies):
    moh_id = agencies["MOH"]
    entry_id = _seed_entry(app, title="PM Cannot Delete", agency_id=moh_id,
                            visibility=Visibility.agency_specific)
    rv = client.delete(f"/knowledge/{entry_id}", headers=_auth(pm_token))
    assert rv.status_code == 403


def test_delete_nonexistent_returns_404(client, admin_token):
    rv = client.delete("/knowledge/99999", headers=_auth(admin_token))
    assert rv.status_code == 404
