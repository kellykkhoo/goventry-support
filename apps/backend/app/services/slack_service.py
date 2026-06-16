# apps/backend/app/services/slack_service.py
import sys
from flask import current_app
import httpx
from ..extensions import db
from ..models.slack_delivery_log import SlackDeliveryLog


class SlackService:
    def send_message(self, text: str, report_type: str = "custom", channel_hint: str | None = None) -> dict:
        cfg = current_app.config.get("_APP_CONFIG")
        webhook_url = getattr(cfg, "SLACK_WEBHOOK_URL", "") if cfg else ""

        if not webhook_url:
            log = SlackDeliveryLog(
                report_type=report_type,
                channel_hint=channel_hint,
                status="failed",
                error_message="SLACK_WEBHOOK_URL not configured",
                payload_preview=text[:500],
            )
            db.session.add(log)
            db.session.commit()
            return {"ok": False, "error": "SLACK_WEBHOOK_URL not configured"}

        try:
            resp = httpx.post(webhook_url, json={"text": text}, timeout=10)
            resp.raise_for_status()
            log = SlackDeliveryLog(
                report_type=report_type,
                channel_hint=channel_hint,
                status="success",
                payload_preview=text[:500],
            )
            db.session.add(log)
            db.session.commit()
            return {"ok": True}
        except Exception as exc:  # noqa: BLE001
            print(f"[slack] delivery failed: {exc}", file=sys.stderr)
            log = SlackDeliveryLog(
                report_type=report_type,
                channel_hint=channel_hint,
                status="failed",
                error_message=str(exc)[:500],
                payload_preview=text[:500],
            )
            db.session.add(log)
            db.session.commit()
            return {"ok": False, "error": str(exc)}


slack_service = SlackService()
