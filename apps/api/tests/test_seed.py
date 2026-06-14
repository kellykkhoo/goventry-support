def test_seed_demo_populates(app):
    from app.extensions import db
    from app.commands.seed import seed_demo
    from app.models.agency import Agency
    from app.models.issue import Issue
    from app.models.team_member import TeamMember
    from app.models.knowledge_entry import KnowledgeEntry
    with app.app_context():
        seed_demo(if_empty=False)
        assert db.session.scalar(db.select(db.func.count()).select_from(Agency)) == 9
        assert db.session.scalar(db.select(db.func.count()).select_from(TeamMember)) == 3
        assert db.session.scalar(db.select(db.func.count()).select_from(Issue)) == 10
        assert db.session.scalar(db.select(db.func.count()).select_from(KnowledgeEntry)) == 6


def test_seed_idempotent_if_empty(app):
    from app.extensions import db
    from app.commands.seed import seed_demo
    from app.models.issue import Issue
    with app.app_context():
        seed_demo(if_empty=False)
        seed_demo(if_empty=True)  # second run is a no-op
        assert db.session.scalar(db.select(db.func.count()).select_from(Issue)) == 10
