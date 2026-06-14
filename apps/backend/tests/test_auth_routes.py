# apps/backend/tests/test_auth_routes.py


def test_login_success(client, admin_user):
    rv = client.post("/auth/login", json={"email": "admin@test.com", "password": "testpass"})
    assert rv.status_code == 200
    data = rv.get_json()
    assert "token" in data
    assert data["user"]["email"] == "admin@test.com"
    assert data["user"]["role"] == "Admin"


def test_login_wrong_password(client, admin_user):
    rv = client.post("/auth/login", json={"email": "admin@test.com", "password": "nope"})
    assert rv.status_code == 401
    assert "error" in rv.get_json()


def test_login_unknown_email(client):
    rv = client.post("/auth/login", json={"email": "ghost@test.com", "password": "pw"})
    assert rv.status_code == 401


def test_login_missing_body(client):
    rv = client.post("/auth/login", json={})
    assert rv.status_code == 401


def test_logout(client, admin_token):
    rv = client.post("/auth/logout", headers={"Authorization": f"Bearer {admin_token}"})
    assert rv.status_code == 200


def test_me_authenticated(client, admin_user, admin_token):
    rv = client.get("/auth/me", headers={"Authorization": f"Bearer {admin_token}"})
    assert rv.status_code == 200
    data = rv.get_json()
    assert data["email"] == "admin@test.com"
    assert data["role"] == "Admin"
    assert "id" in data


def test_me_unauthenticated(client):
    rv = client.get("/auth/me")
    assert rv.status_code == 401


def test_me_bad_token(client):
    rv = client.get("/auth/me", headers={"Authorization": "Bearer notavalidtoken"})
    assert rv.status_code == 422
