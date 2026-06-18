# apps/backend/app/services/gitlab_service.py
import base64
from urllib.parse import quote
import httpx
from flask import current_app

REPOS = {
    "goventry": "wog/gvt/gdsacedndgoventr/goventry/registration",
    "govrewards": "wog/gvt/govrewards/govrewards/govrewards-core",
    "govsupply": "wog/gvt/govdistribute/govdistribute/supply/supply-core",
}

REPO_LABELS = {
    "goventry": "GovEntry",
    "govrewards": "GovRewards",
    "govsupply": "GovSupply",
}


class GitLabService:
    def _cfg(self):
        cfg = current_app.config["_APP_CONFIG"]
        if not cfg.GITLAB_TOKEN:
            raise ValueError("GITLAB_TOKEN is not configured")
        return cfg.GITLAB_TOKEN, cfg.GITLAB_BASE_URL.rstrip("/")

    def _headers(self) -> dict:
        token, _ = self._cfg()
        return {"PRIVATE-TOKEN": token}

    def _project_url(self, repo: str) -> str:
        _, base = self._cfg()
        path = REPOS.get(repo)
        if not path:
            raise ValueError(f"Unknown repo key '{repo}'. Valid: {list(REPOS)}")
        return f"{base}/api/v4/projects/{quote(path, safe='')}"

    # ------------------------------------------------------------------
    # Docs search — always queries live main branch
    # ------------------------------------------------------------------

    def search_docs(self, query: str, repos: list[str] | None = None) -> list[dict]:
        """Search blobs across one or more repos. Returns up to 5 hits per repo."""
        targets = repos or list(REPOS.keys())
        results = []
        with httpx.Client(timeout=20, verify=False) as client:
            for repo in targets:
                try:
                    r = client.get(
                        f"{self._project_url(repo)}/search",
                        headers=self._headers(),
                        params={"scope": "blobs", "search": query, "ref": "main"},
                    )
                    if r.status_code != 200:
                        continue
                    for hit in r.json()[:5]:
                        results.append({
                            "repo": repo,
                            "repo_label": REPO_LABELS[repo],
                            "path": hit.get("path", ""),
                            "filename": hit.get("basename", ""),
                            "snippet": (hit.get("data") or "")[:600],
                            "startline": hit.get("startline"),
                        })
                except httpx.RequestError:
                    # network error for this repo — skip and continue
                    pass
        return results

    # ------------------------------------------------------------------
    # File retrieval
    # ------------------------------------------------------------------

    def get_file(self, repo: str, file_path: str, ref: str = "main") -> dict:
        """Fetch a specific file from a repo. Returns decoded text content."""
        url = f"{self._project_url(repo)}/repository/files/{quote(file_path, safe='')}"
        with httpx.Client(timeout=20, verify=False) as client:
            r = client.get(url, headers=self._headers(), params={"ref": ref})
        if r.status_code == 404:
            raise LookupError(f"File not found: {file_path} in {repo}@{ref}")
        r.raise_for_status()
        data = r.json()
        content = base64.b64decode(data["content"]).decode("utf-8", errors="replace")
        return {
            "repo": repo,
            "repo_label": REPO_LABELS[repo],
            "path": data["file_path"],
            "ref": data["ref"],
            "size": data.get("size"),
            "content": content,
        }

    # ------------------------------------------------------------------
    # Issue creation (requires 'api' scope PAT, not just read_repository)
    # ------------------------------------------------------------------

    def create_issue(self, repo: str, title: str, description: str, labels: list[str]) -> dict:
        """Create a GitLab issue. Needs a PAT with 'api' scope."""
        url = f"{self._project_url(repo)}/issues"
        with httpx.Client(timeout=20, verify=False) as client:
            r = client.post(
                url,
                headers=self._headers(),
                json={"title": title, "description": description, "labels": ",".join(labels)},
            )
        if r.status_code == 403:
            raise PermissionError(
                "GitLab token lacks 'api' scope. Re-create your PAT with api scope to create issues."
            )
        r.raise_for_status()
        data = r.json()
        return {"iid": data["iid"], "url": data["web_url"]}


gitlab_service = GitLabService()
