// Encodes the EMD payment/refund lifecycle and the mandatory blocking rule from
// spec §11.1/§13: an Opportunity cannot move to PENDING_APPROVAL or APPROVED unless
// its linked EMD payment is PAID (or no EMD is required for the tender).

export type EmdPaymentStatus = "PENDING" | "INITIATED" | "SUBMITTED" | "PAID" | "FAILED";
export type EmdRefundStatus = "INITIATED" | "IN_PROGRESS" | "RECEIVED" | "ADJUSTED" | "RETAINED" | "CANCELLED";

const PAYMENT_TRANSITIONS: Record<EmdPaymentStatus, EmdPaymentStatus[]> = {
  PENDING: ["INITIATED"],
  INITIATED: ["SUBMITTED", "FAILED"],
  SUBMITTED: ["PAID", "FAILED"],
  PAID: [],
  FAILED: ["INITIATED"],
};

const REFUND_TRANSITIONS: Record<EmdRefundStatus, EmdRefundStatus[]> = {
  INITIATED: ["IN_PROGRESS", "CANCELLED", "ADJUSTED", "RETAINED"],
  IN_PROGRESS: ["RECEIVED", "CANCELLED"],
  RECEIVED: [],
  ADJUSTED: [],
  RETAINED: [],
  CANCELLED: [],
};

export function canTransitionEmdPayment(from: EmdPaymentStatus, to: EmdPaymentStatus): boolean {
  return PAYMENT_TRANSITIONS[from]?.includes(to) ?? false;
}

export function canTransitionEmdRefund(from: EmdRefundStatus, to: EmdRefundStatus): boolean {
  return REFUND_TRANSITIONS[from]?.includes(to) ?? false;
}

/**
 * Non-negotiable blocking rule (spec §11.1, §13): bids cannot progress to
 * approval without a verified ("PAID") EMD payment, unless EMD isn't required.
 */
export function canOpportunityEnterApproval(params: {
  emdRequired: boolean;
  emdPaymentStatus?: EmdPaymentStatus | null;
}): boolean {
  if (!params.emdRequired) return true;
  return params.emdPaymentStatus === "PAID";
}
