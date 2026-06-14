def test_kb_search_matches_keywords_and_global(app, agencies):
    from app.extensions import db
    from app.models.knowledge_entry import KnowledgeEntry, SourceType, Visibility
    from app.services.knowledge_service import knowledge_service
    with app.app_context():
        db.session.add_all([
            KnowledgeEntry(title="Login troubleshooting", content="reset password steps",
                           source_type=SourceType.doc, visibility=Visibility.global_sanitized,
                           agency_id=None),
            KnowledgeEntry(title="Vendor onboarding", content="GovSupply vendor flow",
                           source_type=SourceType.doc, visibility=Visibility.agency_specific,
                           agency_id=agencies["NEA"]),
        ])
        db.session.commit()
        results = knowledge_service.search_knowledge_base("login password", agencies["MOH"])
        assert results
        assert results[0]["title"] == "Login troubleshooting"


def test_ticket_search_only_resolved_in_scope(app, agencies):
    from app.extensions import db
    from app.models.issue import Issue, Status, Priority, Source
    from app.services.knowledge_service import knowledge_service
    with app.app_context():
        db.session.add_all([
            Issue(title="Cannot reset password", description="password reset broken",
                  status=Status.Done, priority=Priority.Low, source=Source.web,
                  agency_id=agencies["MOH"], resolution_summary="Cleared cache, fixed."),
            Issue(title="Open bug", description="password thing", status=Status.Backlog,
                  priority=Priority.Low, source=Source.web, agency_id=agencies["MOH"]),
        ])
        db.session.commit()
        results = knowledge_service.search_tickets("password reset", agencies["MOH"])
        assert len(results) == 1
        assert results[0]["title"] == "Cannot reset password"
