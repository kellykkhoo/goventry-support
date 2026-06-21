# apps/backend/app/services/docs_importer.py
import re
import httpx
from html.parser import HTMLParser
from urllib.parse import urljoin, urlparse

PUBLIC_DOCS: dict[str, list[str]] = {
    "GovEntry": [
        "https://docs.developer.tech.gov.sg/docs/02-integration-with-goventry/",
        "https://docs.developer.tech.gov.sg/docs/03-webhook-specifications/",
        "https://docs.developer.tech.gov.sg/docs/04-api-specifications/",
    ],
    "GovRewards": [
        "https://docs.developer.tech.gov.sg/docs/govrewards-user-guide/?product=GovRewards",
    ],
    "GovSupply": [
        "https://docs.developer.tech.gov.sg/docs/govsupply/?product=GovSupply",
    ],
}

_SKIP_TAGS = {"script", "style", "nav", "header", "footer", "aside"}


class _TextExtractor(HTMLParser):
    def __init__(self):
        super().__init__()
        self._parts: list[str] = []
        self._depth = 0

    def handle_starttag(self, tag, attrs):
        if tag in _SKIP_TAGS:
            self._depth += 1

    def handle_endtag(self, tag):
        if tag in _SKIP_TAGS and self._depth > 0:
            self._depth -= 1

    def handle_data(self, data):
        if self._depth == 0:
            stripped = data.strip()
            if stripped:
                self._parts.append(stripped)

    def get_text(self) -> str:
        return re.sub(r"\s+", " ", " ".join(self._parts)).strip()


def _extract_sub_links(html: str, base_url: str) -> list[str]:
    parsed = urlparse(base_url)
    base_path = re.sub(r"\?.*", "", parsed.path).rstrip("/")
    seen: set[str] = set()
    results: list[str] = []
    for href in re.findall(r'href=["\']([^"\'#]+)["\']', html):
        full = urljoin(base_url, href.split("?")[0])
        p = urlparse(full)
        if (
            p.netloc == parsed.netloc
            and p.path.rstrip("/") != base_path
            and p.path.startswith(base_path + "/")
            and full not in seen
        ):
            seen.add(full)
            results.append(full)
        if len(results) >= 30:
            break
    return results


def _html_to_text(html: str) -> str:
    parser = _TextExtractor()
    parser.feed(html)
    return parser.get_text()


def fetch_doc_content(url: str) -> str:
    """Fetch a doc URL at runtime and return cleaned text (used by triage tool)."""
    try:
        with httpx.Client(verify=False, timeout=15, headers={"User-Agent": "GovEntrySupport/1.0"}) as client:
            resp = client.get(url, follow_redirects=True)
            resp.raise_for_status()
            return _html_to_text(resp.text)[:8000]
    except Exception as exc:
        return f"[Error fetching {url}: {exc}]"


def seed_all_docs(db) -> list[str]:
    """
    Fetch all PUBLIC_DOCS URLs plus one level of sub-pages, store as KnowledgeEntries.
    Replaces previously seeded global doc entries to stay current.
    Returns list of entry titles created.
    """
    from ..models.knowledge_entry import KnowledgeEntry, SourceType, Visibility

    stale = db.session.scalars(
        db.select(KnowledgeEntry).where(
            KnowledgeEntry.source_type == SourceType.doc,
            KnowledgeEntry.visibility == Visibility.global_sanitized,
            KnowledgeEntry.agency_id.is_(None),
        )
    ).all()
    for e in stale:
        if e.title.startswith("[Gov"):
            db.session.delete(e)
    db.session.flush()

    created: list[str] = []
    with httpx.Client(
        verify=False, timeout=20, follow_redirects=True,
        headers={"User-Agent": "GovEntrySupport/1.0"},
    ) as client:
        for product, urls in PUBLIC_DOCS.items():
            for base_url in urls:
                try:
                    resp = client.get(base_url)
                    resp.raise_for_status()
                    html = resp.text
                except Exception as exc:
                    created.append(f"[ERROR] {base_url}: {exc}")
                    continue

                text = _html_to_text(html)
                section = re.sub(r"\?.*", "", base_url).split("/docs/")[-1].strip("/") or "index"
                entry = KnowledgeEntry(
                    title=f"[{product}] {section}",
                    content=f"Source: {base_url}\n\n{text[:6000]}",
                    source_type=SourceType.doc,
                    visibility=Visibility.global_sanitized,
                )
                db.session.add(entry)
                created.append(entry.title)

                for sub_url in _extract_sub_links(html, base_url):
                    try:
                        sub_resp = client.get(sub_url)
                        sub_resp.raise_for_status()
                        sub_text = _html_to_text(sub_resp.text)
                    except Exception:
                        continue
                    sub_section = sub_url.split("/docs/")[-1].strip("/")
                    sub_entry = KnowledgeEntry(
                        title=f"[{product}] {sub_section}",
                        content=f"Source: {sub_url}\n\n{sub_text[:6000]}",
                        source_type=SourceType.doc,
                        visibility=Visibility.global_sanitized,
                    )
                    db.session.add(sub_entry)
                    created.append(sub_entry.title)

    db.session.commit()
    return created
