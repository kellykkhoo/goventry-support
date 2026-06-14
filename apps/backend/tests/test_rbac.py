# apps/backend/tests/test_rbac.py
from app.extensions import db
from app.models.role import Role
from app.models.user import User
from app.services.auth_service import auth_service as svc


def _make_user(app, role_name: str, email: str) -> str:
    """Create a user with the given role and return their JWT token."""
    with app.app_context():
        role = db.session.scalar(db.select(Role).where(Role.name == role_name))
        user = User(
            email=email,
            name=role_name,
            role=role,
            password_hash=svc.hash_password("pw"),
        )
        db.session.add(user)
        db.session.commit()
    rv = app.test_client().post("/auth/login", json={"email": email, "password": "pw"})
    return rv.get_json()["token"]


def test_admin_can_reach_admin_only_route(client, app):
    admin_tok = _make_user(app, "Admin", "a@test.com")
    rv = client.post(
        "/admin/users",
        json={"email": "new@test.com", "name": "New", "role": "PM", "password": "pw"},
        headers={"Authorization": f"Bearer {admin_tok}"},
    )
    assert rv.status_code == 201


def test_pm_cannot_reach_admin_only_route(client, app):
    pm_tok = _make_user(app, "PM", "pm@test.com")
    rv = client.post(
        "/admin/users",
        json={"email": "new2@test.com", "name": "New2", "role": "PM", "password": "pw"},
        headers={"Authorization": f"Bearer {pm_tok}"},
    )
    assert rv.status_code == 403


def test_unauthenticated_cannot_reach_admin_route(client):
    rv = client.post(
        "/admin/users",
        json={"email": "x@test.com", "name": "X", "role": "PM", "password": "pw"},
    )
    assert rv.status_code == 401
