#!/usr/bin/env node
/**
 * Simulates a FormSG submission against your LOCAL dev server.
 *
 * What this tests: the field mapping and ticket creation (the part you own).
 * What it can't test: signature verification + decryption — those need real
 * FormSG (its ed25519 signature can't be faked). For the real end-to-end
 * test, see README "Webhook setup" (tunnel + Storage-mode form).
 *
 * Usage:  node scripts/test-formsg.mjs
 */

const URL = process.env.PMTOOL_URL ?? "http://localhost:3000";

// Mirrors the LIVE FormSG "GovEntry Product Support" form exactly
// (form.gov.sg/6a2ce896092f346c78ccf1ff) — labels and radio option strings.
const submission = {
  devTest: true,
  responses: [
    { question: "GovEntry Support Form", answer: "" }, // section header — ignored
    { question: "Name", answer: "Test Officer Tan" },
    { question: "Email", answer: "test_officer@moe.gov.sg" },
    { question: "Agency", answer: "MOE" },
    { question: "Which GovEntry feature is your enquiry about?", answer: "Gamification" },
    {
      question: "What type of issue are you raising?",
      answer: "Bug — Something isn't working the way it should",
    },
    {
      question: "Did our chatbot answer your question? Many common issues can be resolved there first.",
      answer: "Yes — it didn't resolve my issue",
    },
    {
      question: "How is this issue impacting your work?",
      answer: "High — I'm blocked or a deadline/launch is at risk; needs attention ASAP",
    },
    {
      question: "Describe your issue",
      answer:
        "TEST (FormSG simulation): Gamification points are not awarded after attendees complete check-in.",
    },
  ],
};

const res = await fetch(`${URL}/api/webhooks/formsg`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(submission),
});

const json = await res.json();
console.log(`HTTP ${res.status}:`, json);
if (res.ok && json.issueId) {
  console.log(`\n✓ Ticket created — open ${URL}/issues/${json.issueId}`);
} else {
  console.log("\n✗ Something went wrong — is the dev server running (npm run dev)?");
}
