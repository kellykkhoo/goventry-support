# apps/api/tests/conftest.py
import pytest
from app import create_app
from app.config import Config
from app.extensions import db as _db
from app.models.role import Role
from app.models.user import User
from app.services.auth_service import auth_service as _svc


class TestConfig(Config):
    DATABASE_URL: str = "sqlite:///:memory:"
    JWT_SECRET_KEY: str = "test-secret-key"
    BOOTSTRAP_ADMIN_EMAIL: str = "admin@test.com"
    BOOTSTRAP_ADMIN_PASSWORD: str = "testpass"
    CORS_ORIGINS: list[str] = ["http://localhost:5173"]

    model_config = {"env_file": None, "extra": "ignore"}


@pytest.fixture(scope="function")
def app():
    application = create_app(TestConfig())
    with application.app_context():
        _db.create_all()
        for name in ["Admin", "PM", "Product Ops", "UIUX"]:
            _db.session.add(Role(name=name))
        _db.session.commit()
        yield application
        _db.drop_all()


@pytest.fixture
def client(app):
    return app.test_client()


@pytest.fixture
def admin_user(app):
    with app.app_context():
        role = _db.session.scalar(_db.select(Role).where(Role.name == "Admin"))
        user = User(
            email="admin@test.com",
            name="Admin User",
            role=role,
            password_hash=_svc.hash_password("testpass"),
        )
        _db.session.add(user)
        _db.session.commit()
        # Refresh to keep the object attached after the commit
        _db.session.refresh(user)
        return user


@pytest.fixture
def admin_token(client, admin_user):
    rv = client.post("/auth/login", json={"email": "admin@test.com", "password": "testpass"})
    assert rv.status_code == 200, rv.get_data(as_text=True)
    return rv.get_json()["token"]


@pytest.fixture
def agencies(app):
    """Seed MOH and NEA agencies; return {code: id}."""
    from app.models.agency import Agency
    with app.app_context():
        out = {}
        for code, name in [("MOH", "Ministry of Health"), ("NEA", "National Environment Agency")]:
            a = Agency(code=code, name=name)
            _db.session.add(a)
            _db.session.flush()
            out[code] = a.id
        _db.session.commit()
        return out


@pytest.fixture
def pm_user(app, agencies):
    """PM scoped to MOH only."""
    from app.models.agency import UserAgencyAccess
    with app.app_context():
        role = _db.session.scalar(_db.select(Role).where(Role.name == "PM"))
        user = User(email="pm@test.com", name="PM User", role=role,
                    password_hash=_svc.hash_password("testpass"))
        _db.session.add(user)
        _db.session.flush()
        _db.session.add(UserAgencyAccess(user_id=user.id, agency_id=agencies["MOH"]))
        _db.session.commit()
        _db.session.refresh(user)
        return user


@pytest.fixture
def pm_token(client, pm_user):
    rv = client.post("/auth/login", json={"email": "pm@test.com", "password": "testpass"})
    assert rv.status_code == 200, rv.get_data(as_text=True)
    return rv.get_json()["token"]
