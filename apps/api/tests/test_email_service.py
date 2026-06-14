def test_dev_console_when_no_provider(app, capsys, monkeypatch):
    for k in ("MS_TENANT_ID", "POSTMAN_API_KEY"):
        monkeypatch.delenv(k, raising=False)
    from app.services.email_service import email_service
    with app.app_context():
        result = email_service.send(to="x@y.gov.sg", subject="Hi", body="Body")
    assert result["provider"] == "dev-console"
    assert "x@y.gov.sg" in capsys.readouterr().out


def test_selects_postman_when_env_present(app, monkeypatch):
    import app.services.email_service as mod
    monkeypatch.delenv("MS_TENANT_ID", raising=False)
    monkeypatch.setenv("POSTMAN_API_KEY", "key123")
    monkeypatch.setenv("POSTMAN_FROM", "support@goventry.gov.sg")
    calls = {}

    class FakeResponse:
        status_code = 200
        def raise_for_status(self): pass

    def fake_post(url, **kwargs):
        calls["url"] = url
        calls["json"] = kwargs.get("json")
        return FakeResponse()

    monkeypatch.setattr(mod.httpx, "post", fake_post)
    with app.app_context():
        result = mod.email_service.send(to="a@b.gov.sg", subject="S", body="B")
    assert result["provider"] == "postman"
    assert "postman.gov.sg" in calls["url"]
