# apps/backend/app/__init__.py
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
    from .routes.seed import bp as seed_bp
    app.register_blueprint(auth_bp)
    app.register_blueprint(admin_bp)
    app.register_blueprint(issues_bp)
    app.register_blueprint(agencies_bp)
    app.register_blueprint(team_bp)
    app.register_blueprint(seed_bp)

    from .routes.approval import bp as approval_bp
    from .routes.webhooks import bp as webhooks_bp
    from .routes.knowledge import bp as knowledge_bp
    from .routes.reports import bp as reports_bp
    from .routes.hermes import bp as hermes_bp
    from .routes.slack import bp as slack_bp
    from .routes.feedback import bp as feedback_bp
    from .routes.gitlab import bp as gitlab_bp
    app.register_blueprint(approval_bp)
    app.register_blueprint(webhooks_bp)
    app.register_blueprint(knowledge_bp)
    app.register_blueprint(reports_bp)
    app.register_blueprint(hermes_bp)
    app.register_blueprint(slack_bp)
    app.register_blueprint(feedback_bp)
    app.register_blueprint(gitlab_bp)

    @app.get("/health")
    def health():
        return {"status": "ok"}

    import os
    from flask import send_from_directory

    _FRONTEND_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "static_frontend")

    @app.route("/", defaults={"path": ""})
    @app.route("/<path:path>")
    def serve_frontend(path):
        file_path = os.path.join(_FRONTEND_DIR, path)
        if path and os.path.exists(file_path):
            return send_from_directory(_FRONTEND_DIR, path)
        return send_from_directory(_FRONTEND_DIR, "index.html")

    from .commands import register_commands
    register_commands(app)

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
        ProposedAction, HermesReport, HermesJobRun, SlackDeliveryLog, DraftFeedback,
        GitLabIssueProposal,
    )

    return app
