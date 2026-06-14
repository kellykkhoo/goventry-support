# apps/api/app/services/email_service.py
# Python port of src/lib/email.ts — provider auto-select by env vars present.
import os
import sys
import httpx


class EmailService:
    def send(self, to: str, subject: str, body: str, reply_to: str | None = None) -> dict:
        if all(os.getenv(k) for k in ("MS_TENANT_ID", "MS_CLIENT_ID", "MS_CLIENT_SECRET", "MS_SENDER_MAILBOX")):
            return self._send_m365(to, subject, body, reply_to)
        if os.getenv("POSTMAN_API_KEY") and os.getenv("POSTMAN_FROM"):
            return self._send_postman(to, subject, body, reply_to)
        return self._dev_console(to, subject, body)

    def _send_m365(self, to, subject, body, reply_to) -> dict:
        tenant = os.environ["MS_TENANT_ID"]
        token_res = httpx.post(
            f"https://login.microsoftonline.com/{tenant}/oauth2/v2.0/token",
            data={
                "client_id": os.environ["MS_CLIENT_ID"],
                "client_secret": os.environ["MS_CLIENT_SECRET"],
                "scope": "https://graph.microsoft.com/.default",
                "grant_type": "client_credentials",
            },
            timeout=15,
        )
        token_res.raise_for_status()
        token = token_res.json()["access_token"]
        mailbox = os.environ["MS_SENDER_MAILBOX"]
        msg = {
            "message": {
                "subject": subject,
                "body": {"contentType": "Text", "content": body},
                "toRecipients": [{"emailAddress": {"address": to}}],
            }
        }
        if reply_to:
            msg["message"]["replyTo"] = [{"emailAddress": {"address": reply_to}}]
        res = httpx.post(
            f"https://graph.microsoft.com/v1.0/users/{mailbox}/sendMail",
            headers={"Authorization": f"Bearer {token}"},
            json=msg,
            timeout=15,
        )
        res.raise_for_status()
        return {"provider": "m365", "to": to}

    def _send_postman(self, to, subject, body, reply_to) -> dict:
        res = httpx.post(
            "https://api.postman.gov.sg/v1/transactional/email/send",
            headers={"Authorization": f"Bearer {os.environ['POSTMAN_API_KEY']}"},
            json={
                "from": os.environ["POSTMAN_FROM"],
                "recipient": to,
                "subject": subject,
                "body": body,
                **({"reply_to": reply_to} if reply_to else {}),
            },
            timeout=15,
        )
        res.raise_for_status()
        return {"provider": "postman", "to": to}

    def _dev_console(self, to, subject, body) -> dict:
        print(f"[email:dev-console] to={to} subject={subject!r}\n{body}", file=sys.stdout)
        return {"provider": "dev-console", "to": to}


email_service = EmailService()
