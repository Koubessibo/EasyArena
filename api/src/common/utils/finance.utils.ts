/**
 * EasyArena Financial Utilities
 * All amounts are in FCFA (integer, no subdivisions).
 * These functions guarantee: net_amount + commission === total_amount
 */

export const PLATFORM_FEE_PERCENT = 0.05; // 5% commission plateforme
export const WITHDRAWAL_FEE_PERCENT = 0.01; // 1% frais retrait Mobile Money

/**
 * Calculates the platform commission on a booking/order amount.
 * Returns { totalWithFee, baseCost, commission } where:
 *   baseCost + commission === totalWithFee
 */
export function computePlatformFee(baseCost: number): {
  baseCost: number;
  commission: number;
  totalWithFee: number;
} {
  const amount = Math.round(baseCost);
  const commission = Math.round(amount * PLATFORM_FEE_PERCENT);
  const totalWithFee = amount + commission;
  return { baseCost: amount, commission, totalWithFee };
}

/**
 * From a total payment amount (which includes commission),
 * extracts the owner credit and the platform commission.
 * Guarantees: ownerCredit + commission === totalPaid
 */
export function splitPayment(totalPaid: number): {
  ownerCredit: number;
  commission: number;
} {
  const total = Math.round(totalPaid);
  const commission = Math.round(total * PLATFORM_FEE_PERCENT / (1 + PLATFORM_FEE_PERCENT));
  const ownerCredit = total - commission;
  return { ownerCredit, commission };
}

/**
 * Calculates the withdrawal fee (1%) and net amount received.
 * Guarantees: netReceived + fee === requestedAmount
 * Note: fee is deducted FROM the requested amount (owner pays the fee).
 */
export function computeWithdrawalFee(requestedAmount: number): {
  requestedAmount: number;
  fee: number;
  netReceived: number;
} {
  const amount = Math.round(requestedAmount);
  const fee = Math.round(amount * WITHDRAWAL_FEE_PERCENT);
  const netReceived = amount - fee;
  return { requestedAmount: amount, fee, netReceived };
}

/**
 * Validates the integrity equation: parts must equal the whole.
 * Throws if the equation doesn't balance.
 */
export function assertFinancialIntegrity(
  total: number,
  ...parts: number[]
): void {
  const sum = parts.reduce((acc, p) => acc + p, 0);
  if (sum !== total) {
    throw new Error(
      `INTEGRITY VIOLATION: ${parts.join(' + ')} = ${sum}, expected ${total}. Diff: ${sum - total} FCFA`,
    );
  }
}

// ══════════════════════════════════════════════════════════════════
// Sponsorship / MLM Engine Constants & Utilities
// ══════════════════════════════════════════════════════════════════

export const GATEWAY_INGRESS_PERCENT = 0.015; // 1.5% frais encaissement
export const GATEWAY_EGRESS_PERCENT = 0.01;   // 1% frais retrait

export interface SponsorshipGrid {
  n1_percent: number;
  n2_percent: number;
  duration_months: number;
}

export const SPONSORSHIP_GRIDS = {
  CLIENT_TO_CLIENT: { n1_percent: 0.05, n2_percent: 0.02, duration_months: 12 },
  AMBASSADOR_TO_CLIENT: { n1_percent: 0.07, n2_percent: 0.02, duration_months: 24 },
  AMBASSADOR_TO_PRO: { n1_percent: 0.10, n2_percent: 0.03, duration_months: 36 },
} as const;

/**
 * Computes the Net Revenue for EasyArena from a transaction.
 * NetRevenue = GrossPlatformFee(5%) - GatewayIngress(1.5%) - GatewayEgress(1%)
 * All calculations are on the PRINCIPAL AMOUNT (Option A).
 */
export function computeNetRevenue(principalAmount: number): {
  principalAmount: number;
  grossPlatformFee: number;
  gatewayIngress: number;
  gatewayEgress: number;
  netRevenue: number;
} {
  const principal = Math.round(principalAmount);
  const grossPlatformFee = Math.round(principal * PLATFORM_FEE_PERCENT);
  const gatewayIngress = Math.round(principal * GATEWAY_INGRESS_PERCENT);
  const gatewayEgress = Math.round(principal * GATEWAY_EGRESS_PERCENT);
  const netRevenue = grossPlatformFee - gatewayIngress - gatewayEgress;
  return { principalAmount: principal, grossPlatformFee, gatewayIngress, gatewayEgress, netRevenue };
}

/**
 * Computes sponsorship commissions (N1 and N2) from a net revenue amount.
 * Returns integer amounts (Math.round).
 */
export function computeSponsorshipCommissions(
  netRevenue: number,
  grid: SponsorshipGrid,
): { n1_commission: number; n2_commission: number } {
  const n1_commission = Math.round(netRevenue * grid.n1_percent);
  const n2_commission = Math.round(netRevenue * grid.n2_percent);
  return { n1_commission, n2_commission };
}

/**
 * Determines which sponsorship grid to apply based on sponsor type and referee role.
 */
export function getSponsorshipGrid(
  sponsorIsAmbassador: boolean,
  refereeRole: string,
): SponsorshipGrid {
  if (sponsorIsAmbassador) {
    if (refereeRole === 'client') {
      return SPONSORSHIP_GRIDS.AMBASSADOR_TO_CLIENT;
    }
    return SPONSORSHIP_GRIDS.AMBASSADOR_TO_PRO;
  }
  return SPONSORSHIP_GRIDS.CLIENT_TO_CLIENT;
}
