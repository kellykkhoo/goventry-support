def test_team_member_persists(app):
    from app.extensions import db
    from app.models.team_member import TeamMember
    with app.app_context():
        tm = TeamMember(name="Roy Tan", role_label="PM")
        db.session.add(tm)
        db.session.commit()
        assert tm.id is not None
        assert tm.role_label == "PM"
