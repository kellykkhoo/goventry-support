# apps/backend/app/services/knowledge_service.py
# Python port of src/lib/search.ts — naive keyword-overlap scoring (no embeddings).
import re
from ..extensions import db
from ..models.knowledge_entry import KnowledgeEntry
from ..models.issue import Issue, Status


def _tokens(text: str) -> set[str]:
    return {t for t in re.findall(r"[a-z0-9]+", (text or "").lower()) if len(t) > 2}


def _score(query_tokens: set[str], text: str) -> int:
    return len(query_tokens & _tokens(text))


class KnowledgeService:
    def search_knowledge_base(self, query: str, agency_id: int | None) -> list[dict]:
        qt = _tokens(query)
        entries = db.session.scalars(
            db.select(KnowledgeEntry).where(
                db.or_(KnowledgeEntry.agency_id == agency_id, KnowledgeEntry.agency_id.is_(None))
            )
        ).all()
        scored = [(e, _score(qt, f"{e.title} {e.content}")) for e in entries]
        scored = [(e, s) for e, s in scored if s > 0]
        scored.sort(key=lambda x: x[1], reverse=True)
        return [
            {"id": e.id, "title": e.title, "content": e.content[:500], "score": s}
            for e, s in scored[:5]
        ]

    def search_tickets(self, query: str, agency_id: int | None) -> list[dict]:
        qt = _tokens(query)
        issues = db.session.scalars(
            db.select(Issue).where(Issue.status == Status.Done, Issue.agency_id == agency_id)
        ).all()
        scored = [
            (i, _score(qt, f"{i.title} {i.description} {i.resolution_summary or ''}"))
            for i in issues
        ]
        scored = [(i, s) for i, s in scored if s > 0]
        scored.sort(key=lambda x: x[1], reverse=True)
        return [
            {"id": i.id, "title": i.title, "resolution_summary": i.resolution_summary, "score": s}
            for i, s in scored[:5]
        ]


knowledge_service = KnowledgeService()
