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
