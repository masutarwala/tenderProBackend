// Encodes the legal Prospect -> Opportunity -> Closed transitions from spec §3.
// Illegal jumps (e.g. Draft -> Bid) are rejected before they reach the database.

export type ProspectStatus = "NEW" | "DROPPED" | "SHORTLISTED";
export type OpportunityStatus = "DRAFT" | "PENDING_APPROVAL" | "APPROVED" | "SENT_BACK" | "REJECTED" | "BID";

const PROSPECT_TRANSITIONS: Record<ProspectStatus, ProspectStatus[]> = {
  NEW: ["DROPPED", "SHORTLISTED"],
  DROPPED: [],
  SHORTLISTED: [],
};

const OPPORTUNITY_TRANSITIONS: Record<OpportunityStatus, OpportunityStatus[]> = {
  DRAFT: ["PENDING_APPROVAL"],
  PENDING_APPROVAL: ["APPROVED", "SENT_BACK", "REJECTED"],
  APPROVED: ["BID"],
  SENT_BACK: ["DRAFT"],
  REJECTED: [],
  BID: [],
};

export function canTransitionProspect(from: ProspectStatus, to: ProspectStatus): boolean {
  return PROSPECT_TRANSITIONS[from]?.includes(to) ?? false;
}

export function canTransitionOpportunity(from: OpportunityStatus | null | undefined, to: OpportunityStatus): boolean {
  const current = from || "DRAFT";
  return OPPORTUNITY_TRANSITIONS[current]?.includes(to) ?? false;
}
