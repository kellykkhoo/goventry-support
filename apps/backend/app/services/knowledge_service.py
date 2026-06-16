# apps/backend/app/services/knowledge_service.py
# Python port of src/lib/search.ts — naive keyword-overlap scoring (no embeddings).
import re
from ..extensions import db
from ..models.knowledge_entry import KnowledgeEntry, SourceType, Visibility
from ..models.issue import Issue, Status
from ..models.agency import UserAgencyAccess

WRITE_ROLES = {"Admin", "PM", "Product Ops"}


def _tokens(text: str) -> set[str]:
    return {t for t in re.findall(r"[a-z0-9]+", (text or "").lower()) if len(t) > 2}


def _score(query_tokens: set[str], text: str) -> int:
    return len(query_tokens & _tokens(text))


class KnowledgeService:
    # ------------------------------------------------------------------
    # Existing search helpers
    # ------------------------------------------------------------------

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

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _allowed_agencies(self, user) -> list[int] | None:
        """Return list of agency IDs the user may see, or None meaning ALL (Admin)."""
        role = user.role.name if user.role else None
        if role == "Admin":
            return None
        rows = db.session.scalars(
            db.select(UserAgencyAccess.agency_id).where(UserAgencyAccess.user_id == user.id)
        ).all()
        return list(rows)

    def _require_write(self, user):
        role = user.role.name if user.role else None
        if role not in WRITE_ROLES:
            raise PermissionError("Role not allowed to modify knowledge entries")

    def _require_admin(self, user):
        role = user.role.name if user.role else None
        if role != "Admin":
            raise PermissionError("Only Admin may delete knowledge entries")

    def _check_scope(self, user, entry: KnowledgeEntry):
        """Raise PermissionError if user cannot access this entry."""
        allowed = self._allowed_agencies(user)
        if allowed is None:
            return  # Admin sees all
        if entry.agency_id is not None and entry.agency_id not in allowed:
            raise PermissionError("Out of agency scope")

    # ------------------------------------------------------------------
    # CRUD methods
    # ------------------------------------------------------------------

    def list_entries(
        self,
        user,
        search: str | None = None,
        visibility: str | None = None,
        agency_id_filter: int | None = None,
    ) -> list[KnowledgeEntry]:
        q = db.select(KnowledgeEntry)
        allowed = self._allowed_agencies(user)
        if allowed is not None:
            # Non-admin: see entries whose agency_id is in their allowed list OR is None (global)
            q = q.where(
                db.or_(
                    KnowledgeEntry.agency_id.in_(allowed),
                    KnowledgeEntry.agency_id.is_(None),
                )
            )
        if search:
            like = f"%{search}%"
            q = q.where(
                db.or_(
                    KnowledgeEntry.title.ilike(like),
                    KnowledgeEntry.content.ilike(like),
                )
            )
        if visibility:
            q = q.where(KnowledgeEntry.visibility == Visibility(visibility))
        if agency_id_filter is not None:
            q = q.where(KnowledgeEntry.agency_id == agency_id_filter)
        return list(db.session.scalars(q.order_by(KnowledgeEntry.created_at.desc())).all())

    def get_entry(self, user, entry_id: int) -> KnowledgeEntry:
        entry = db.session.get(KnowledgeEntry, entry_id)
        if entry is None:
            raise LookupError("Knowledge entry not found")
        self._check_scope(user, entry)
        return entry

    def create_entry(self, user, data: dict) -> KnowledgeEntry:
        self._require_write(user)
        agency_id = data.get("agency_id")
        # Non-admin cannot create entries for agencies outside their scope
        allowed = self._allowed_agencies(user)
        if allowed is not None and agency_id is not None and agency_id not in allowed:
            raise PermissionError("Out of agency scope")
        entry = KnowledgeEntry(
            title=data["title"],
            content=data["content"],
            source_type=SourceType(data.get("source_type", "doc")),
            visibility=Visibility(data.get("visibility", "internal_admin_only")),
            agency_id=agency_id,
            issue_id=data.get("issue_id"),
        )
        db.session.add(entry)
        db.session.commit()
        return entry

    def update_entry(self, user, entry_id: int, data: dict) -> KnowledgeEntry:
        self._require_write(user)
        entry = self.get_entry(user, entry_id)
        if "title" in data:
            entry.title = data["title"]
        if "content" in data:
            entry.content = data["content"]
        if "visibility" in data:
            entry.visibility = Visibility(data["visibility"])
        db.session.commit()
        return entry

    def delete_entry(self, user, entry_id: int) -> None:
        self._require_admin(user)
        entry = self.get_entry(user, entry_id)
        db.session.delete(entry)
        db.session.commit()


knowledge_service = KnowledgeService()
