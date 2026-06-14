/**
 * Outbound email adapter. Picks a provider based on which env vars are set:
 *
 *   1. Microsoft 365 (MS_TENANT_ID + MS_CLIENT_ID + MS_CLIENT_SECRET + MS_SENDER_MAILBOX)
 *        -> sends AS the GovEntry support shared mailbox (true gov sender).
 *           Requires an Azure app registration with Mail.Send (ideally restricted
 *           to that mailbox via an Application Access Policy). This is the
 *           "email comes from GovEntry Support" path.
 *   2. POSTMAN_API_KEY -> Postman.gov.sg (gov sender; needs a verified from-address
 *        for a custom sender, otherwise Postman's default).
 *   3. RESEND_API_KEY  -> Resend (prototype; can set display name + reply-to only).
 *   4. none            -> dev mode (logs to console).
 *
 * Sender identity:
 *   EMAIL_FROM      display + address shown as the sender (where the provider allows it)
 *   EMAIL_REPLY_TO  where the requester's reply goes — set this to the GovEntry
 *                   support inbox so "Reply" in their mail client lands there.
 */
export type OutboundEmail = {
  to: string;
  subject: string;
  text: string;
};

export async function sendEmail(mail: OutboundEmail): Promise<{ ok: boolean; detail: string }> {
  if (
    process.env.MS_TENANT_ID &&
    process.env.MS_CLIENT_ID &&
    process.env.MS_CLIENT_SECRET &&
    process.env.MS_SENDER_MAILBOX
  ) {
    return sendViaGraph(mail);
  }
  if (process.env.POSTMAN_API_KEY) return sendViaPostman(mail, process.env.POSTMAN_API_KEY);
  if (process.env.RESEND_API_KEY) return sendViaResend(mail, process.env.RESEND_API_KEY);

  console.log("=== DEV EMAIL (no email provider configured, not actually sent) ===");
  console.log(`From: ${process.env.EMAIL_FROM ?? "(provider default)"}`);
  console.log(`Reply-To: ${process.env.EMAIL_REPLY_TO ?? "(none)"}`);
  console.log(`To: ${mail.to}\nSubject: ${mail.subject}\n\n${mail.text}`);
  console.log("==================================================================");
  return { ok: true, detail: "dev-mode: logged to console" };
}

/**
 * Microsoft 365 / Graph: send as the GovEntry support shared mailbox using
 * client-credentials (app-only) auth. The email genuinely originates from
 * MS_SENDER_MAILBOX, and replies go to EMAIL_REPLY_TO (or that mailbox).
 */
async function sendViaGraph(mail: OutboundEmail) {
  const tenant = process.env.MS_TENANT_ID!;
  const mailbox = process.env.MS_SENDER_MAILBOX!; // e.g. GovEntry_Support@tech.gov.sg

  // 1. Get an app-only access token
  const tokenRes = await fetch(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.MS_CLIENT_ID!,
      client_secret: process.env.MS_CLIENT_SECRET!,
      scope: "https://graph.microsoft.com/.default",
      grant_type: "client_credentials",
    }),
  });
  if (!tokenRes.ok) {
    return { ok: false, detail: `Graph auth error ${tokenRes.status}: ${await tokenRes.text()}` };
  }
  const { access_token } = (await tokenRes.json()) as { access_token: string };

  // 2. Send as the support mailbox
  const replyTo = process.env.EMAIL_REPLY_TO || mailbox;
  const message = {
    subject: mail.subject,
    body: { contentType: "HTML", content: textToHtml(mail.text) },
    toRecipients: [{ emailAddress: { address: mail.to } }],
    replyTo: [{ emailAddress: { address: replyTo } }],
  };

  const sendRes = await fetch(
    `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(mailbox)}/sendMail`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ message, saveToSentItems: true }),
    },
  );

  if (sendRes.status === 202) return { ok: true, detail: `sent as ${mailbox} via Microsoft 365` };
  return { ok: false, detail: `Graph sendMail error ${sendRes.status}: ${await sendRes.text()}` };
}

// Postman sanitizes body as HTML, so plain newlines collapse. Escape and
// convert newlines to <br> so the reply reads the way it was typed.
function textToHtml(text: string): string {
  const escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return escaped.replace(/\r?\n/g, "<br>");
}

async function sendViaPostman(mail: OutboundEmail, apiKey: string) {
  const payload: Record<string, unknown> = {
    recipient: mail.to,
    subject: mail.subject,
    body: textToHtml(mail.text),
  };
  // Only set `from` if you've verified a custom from-address in Postman;
  // otherwise Postman uses its default sender.
  if (process.env.POSTMAN_FROM) payload.from = process.env.POSTMAN_FROM;
  // Where the requester's reply should land (a monitored team inbox).
  if (process.env.EMAIL_REPLY_TO) payload["reply-to"] = process.env.EMAIL_REPLY_TO;

  const res = await fetch("https://api.postman.gov.sg/v1/transactional/email/send", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (res.status === 201) return { ok: true, detail: "sent via Postman.gov.sg" };
  const body = await res.text();
  return { ok: false, detail: `Postman error ${res.status}: ${body}` };
}

async function sendViaResend(mail: OutboundEmail, apiKey: string) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: process.env.EMAIL_FROM ?? "support@example.com",
      to: [mail.to],
      subject: mail.subject,
      text: mail.text,
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    return { ok: false, detail: `Resend error ${res.status}: ${body}` };
  }
  return { ok: true, detail: "sent via Resend" };
}
