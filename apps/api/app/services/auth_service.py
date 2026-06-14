# apps/api/app/services/auth_service.py
import bcrypt
from flask_jwt_extended import create_access_token
from ..models.user import User
from ..extensions import db


class AuthService:
    def hash_password(self, plain: str) -> str:
        return bcrypt.hashpw(plain.encode(), bcrypt.gensalt()).decode()

    def verify_password(self, plain: str, hashed: str) -> bool:
        try:
            return bcrypt.checkpw(plain.encode(), hashed.encode())
        except Exception:
            return False

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
