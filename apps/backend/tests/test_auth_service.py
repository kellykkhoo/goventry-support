# apps/backend/tests/test_auth_service.py
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
