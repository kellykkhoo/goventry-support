/**
 * Canonical documentation entries (sourceType="doc") for the knowledge base.
 * Edit here → it syncs to the database on every deploy (prisma/sync-docs.ts).
 * Resolved-ticket memory is separate and never touched by the sync.
 */
export const CANONICAL_DOCS: { title: string; content: string }[] = [
  {
    title: "GovSupply — Product overview",
    content:
      "GovSupply (formerly SupplyAlly) is a centralised distribution platform for Singapore " +
      "Government agencies to distribute items, vouchers and courses to beneficiaries. " +
      "Key features: admin portal for managing distribution campaigns; multiple redemption " +
      "channels (web app, vending machines, point-of-sale terminals, API); real-time tracking " +
      "that prevents duplicate distributions; inventory management and volunteer coordination. " +
      "Used for goods/voucher/course distribution at scale (20M+ transactions, 50+ campaigns). " +
      "Overview: https://www.developer.tech.gov.sg/products/categories/platform/govsupply/overview",
  },
  {
    title: "GovSupply — User guide",
    content:
      "Official GovSupply user guide (step-by-step campaign setup, redemption channels, " +
      "inventory and reporting). Point agencies here for detailed how-to instructions: " +
      "https://docs.developer.tech.gov.sg/docs/govsupply/?product=GovSupply",
  },
  {
    title: "GovRewards — Product overview",
    content:
      "GovRewards is a centralised reward-management system (part of the GovWallet suite) that " +
      "awards points for completing activities, letting agencies run incentive programmes " +
      "(e.g. healthier-habit nudges). Key capabilities: points-based incentives, consumption-data " +
      "analytics to measure nudge effectiveness, leaderboards for engagement, centralised hosting " +
      "and security. Agencies set up reward-point programmes, manage campaigns, and track " +
      "performance. For e-voucher / GovWallet payout specifics, consult the user guide or the team. " +
      "Overview: https://www.developer.tech.gov.sg/products/categories/platform/govrewards/overview",
  },
  {
    title: "GovRewards — User guide",
    content:
      "Official GovRewards user guide (campaign setup, reward points, payouts/e-vouchers, " +
      "onboarding). Point agencies here for detailed how-to instructions: " +
      "https://docs.developer.tech.gov.sg/docs/govrewards-user-guide/?product=GovRewards",
  },
];
