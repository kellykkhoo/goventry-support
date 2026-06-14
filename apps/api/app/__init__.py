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
    from .routes.issues import bp as issues_bp
    from .routes.agencies import bp as agencies_bp
    from .routes.team import bp as team_bp
    app.register_blueprint(auth_bp)
    app.register_blueprint(admin_bp)
    app.register_blueprint(issues_bp)
    app.register_blueprint(agencies_bp)
    app.register_blueprint(team_bp)

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

    # Import models so Flask-Migrate/Alembic can detect them
    from .models import (  # noqa: F401
        Role, User, Agency, UserAgencyAccess, TeamMember,
        Issue, IssueAgency, TicketMessage, KnowledgeEntry, AuditLog,
    )

    return app
