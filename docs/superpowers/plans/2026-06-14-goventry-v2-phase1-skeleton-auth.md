# GovEntry v2 — Phase 1: Skeleton + Auth Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create the v2 monorepo skeleton (Flask API + Vite frontend + Docker compose), implement JWT auth with RBAC, and verify an admin can log in via the Vite app.

**Architecture:** Flask app factory with SQLAlchemy 2.0 models and Flask-JWT-Extended for auth. Vite React frontend with a route guard that calls `/auth/me`. Everything runs in Docker compose (api + web + Postgres). The existing Next.js app at the repo root is **not touched** — it keeps running until Phase 2 reaches parity.

**Tech Stack:**
- Backend: Python 3.12, Flask 3.1, SQLAlchemy 2.0, Alembic (via Flask-Migrate), Flask-JWT-Extended, Passlib/bcrypt, Flask-CORS, Gunicorn, uv (package manager)
- Frontend: Node 22, Vite 6, React 19, TypeScript 5.8, React Router v7, TanStack Query v5, Tailwind CSS v3, Zod
- Infra: Docker, docker compose, Postgres 16

**Spec:** `docs/superpowers/specs/2026-06-14-goventry-v2-rewrite-design.md`

---

## File Map

### Created this phase

```
apps/
  api/
    pyproject.toml                    # uv project: all deps + dev deps
    wsgi.py                           # Gunicorn entrypoint: app = create_app()
    .env.example                      # env var template (never real secrets)
    app/
      __init__.py                     # create_app() factory + CLI commands
      config.py                       # pydantic-settings Config class
      extensions.py                   # db, migrate, jwt, cors singletons
      models/
        __init__.py                   # re-exports all models (needed by Alembic)
        role.py                       # Role model
        user.py                       # User model
        agency.py                     # Agency + UserAgencyAccess models
      routes/
        __init__.py
        auth.py                       # POST /auth/login, /logout; GET /auth/me
        admin.py                      # POST /admin/users, PATCH /admin/users/:id
      services/
        __init__.py
        auth_service.py               # AuthService: hash, verify, authenticate, create_token
      middleware/
        __init__.py
        auth_middleware.py            # require_role(*roles) decorator
    tests/
      __init__.py
      conftest.py                     # pytest fixtures: app, client, admin_user, admin_token
      test_auth.py                    # login / me endpoint tests
      test_rbac.py                    # role enforcement tests
  web/
    package.json
    vite.config.ts
    tsconfig.json
    tsconfig.node.json
    postcss.config.js
    tailwind.config.ts
    index.html
    src/
      main.tsx
      App.tsx
      lib/
        api.ts                        # fetch wrapper + auth endpoint callers
        auth.tsx                      # AuthContext, AuthProvider, useAuth hook
      pages/
        LoginPage.tsx
      components/
        ProtectedRoute.tsx
        AppShell.tsx
infra/
  docker/
    api.Dockerfile
    web.Dockerfile
    nginx.conf                        # SPA fallback for Vite build
  compose.yaml
```

### Not touched this phase

```
src/          # existing Next.js app — leave alone
prisma/       # existing Prisma schema — leave alone
render.yaml   # existing Render config — leave alone
package.json  # root Next.js package.json — leave alone
```

---

## Task 1: Monorepo skeleton

**Files:**
- Create: `apps/api/` directory tree
- Create: `apps/web/` directory tree
- Create: `infra/docker/` directory tree

- [ ] **Step 1.1: Create all directories**

```bash
mkdir -p apps/api/app/models apps/api/app/routes apps/api/app/services apps/api/app/middleware apps/api/tests
mkdir -p apps/web/src/lib apps/web/src/pages apps/web/src/components
mkdir -p infra/docker
```

- [ ] **Step 1.2: Verify layout**

```bash
rtk find apps -type d
rtk find infra -type d
```

Expected: the 12 directories above exist.

- [ ] **Step 1.3: Create placeholder `__init__.py` files**

```bash
touch apps/api/app/__init__.py
touch apps/api/app/models/__init__.py
touch apps/api/app/routes/__init__.py
touch apps/api/app/services/__init__.py
touch apps/api/app/middleware/__init__.py
touch apps/api/tests/__init__.py
```

- [ ] **Step 1.4: Commit**

```bash
rtk git add apps/ infra/
rtk git commit -m "chore: add v2 monorepo directory skeleton"
```

---

## Task 2: Flask app skeleton

**Files:**
- Create: `apps/api/pyproject.toml`
- Create: `apps/api/wsgi.py`
- Create: `apps/api/app/config.py`
- Create: `apps/api/app/extensions.py`
- Create: `apps/api/.env.example`

- [ ] **Step 2.1: Write `pyproject.toml`**

```toml
# apps/api/pyproject.toml
[project]
name = "goventry-api"
version = "0.1.0"
requires-python = ">=3.12"
dependencies = [
    "flask>=3.1",
    "flask-sqlalchemy>=3.1",
    "flask-migrate>=4.1",
    "flask-jwt-extended>=4.7",
    "flask-cors>=4.0",
    "pydantic-settings>=2.7",
    "passlib[bcrypt]>=1.7",
    "gunicorn>=23.0",
    "psycopg2-binary>=2.9",
]

[dependency-groups]
dev = [
    "pytest>=8.3",
    "pytest-flask>=1.3",
]

[build-system]
requires = ["hatchling"]
build-backend = "hatchling.build"
```

- [ ] **Step 2.2: Install dependencies**

```bash
cd apps/api && uv sync && cd ../..
```

Expected: `apps/api/.venv/` is created, no errors.

- [ ] **Step 2.3: Write `app/config.py`**

```python
# apps/api/app/config.py
from pydantic_settings import BaseSettings


class Config(BaseSettings):
    DATABASE_URL: str = "postgresql://goventry:goventry@localhost:5432/goventry"
    JWT_SECRET_KEY: str = "dev-secret-change-in-prod"
    CORS_ORIGINS: list[str] = ["http://localhost:5173"]
    BOOTSTRAP_ADMIN_EMAIL: str = "admin@goventry.gov.sg"
    BOOTSTRAP_ADMIN_PASSWORD: str = "changeme"

    model_config = {"env_file": ".env", "extra": "ignore"}
```

- [ ] **Step 2.4: Write `app/extensions.py`**

```python
# apps/api/app/extensions.py
from flask_sqlalchemy import SQLAlchemy
from flask_migrate import Migrate
from flask_jwt_extended import JWTManager
from flask_cors import CORS

db = SQLAlchemy()
migrate = Migrate()
jwt = JWTManager()
cors = CORS()
```

- [ ] **Step 2.5: Write `app/__init__.py` (factory, no routes yet)**

```python
# apps/api/app/__init__.py
from flask import Flask
from .config import Config
from .extensions import db, migrate, jwt, cors


def create_app(config: Config | None = None) -> Flask:
    app = Flask(__name__)
    cfg = config or Config()

    app.config["SQLALCHEMY_DATABASE_URI"] = cfg.DATABASE_URL
    app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False
    app.config["JWT_SECRET_KEY"] = cfg.JWT_SECRET_KEY
    app.config["_APP_CONFIG"] = cfg

    db.init_app(app)
    migrate.init_app(app, db)
    jwt.init_app(app)
    cors.init_app(app, origins=cfg.CORS_ORIGINS, supports_credentials=True)

    from .routes.auth import bp as auth_bp
    from .routes.admin import bp as admin_bp
    app.register_blueprint(auth_bp)
    app.register_blueprint(admin_bp)

    @app.cli.command("bootstrap-admin")
    def bootstrap_admin() -> None:
        """Create initial admin from BOOTSTRAP_ADMIN_EMAIL / BOOTSTRAP_ADMIN_PASSWORD."""
        from .models.role import Role
        from .models.user import User
        from .services.auth_service import auth_service as svc

        cfg = app.config["_APP_CONFIG"]
        if db.session.scalar(db.select(User).where(User.email == cfg.BOOTSTRAP_ADMIN_EMAIL)):
            print(f"Admin {cfg.BOOTSTRAP_ADMIN_EMAIL} already exists, skipping.")
            return

        for name in ["Admin", "PM", "Product Ops", "UIUX"]:
            if not db.session.scalar(db.select(Role).where(Role.name == name)):
                db.session.add(Role(name=name))
        db.session.flush()

        role = db.session.scalar(db.select(Role).where(Role.name == "Admin"))
        user = User(
            email=cfg.BOOTSTRAP_ADMIN_EMAIL,
            name="Admin",
            role=role,
            password_hash=svc.hash_password(cfg.BOOTSTRAP_ADMIN_PASSWORD),
        )
        db.session.add(user)
        db.session.commit()
        print(f"Created admin: {cfg.BOOTSTRAP_ADMIN_EMAIL}")

    return app
```

- [ ] **Step 2.6: Write `wsgi.py`**

```python
# apps/api/wsgi.py
from app import create_app

app = create_app()
```

- [ ] **Step 2.7: Write `.env.example`**

```bash
# apps/api/.env.example
DATABASE_URL=postgresql://goventry:goventry@localhost:5432/goventry
JWT_SECRET_KEY=dev-secret-change-in-prod
CORS_ORIGINS=["http://localhost:5173"]
BOOTSTRAP_ADMIN_EMAIL=admin@goventry.gov.sg
BOOTSTRAP_ADMIN_PASSWORD=changeme
```

- [ ] **Step 2.8: Verify Flask can start (no models yet)**

```bash
cd apps/api && uv run flask --app wsgi:app --version && cd ../..
```

Expected: prints Flask version, no import error.

- [ ] **Step 2.9: Commit**

```bash
rtk git add apps/api/pyproject.toml apps/api/wsgi.py apps/api/app/__init__.py apps/api/app/config.py apps/api/app/extensions.py apps/api/.env.example
rtk git commit -m "feat(api): Flask app factory with JWT + SQLAlchemy extensions"
```

---

## Task 3: SQLAlchemy models

**Files:**
- Create: `apps/api/app/models/role.py`
- Create: `apps/api/app/models/user.py`
- Create: `apps/api/app/models/agency.py`
- Modify: `apps/api/app/models/__init__.py`

- [ ] **Step 3.1: Write `models/role.py`**

```python
# apps/api/app/models/role.py
import sqlalchemy as sa
from sqlalchemy.orm import Mapped, mapped_column, relationship
from ..extensions import db


class Role(db.Model):
    __tablename__ = "roles"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(sa.String(50), unique=True, nullable=False)

    users: Mapped[list["User"]] = relationship("User", back_populates="role")

    def __repr__(self) -> str:
        return f"<Role {self.name}>"
```

- [ ] **Step 3.2: Write `models/user.py`**

```python
# apps/api/app/models/user.py
from datetime import datetime, timezone
import sqlalchemy as sa
from sqlalchemy.orm import Mapped, mapped_column, relationship
from ..extensions import db


class User(db.Model):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(sa.String(255), unique=True, nullable=False, index=True)
    name: Mapped[str] = mapped_column(sa.String(255), nullable=False)
    password_hash: Mapped[str | None] = mapped_column(sa.String(255))
    role_id: Mapped[int | None] = mapped_column(sa.ForeignKey("roles.id", ondelete="SET NULL"))
    is_active: Mapped[bool] = mapped_column(default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        default=lambda: datetime.now(timezone.utc), nullable=False
    )

    role: Mapped["Role | None"] = relationship("Role", back_populates="users")
    agency_access: Mapped[list["UserAgencyAccess"]] = relationship(
        "UserAgencyAccess", back_populates="user", cascade="all, delete-orphan"
    )

    def __repr__(self) -> str:
        return f"<User {self.email}>"
```

- [ ] **Step 3.3: Write `models/agency.py`**

```python
# apps/api/app/models/agency.py
import sqlalchemy as sa
from sqlalchemy.orm import Mapped, mapped_column, relationship
from ..extensions import db


class Agency(db.Model):
    __tablename__ = "agencies"

    id: Mapped[int] = mapped_column(primary_key=True)
    code: Mapped[str] = mapped_column(sa.String(20), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(sa.String(255), nullable=False)

    user_access: Mapped[list["UserAgencyAccess"]] = relationship(
        "UserAgencyAccess", back_populates="agency", cascade="all, delete-orphan"
    )

    def __repr__(self) -> str:
        return f"<Agency {self.code}>"


class UserAgencyAccess(db.Model):
    __tablename__ = "user_agency_access"

    user_id: Mapped[int] = mapped_column(
        sa.ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    agency_id: Mapped[int] = mapped_column(
        sa.ForeignKey("agencies.id", ondelete="CASCADE"), primary_key=True
    )

    user: Mapped["User"] = relationship("User", back_populates="agency_access")
    agency: Mapped["Agency"] = relationship("Agency", back_populates="user_access")
```

- [ ] **Step 3.4: Update `models/__init__.py` (Alembic needs this import)**

```python
# apps/api/app/models/__init__.py
from .role import Role
from .user import User
from .agency import Agency, UserAgencyAccess

__all__ = ["Role", "User", "Agency", "UserAgencyAccess"]
```

- [ ] **Step 3.5: Import models in the factory so Alembic can see them**

Add this line to `apps/api/app/__init__.py` inside `create_app()`, just before `return app`:

```python
    # Import models so Flask-Migrate/Alembic can detect them
    from .models import Role, User, Agency, UserAgencyAccess  # noqa: F401
```

- [ ] **Step 3.6: Verify import**

```bash
cd apps/api && uv run python -c "from app import create_app; app = create_app(); print('OK')" && cd ../..
```

Expected: prints `OK`, no errors.

- [ ] **Step 3.7: Commit**

```bash
rtk git add apps/api/app/models/
rtk git add apps/api/app/__init__.py
rtk git commit -m "feat(api): SQLAlchemy models for Role, User, Agency, UserAgencyAccess"
```

---

## Task 4: Alembic / Flask-Migrate setup

**Files:**
- Created automatically: `apps/api/migrations/`

- [ ] **Step 4.1: Initialise Flask-Migrate**

```bash
cd apps/api && uv run flask --app wsgi:app db init && cd ../..
```

Expected: `apps/api/migrations/` directory created with `alembic.ini` and `env.py`.

- [ ] **Step 4.2: Generate the initial migration**

```bash
cd apps/api && uv run flask --app wsgi:app db migrate -m "phase1 auth tables" && cd ../..
```

Expected: a migration file is created under `apps/api/migrations/versions/`.

- [ ] **Step 4.3: Verify migration file lists all 4 tables**

```bash
rtk ls apps/api/migrations/versions/
```

Open the generated file and confirm it creates `roles`, `users`, `agencies`, `user_agency_access`.

- [ ] **Step 4.4: Apply migration to a local Postgres (or skip and rely on compose)**

If you have a local Postgres:
```bash
cd apps/api && DATABASE_URL=postgresql://goventry:goventry@localhost:5432/goventry uv run flask --app wsgi:app db upgrade && cd ../..
```

Otherwise skip — this will run inside Docker in Task 16.

- [ ] **Step 4.5: Commit migrations**

```bash
rtk git add apps/api/migrations/
rtk git commit -m "feat(api): Alembic initial migration — roles, users, agencies, user_agency_access"
```

---

## Task 5: Test conftest

**Files:**
- Create: `apps/api/tests/conftest.py`

- [ ] **Step 5.1: Write conftest**

```python
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
```

- [ ] **Step 5.2: Verify conftest loads (no test file yet)**

```bash
cd apps/api && uv run pytest tests/ --collect-only 2>&1 | head -20 && cd ../..
```

Expected: `no tests ran` with no import errors.

- [ ] **Step 5.3: Commit**

```bash
rtk git add apps/api/tests/conftest.py
rtk git commit -m "test(api): pytest conftest with SQLite in-memory fixtures"
```

---

## Task 6: Auth service (TDD)

**Files:**
- Create: `apps/api/app/services/auth_service.py`
- Create: `apps/api/tests/test_auth_service.py`

- [ ] **Step 6.1: Write the failing tests**

```python
# apps/api/tests/test_auth_service.py
from app.services.auth_service import auth_service
from app.models.user import User
from app.models.role import Role
from app.extensions import db


def test_hash_and_verify(app):
    hashed = auth_service.hash_password("mypassword")
    assert hashed != "mypassword"
    assert auth_service.verify_password("mypassword", hashed) is True
    assert auth_service.verify_password("wrong", hashed) is False


def test_authenticate_success(app):
    with app.app_context():
        role = db.session.scalar(db.select(Role).where(Role.name == "PM"))
        user = User(
            email="pm@test.com",
            name="PM User",
            role=role,
            password_hash=auth_service.hash_password("secret"),
        )
        db.session.add(user)
        db.session.commit()

        result = auth_service.authenticate("pm@test.com", "secret")
        assert result is not None
        assert result.email == "pm@test.com"


def test_authenticate_wrong_password(app):
    with app.app_context():
        role = db.session.scalar(db.select(Role).where(Role.name == "PM"))
        user = User(
            email="pm2@test.com",
            name="PM User 2",
            role=role,
            password_hash=auth_service.hash_password("correct"),
        )
        db.session.add(user)
        db.session.commit()

        assert auth_service.authenticate("pm2@test.com", "wrong") is None


def test_authenticate_unknown_email(app):
    assert auth_service.authenticate("nobody@test.com", "pw") is None


def test_authenticate_inactive_user(app):
    with app.app_context():
        role = db.session.scalar(db.select(Role).where(Role.name == "PM"))
        user = User(
            email="inactive@test.com",
            name="Inactive",
            role=role,
            password_hash=auth_service.hash_password("pw"),
            is_active=False,
        )
        db.session.add(user)
        db.session.commit()

        assert auth_service.authenticate("inactive@test.com", "pw") is None


def test_create_token_returns_string(app, admin_user):
    with app.app_context():
        from app.extensions import db as _db
        from app.models.user import User as U
        user = _db.session.get(U, admin_user.id)
        token = auth_service.create_token(user)
        assert isinstance(token, str)
        assert len(token) > 20
```

- [ ] **Step 6.2: Run to verify they fail**

```bash
cd apps/api && uv run pytest tests/test_auth_service.py -v 2>&1 | head -30 && cd ../..
```

Expected: `ModuleNotFoundError` or `ImportError` — auth_service doesn't exist yet.

- [ ] **Step 6.3: Write `services/auth_service.py`**

```python
# apps/api/app/services/auth_service.py
from passlib.context import CryptContext
from flask_jwt_extended import create_access_token
from ..models.user import User
from ..extensions import db

_pwd_ctx = CryptContext(schemes=["bcrypt"], deprecated="auto")


class AuthService:
    def hash_password(self, plain: str) -> str:
        return _pwd_ctx.hash(plain)

    def verify_password(self, plain: str, hashed: str) -> bool:
        return _pwd_ctx.verify(plain, hashed)

    def authenticate(self, email: str, password: str) -> User | None:
        user = db.session.scalar(
            db.select(User).where(User.email == email, User.is_active == True)
        )
        if user is None or user.password_hash is None:
            return None
        if not self.verify_password(password, user.password_hash):
            return None
        return user

    def create_token(self, user: User) -> str:
        return create_access_token(
            identity=str(user.id),
            additional_claims={"role": user.role.name if user.role else None},
        )


auth_service = AuthService()
```

- [ ] **Step 6.4: Run tests — they should pass**

```bash
cd apps/api && uv run pytest tests/test_auth_service.py -v && cd ../..
```

Expected: all 6 tests pass.

- [ ] **Step 6.5: Commit**

```bash
rtk git add apps/api/app/services/auth_service.py apps/api/tests/test_auth_service.py
rtk git commit -m "feat(api): AuthService with bcrypt password hashing and JWT token creation"
```

---

## Task 7: Auth routes (TDD)

**Files:**
- Create: `apps/api/app/routes/auth.py`
- Modify: `apps/api/app/routes/__init__.py`
- Create: `apps/api/tests/test_auth_routes.py`

- [ ] **Step 7.1: Write the failing tests**

```python
# apps/api/tests/test_auth_routes.py


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
```

- [ ] **Step 7.2: Run to verify they fail**

```bash
cd apps/api && uv run pytest tests/test_auth_routes.py -v 2>&1 | head -30 && cd ../..
```

Expected: `404` on the endpoints — routes don't exist yet.

- [ ] **Step 7.3: Write `routes/auth.py`**

```python
# apps/api/app/routes/auth.py
from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from ..services.auth_service import auth_service
from ..models.user import User
from ..extensions import db

bp = Blueprint("auth", __name__, url_prefix="/auth")


def _user_dict(user: User) -> dict:
    return {
        "id": user.id,
        "email": user.email,
        "name": user.name,
        "role": user.role.name if user.role else None,
    }


@bp.post("/login")
def login():
    data = request.get_json(silent=True) or {}
    user = auth_service.authenticate(
        data.get("email", ""), data.get("password", "")
    )
    if user is None:
        return jsonify({"error": "Invalid credentials"}), 401
    token = auth_service.create_token(user)
    return jsonify({"token": token, "user": _user_dict(user)})


@bp.post("/logout")
def logout():
    # Stateless JWT: client discards the token. Future: add a denylist here.
    return jsonify({"ok": True})


@bp.get("/me")
@jwt_required()
def me():
    user_id = int(get_jwt_identity())
    user = db.session.get(User, user_id)
    if user is None or not user.is_active:
        return jsonify({"error": "User not found"}), 404
    return jsonify(_user_dict(user))
```

- [ ] **Step 7.4: Run tests — they should pass**

```bash
cd apps/api && uv run pytest tests/test_auth_routes.py -v && cd ../..
```

Expected: all 8 tests pass.

- [ ] **Step 7.5: Commit**

```bash
rtk git add apps/api/app/routes/auth.py apps/api/tests/test_auth_routes.py
rtk git commit -m "feat(api): auth routes — login, logout, /auth/me with JWT"
```

---

## Task 8: RBAC decorator (TDD)

**Files:**
- Create: `apps/api/app/middleware/auth_middleware.py`
- Create: `apps/api/tests/test_rbac.py`

- [ ] **Step 8.1: Write the failing tests**

```python
# apps/api/tests/test_rbac.py
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
```

- [ ] **Step 8.2: Run to confirm they fail**

```bash
cd apps/api && uv run pytest tests/test_rbac.py -v 2>&1 | head -30 && cd ../..
```

Expected: fails because `/admin/users` doesn't exist yet.

- [ ] **Step 8.3: Write `middleware/auth_middleware.py`**

```python
# apps/api/app/middleware/auth_middleware.py
from functools import wraps
from flask import jsonify
from flask_jwt_extended import jwt_required, get_jwt


def require_role(*roles: str):
    """Decorator: require JWT + one of the named roles.

    Usage:
        @bp.post("/admin/users")
        @require_role("Admin")
        def create_user(): ...
    """
    def decorator(fn):
        @wraps(fn)
        @jwt_required()
        def wrapper(*args, **kwargs):
            claims = get_jwt()
            user_role = claims.get("role")
            if user_role not in roles:
                return jsonify({"error": "Forbidden"}), 403
            return fn(*args, **kwargs)
        return wrapper
    return decorator
```

- [ ] **Step 8.4: Write `routes/admin.py`**

```python
# apps/api/app/routes/admin.py
from flask import Blueprint, request, jsonify
from ..extensions import db
from ..models.role import Role
from ..models.user import User
from ..services.auth_service import auth_service
from ..middleware.auth_middleware import require_role

bp = Blueprint("admin", __name__, url_prefix="/admin")


@bp.post("/users")
@require_role("Admin")
def create_user():
    data = request.get_json(silent=True) or {}
    if not data.get("email") or not data.get("name"):
        return jsonify({"error": "email and name are required"}), 400

    role = db.session.scalar(db.select(Role).where(Role.name == data.get("role")))
    password_hash = auth_service.hash_password(data["password"]) if data.get("password") else None

    user = User(
        email=data["email"],
        name=data["name"],
        role=role,
        password_hash=password_hash,
    )
    db.session.add(user)
    db.session.commit()
    return jsonify({"id": user.id, "email": user.email, "name": user.name}), 201


@bp.patch("/users/<int:user_id>")
@require_role("Admin")
def update_user(user_id: int):
    user = db.session.get(User, user_id)
    if user is None:
        return jsonify({"error": "Not found"}), 404

    data = request.get_json(silent=True) or {}
    if "name" in data:
        user.name = data["name"]
    if "role" in data:
        role = db.session.scalar(db.select(Role).where(Role.name == data["role"]))
        user.role = role
    if "is_active" in data:
        user.is_active = bool(data["is_active"])
    if "password" in data and data["password"]:
        user.password_hash = auth_service.hash_password(data["password"])

    db.session.commit()
    return jsonify({"id": user.id, "email": user.email, "name": user.name})
```

- [ ] **Step 8.5: Run all tests**

```bash
cd apps/api && uv run pytest tests/ -v && cd ../..
```

Expected: all tests pass (test_auth_service, test_auth_routes, test_rbac).

- [ ] **Step 8.6: Commit**

```bash
rtk git add apps/api/app/middleware/auth_middleware.py apps/api/app/routes/admin.py apps/api/tests/test_rbac.py
rtk git commit -m "feat(api): RBAC require_role decorator + admin user management routes"
```

---

## Task 9: Vite + Tailwind scaffold

**Files:**
- Create: `apps/web/package.json`
- Create: `apps/web/vite.config.ts`
- Create: `apps/web/tsconfig.json`
- Create: `apps/web/tsconfig.node.json`
- Create: `apps/web/postcss.config.js`
- Create: `apps/web/tailwind.config.ts`
- Create: `apps/web/index.html`
- Create: `apps/web/src/main.tsx`
- Create: `apps/web/src/index.css`

- [ ] **Step 9.1: Write `package.json`**

```json
{
  "name": "goventry-web",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "react": "^19.1.0",
    "react-dom": "^19.1.0",
    "react-router-dom": "^7.6.0",
    "@tanstack/react-query": "^5.65.0",
    "zod": "^3.24.0"
  },
  "devDependencies": {
    "@types/react": "^19.1.0",
    "@types/react-dom": "^19.1.0",
    "@vitejs/plugin-react": "^4.3.4",
    "typescript": "~5.8.0",
    "vite": "^6.3.0",
    "tailwindcss": "^3.4.0",
    "autoprefixer": "^10.4.0",
    "postcss": "^8.4.0"
  }
}
```

- [ ] **Step 9.2: Install frontend dependencies**

```bash
cd apps/web && npm install && cd ../..
```

Expected: `node_modules/` created, no errors.

- [ ] **Step 9.3: Write `vite.config.ts`**

```typescript
// apps/web/vite.config.ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/auth": "http://localhost:5000",
      "/admin": "http://localhost:5000",
      "/issues": "http://localhost:5000",
    },
  },
});
```

- [ ] **Step 9.4: Write `tsconfig.json`**

```json
{
  "files": [],
  "references": [
    { "path": "./tsconfig.node.json" },
    { "path": "./tsconfig.app.json" }
  ]
}
```

- [ ] **Step 9.5: Write `tsconfig.node.json`**

```json
{
  "compilerOptions": {
    "tsBuildInfoFile": "./node_modules/.tmp/tsconfig.node.tsbuildinfo",
    "target": "ES2022",
    "lib": ["ES2023"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "moduleDetection": "force",
    "noEmit": true,
    "strict": true
  },
  "include": ["vite.config.ts"]
}
```

- [ ] **Step 9.6: Write `tsconfig.app.json`**

```json
{
  "compilerOptions": {
    "tsBuildInfoFile": "./node_modules/.tmp/tsconfig.app.tsbuildinfo",
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "moduleDetection": "force",
    "jsx": "react-jsx",
    "noEmit": true,
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true
  },
  "include": ["src"]
}
```

- [ ] **Step 9.7: Write Tailwind config files**

```javascript
// apps/web/postcss.config.js
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
```

```typescript
// apps/web/tailwind.config.ts
import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: { extend: {} },
  plugins: [],
} satisfies Config;
```

- [ ] **Step 9.8: Write `index.html`**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>GovEntry Support</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 9.9: Write `src/index.css`**

```css
/* apps/web/src/index.css */
@tailwind base;
@tailwind components;
@tailwind utilities;
```

- [ ] **Step 9.10: Write `src/main.tsx` (placeholder — App.tsx comes in Task 13)**

```tsx
// apps/web/src/main.tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";

const root = document.getElementById("root")!;
createRoot(root).render(
  <StrictMode>
    <div className="p-8 text-gray-700">GovEntry Support — loading…</div>
  </StrictMode>
);
```

- [ ] **Step 9.11: Verify Vite starts**

```bash
cd apps/web && npm run dev -- --port 5173 &
sleep 3 && curl -s http://localhost:5173 | head -5
kill %1 2>/dev/null
cd ../..
```

Expected: HTML response with `GovEntry Support`.

- [ ] **Step 9.12: Commit**

```bash
rtk git add apps/web/
rtk git commit -m "feat(web): Vite + React + TypeScript + Tailwind scaffold"
```

---

## Task 10: API client

**Files:**
- Create: `apps/web/src/lib/api.ts`

- [ ] **Step 10.1: Write `src/lib/api.ts`**

```typescript
// apps/web/src/lib/api.ts
const BASE_URL = import.meta.env.VITE_API_URL ?? "";

// --- Token storage ---

export function getToken(): string | null {
  return localStorage.getItem("goventry_token");
}

export function setToken(token: string): void {
  localStorage.setItem("goventry_token", token);
}

export function clearToken(): void {
  localStorage.removeItem("goventry_token");
}

// --- Fetch wrapper ---

class ApiError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(init.headers as Record<string, string> | undefined),
  };
  const res = await fetch(`${BASE_URL}${path}`, { ...init, headers });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(res.status, (body as { error?: string }).error ?? res.statusText);
  }
  return res.json() as Promise<T>;
}

// --- Types ---

export interface AuthUser {
  id: number;
  email: string;
  name: string;
  role: string | null;
}

// --- Auth endpoints ---

export const api = {
  login(email: string, password: string) {
    return request<{ token: string; user: AuthUser }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
  },

  logout() {
    return request<{ ok: boolean }>("/auth/logout", { method: "POST" });
  },

  me() {
    return request<AuthUser>("/auth/me");
  },
};

export { ApiError };
```

- [ ] **Step 10.2: Commit**

```bash
rtk git add apps/web/src/lib/api.ts
rtk git commit -m "feat(web): API client with token management and fetch wrapper"
```

---

## Task 11: Auth context

**Files:**
- Create: `apps/web/src/lib/auth.tsx`

- [ ] **Step 11.1: Write `src/lib/auth.tsx`**

```tsx
// apps/web/src/lib/auth.tsx
import {
  createContext,
  useContext,
  useState,
  useEffect,
  type ReactNode,
} from "react";
import { api, type AuthUser, setToken, clearToken } from "./api";

interface AuthContextValue {
  user: AuthUser | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    api
      .me()
      .then(setUser)
      .catch(() => setUser(null))
      .finally(() => setIsLoading(false));
  }, []);

  async function login(email: string, password: string): Promise<void> {
    const { token, user } = await api.login(email, password);
    setToken(token);
    setUser(user);
  }

  async function logout(): Promise<void> {
    await api.logout().catch(() => undefined);
    clearToken();
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, isLoading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (ctx === null) {
    throw new Error("useAuth must be used inside <AuthProvider>");
  }
  return ctx;
}
```

- [ ] **Step 11.2: Commit**

```bash
rtk git add apps/web/src/lib/auth.tsx
rtk git commit -m "feat(web): AuthContext with login/logout and auto-restore via /auth/me"
```

---

## Task 12: Login page

**Files:**
- Create: `apps/web/src/pages/LoginPage.tsx`

- [ ] **Step 12.1: Write `src/pages/LoginPage.tsx`**

```tsx
// apps/web/src/pages/LoginPage.tsx
import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { z } from "zod";
import { useAuth } from "../lib/auth";

const schema = z.object({
  email: z.string().email("Enter a valid email address"),
  password: z.string().min(1, "Password is required"),
});

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const result = schema.safeParse({
      email: fd.get("email"),
      password: fd.get("password"),
    });
    if (!result.success) {
      setError(result.error.errors[0].message);
      return;
    }
    setIsSubmitting(true);
    setError("");
    try {
      await login(result.data.email, result.data.password);
      navigate("/", { replace: true });
    } catch {
      setError("Invalid email or password");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="w-full max-w-sm bg-white rounded-lg shadow-md p-8">
        <h1 className="text-2xl font-semibold text-gray-900 mb-1">GovEntry Support</h1>
        <p className="text-sm text-gray-500 mb-6">Internal team portal</p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          {error && (
            <p role="alert" className="text-sm text-red-600">
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full bg-blue-600 text-white rounded-md py-2 text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {isSubmitting ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}
```

- [ ] **Step 12.2: Commit**

```bash
rtk git add apps/web/src/pages/LoginPage.tsx
rtk git commit -m "feat(web): login page with Zod validation and error display"
```

---

## Task 13: ProtectedRoute, AppShell, and routing

**Files:**
- Create: `apps/web/src/components/ProtectedRoute.tsx`
- Create: `apps/web/src/components/AppShell.tsx`
- Create: `apps/web/src/App.tsx`
- Modify: `apps/web/src/main.tsx`

- [ ] **Step 13.1: Write `src/components/ProtectedRoute.tsx`**

```tsx
// apps/web/src/components/ProtectedRoute.tsx
import { Navigate } from "react-router-dom";
import { useAuth } from "../lib/auth";
import type { ReactNode } from "react";

export default function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-gray-400 text-sm">
        Loading…
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}
```

- [ ] **Step 13.2: Write `src/components/AppShell.tsx`**

```tsx
// apps/web/src/components/AppShell.tsx
import { Link, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../lib/auth";

const NAV_ITEMS = [{ to: "/", label: "Tickets" }];

function NavLink({ to, label }: { to: string; label: string }) {
  const { pathname } = useLocation();
  const active = pathname === to;
  return (
    <Link
      to={to}
      className={`block px-3 py-2 rounded text-sm transition-colors ${
        active ? "bg-gray-700 text-white" : "text-gray-300 hover:bg-gray-700 hover:text-white"
      }`}
    >
      {label}
    </Link>
  );
}

export default function AppShell() {
  const { user, logout } = useAuth();

  return (
    <div className="min-h-screen flex">
      <aside className="w-56 bg-gray-900 flex flex-col flex-shrink-0">
        <div className="px-4 py-5 border-b border-gray-700">
          <p className="text-white font-semibold text-sm leading-tight">GovEntry Support</p>
          <p className="text-gray-400 text-xs mt-0.5">Internal portal</p>
        </div>
        <nav className="flex-1 p-3 space-y-0.5">
          {NAV_ITEMS.map((item) => (
            <NavLink key={item.to} {...item} />
          ))}
        </nav>
        <div className="p-4 border-t border-gray-700">
          <p className="text-gray-200 text-sm font-medium truncate">{user?.name}</p>
          <p className="text-gray-400 text-xs">{user?.role ?? "—"}</p>
          <button
            onClick={logout}
            className="mt-2 text-xs text-gray-400 hover:text-white transition-colors"
          >
            Sign out
          </button>
        </div>
      </aside>
      <main className="flex-1 overflow-auto bg-gray-50">
        <Outlet />
      </main>
    </div>
  );
}
```

- [ ] **Step 13.3: Write `src/App.tsx`**

```tsx
// apps/web/src/App.tsx
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "./lib/auth";
import ProtectedRoute from "./components/ProtectedRoute";
import AppShell from "./components/AppShell";
import LoginPage from "./pages/LoginPage";

const queryClient = new QueryClient();

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route
              path="/"
              element={
                <ProtectedRoute>
                  <AppShell />
                </ProtectedRoute>
              }
            >
              <Route
                index
                element={
                  <div className="p-8 text-gray-400 text-sm">
                    Ticket dashboard — coming in Phase 2
                  </div>
                }
              />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
}
```

- [ ] **Step 13.4: Update `src/main.tsx` to mount `<App />`**

```tsx
// apps/web/src/main.tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
```

- [ ] **Step 13.5: Verify TypeScript**

```bash
cd apps/web && npm run build 2>&1 | tail -10 && cd ../..
```

Expected: build succeeds with no TypeScript errors. Output in `apps/web/dist/`.

- [ ] **Step 13.6: Commit**

```bash
rtk git add apps/web/src/
rtk git commit -m "feat(web): ProtectedRoute, AppShell, App routing — Phase 1 frontend complete"
```

---

## Task 14: Docker + compose

**Files:**
- Create: `infra/docker/api.Dockerfile`
- Create: `infra/docker/web.Dockerfile`
- Create: `infra/docker/nginx.conf`
- Create: `infra/compose.yaml`

- [ ] **Step 14.1: Write `infra/docker/api.Dockerfile`**

```dockerfile
# infra/docker/api.Dockerfile
FROM python:3.12-slim

WORKDIR /api

RUN pip install --no-cache-dir uv

COPY apps/api/pyproject.toml apps/api/uv.lock* ./
RUN uv sync --frozen --no-dev

COPY apps/api/ .

EXPOSE 5000
```

- [ ] **Step 14.2: Write `infra/docker/nginx.conf`**

```nginx
# infra/docker/nginx.conf
server {
    listen 80;
    root /usr/share/nginx/html;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

- [ ] **Step 14.3: Write `infra/docker/web.Dockerfile`**

```dockerfile
# infra/docker/web.Dockerfile
FROM node:22-slim AS build

WORKDIR /web
COPY apps/web/package*.json ./
RUN npm ci
COPY apps/web/ .
RUN npm run build

FROM nginx:alpine
COPY --from=build /web/dist /usr/share/nginx/html
COPY infra/docker/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
```

- [ ] **Step 14.4: Write `infra/compose.yaml`**

```yaml
# infra/compose.yaml
services:
  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: goventry
      POSTGRES_USER: goventry
      POSTGRES_PASSWORD: goventry
    ports:
      - "5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U goventry"]
      interval: 5s
      timeout: 3s
      retries: 5

  api:
    build:
      context: ..
      dockerfile: infra/docker/api.Dockerfile
    environment:
      DATABASE_URL: postgresql://goventry:goventry@db:5432/goventry
      JWT_SECRET_KEY: dev-secret-change-in-prod
      BOOTSTRAP_ADMIN_EMAIL: admin@goventry.gov.sg
      BOOTSTRAP_ADMIN_PASSWORD: changeme
      CORS_ORIGINS: '["http://localhost:5173","http://localhost"]'
    ports:
      - "5000:5000"
    depends_on:
      db:
        condition: service_healthy
    command: >
      sh -c "uv run flask --app wsgi:app db upgrade &&
             uv run flask --app wsgi:app bootstrap-admin &&
             uv run gunicorn --bind 0.0.0.0:5000 --workers 2 wsgi:app"

  web:
    build:
      context: ..
      dockerfile: infra/docker/web.Dockerfile
    ports:
      - "5173:80"
    depends_on:
      - api

volumes:
  pgdata:
```

- [ ] **Step 14.5: Commit**

```bash
rtk git add infra/
rtk git commit -m "feat(infra): Docker + compose for api (Flask/Gunicorn) + web (Vite/nginx) + Postgres"
```

---

## Task 15: End-to-end smoke test

Verify the full stack works: Docker compose up → admin logs in via the Vite frontend → `/auth/me` returns the user.

- [ ] **Step 15.1: Build and start the stack**

```bash
docker compose -f infra/compose.yaml up --build -d
```

Wait for all services to be healthy (takes ~60 seconds on first build):
```bash
docker compose -f infra/compose.yaml ps
```

Expected: all three services (`db`, `api`, `web`) show `running` or `healthy`.

- [ ] **Step 15.2: Check API health**

```bash
curl -s -o /dev/null -w "%{http_code}" http://localhost:5000/auth/me
```

Expected: `401` (not 500 — server is up and JWT guard is working).

- [ ] **Step 15.3: Log in as the bootstrap admin**

```bash
curl -s -X POST http://localhost:5000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@goventry.gov.sg","password":"changeme"}' | python3 -m json.tool
```

Expected: JSON with `token` string and `user.role == "Admin"`.

- [ ] **Step 15.4: Call /auth/me with the token**

```bash
TOKEN=$(curl -s -X POST http://localhost:5000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@goventry.gov.sg","password":"changeme"}' | python3 -c "import sys,json; print(json.load(sys.stdin)['token'])")

curl -s -H "Authorization: Bearer $TOKEN" http://localhost:5000/auth/me | python3 -m json.tool
```

Expected: `{"email": "admin@goventry.gov.sg", "id": 1, "name": "Admin", "role": "Admin"}`.

- [ ] **Step 15.5: Open the Vite frontend in a browser**

```bash
open http://localhost:5173
```

Expected: login page appears (gray background, "GovEntry Support" heading, email + password fields).

- [ ] **Step 15.6: Log in via the browser**

Enter `admin@goventry.gov.sg` / `changeme` and submit. Expected: redirects to `/`, shows the app shell (dark sidebar with "GovEntry Support", name "Admin", role "Admin", "Sign out" button).

- [ ] **Step 15.7: Confirm RBAC — non-admin cannot create users**

```bash
# Create a PM user as admin
curl -s -X POST http://localhost:5000/admin/users \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"email":"pm@goventry.gov.sg","name":"Roy Tan","role":"PM","password":"pw"}' | python3 -m json.tool

# Get PM token
PM_TOKEN=$(curl -s -X POST http://localhost:5000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"pm@goventry.gov.sg","password":"pw"}' | python3 -c "import sys,json; print(json.load(sys.stdin)['token'])")

# PM tries to create a user — should be 403
curl -s -o /dev/null -w "%{http_code}" \
  -X POST http://localhost:5000/admin/users \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $PM_TOKEN" \
  -d '{"email":"x@test.com","name":"X","role":"PM","password":"pw"}'
```

Expected: `403`.

- [ ] **Step 15.8: Stop compose**

```bash
docker compose -f infra/compose.yaml down
```

- [ ] **Step 15.9: Final commit**

```bash
rtk git add docs/superpowers/
rtk git commit -m "docs: v2 design spec and Phase 1 implementation plan"
```

---

## Self-Review

**Spec coverage check:**
- [x] Flask app factory + JWT + SQLAlchemy → Tasks 2–4
- [x] User, Role, Agency, UserAgencyAccess models → Task 3
- [x] Alembic migrations → Task 4
- [x] `AuthService` behind an interface (SSO-swappable) → Task 6
- [x] `POST /auth/login`, `POST /auth/logout`, `GET /auth/me` → Task 7
- [x] `@require_role(...)` decorator → Task 8
- [x] `POST /admin/users`, `PATCH /admin/users/:id` → Task 8
- [x] Bootstrap admin from env vars → Task 2 (CLI command) + Task 15 (verified)
- [x] Vite + React + TS + Tailwind → Task 9
- [x] API client with token management → Task 10
- [x] Auth context + `useAuth` → Task 11
- [x] Login page with Zod validation → Task 12
- [x] ProtectedRoute + AppShell + routing → Task 13
- [x] Docker compose (api + web + Postgres) → Task 14
- [x] End-to-end smoke test → Task 15
- [x] Existing Next.js app untouched → enforced via "not touched" note in File Map

**Placeholder scan:** None found. Every step has complete code.

**Type consistency:** `AuthUser` defined in `api.ts` is used consistently in `auth.tsx` and `AppShell.tsx`. `User` SQLAlchemy model is referenced consistently by `auth_service.py`, `auth.py`, and `admin.py`. `_user_dict()` helper in `auth.py` is used in both `login` and `me` endpoints.

---

## Phase 2 plan

After Phase 1 ships and the stack is running, the next plan covers:
- Full SQLAlchemy schema (issues, team_members, ticket_messages, knowledge_entries, issue_agencies, audit_logs)
- Ticket CRUD API with agency-scoped filtering
- Email service port (M365/Postman/Resend)
- Triage service port (Anthropic Python SDK, same tool-use loop)
- Vite ticket dashboard + detail view
- Demo data seed (agencies + team + sample tickets + KB docs)

See: `docs/superpowers/specs/2026-06-14-goventry-v2-rewrite-design.md` §Phase 2
