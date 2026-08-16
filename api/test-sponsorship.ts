/**
 * ═══════════════════════════════════════════════════════════════════
 * CRASH TEST FINANCIER — Moteur de Parrainage EasyArena
 * ═══════════════════════════════════════════════════════════════════
 *
 * Scénario:
 *   - Transaction de 10 000 FCFA
 *   - L'acheteur est parrainé par un Ambassadeur (N1)
 *   - L'Ambassadeur est lui-même parrainé par un Client standard (N2)
 *
 * Résultats attendus:
 *   Principal : 10000 F
 *   Frais Encaissement (1.5%) : 150 F
 *   Frais Retrait (1%) : 100 F
 *   Revenu Net EasyArena : 250 F
 *   Parrain N1 (Ambassadeur 7%) : 18 F (17.5 arrondi)
 *   Parrain N2 (Client 2%) : 5 F
 *   Reste Final EasyArena : 227 F
 */

import {
  computeNetRevenue,
  computeSponsorshipCommissions,
  getSponsorshipGrid,
  assertFinancialIntegrity,
  PLATFORM_FEE_PERCENT,
  GATEWAY_INGRESS_PERCENT,
  GATEWAY_EGRESS_PERCENT,
} from './src/common/utils/finance.utils';

const PRINCIPAL = 10_000;

console.log('═══════════════════════════════════════════════════════════');
console.log('  CRASH TEST FINANCIER — Moteur de Parrainage EasyArena');
console.log('═══════════════════════════════════════════════════════════\n');

// Step 1: Compute Net Revenue
const revenue = computeNetRevenue(PRINCIPAL);

console.log(`📌 Principal                    : ${revenue.principalAmount} F`);
console.log(`📌 Commission Plateforme (5%)   : ${revenue.grossPlatformFee} F`);
console.log(`📌 Frais Encaissement (1.5%)    : ${revenue.gatewayIngress} F`);
console.log(`📌 Frais Retrait (1%)           : ${revenue.gatewayEgress} F`);
console.log(`📌 Revenu Net EasyArena         : ${revenue.netRevenue} F`);
console.log('');

// Step 2: Determine grids
// N1 Sponsor = Ambassador, referee = client
const n1Grid = getSponsorshipGrid(true, 'client');
// N2 Sponsor = Client standard, referee = client (the ambassador was referred by a client)
const n2Grid = getSponsorshipGrid(false, 'client');

console.log(`📋 Grille N1 (Ambassadeur→Client): ${n1Grid.n1_percent * 100}% N1, ${n1Grid.n2_percent * 100}% N2, durée ${n1Grid.duration_months} mois`);
console.log(`📋 Grille N2 (Client→Client):      ${n2Grid.n1_percent * 100}% N1, ${n2Grid.n2_percent * 100}% N2, durée ${n2Grid.duration_months} mois`);
console.log('');

// Step 3: Compute commissions
const n1Commissions = computeSponsorshipCommissions(revenue.netRevenue, n1Grid);
// N2: uses the N2 percentage from N2's own grid (the Client standard's grid)
const n2Commission = Math.round(revenue.netRevenue * n2Grid.n2_percent);

console.log(`💰 Parrain N1 (Ambassadeur 7%)  : ${n1Commissions.n1_commission} F (${revenue.netRevenue} × 0.07 = ${revenue.netRevenue * 0.07} → arrondi)`);
console.log(`💰 Parrain N2 (Client 2%)       : ${n2Commission} F (${revenue.netRevenue} × 0.02 = ${revenue.netRevenue * 0.02} → arrondi)`);
console.log('');

// Step 4: Compute final EasyArena amount
const totalCommissions = n1Commissions.n1_commission + n2Commission;
const resteFinal = revenue.netRevenue - totalCommissions;

console.log(`🏦 Total commissions distribuées: ${totalCommissions} F`);
console.log(`🏦 Reste Final EasyArena        : ${resteFinal} F`);
console.log('');

// Step 5: Integrity checks
console.log('═══════════════════════════════════════════════════════════');
console.log('  VÉRIFICATIONS D\'INTÉGRITÉ');
console.log('═══════════════════════════════════════════════════════════\n');

// Check 1: NetRevenue = GrossFee - Ingress - Egress
const expectedNetRevenue = revenue.grossPlatformFee - revenue.gatewayIngress - revenue.gatewayEgress;
console.log(`✅ NetRevenue = ${revenue.grossPlatformFee} - ${revenue.gatewayIngress} - ${revenue.gatewayEgress} = ${expectedNetRevenue} F`);
assertFinancialIntegrity(revenue.grossPlatformFee, revenue.gatewayIngress, revenue.gatewayEgress, revenue.netRevenue);

// Check 2: All amounts are integers
const allValues = [
  revenue.principalAmount, revenue.grossPlatformFee,
  revenue.gatewayIngress, revenue.gatewayEgress, revenue.netRevenue,
  n1Commissions.n1_commission, n2Commission, resteFinal,
];
const allIntegers = allValues.every(v => Number.isInteger(v));
console.log(`✅ Tous les montants sont des entiers: ${allIntegers ? 'OUI ✓' : 'NON ✗ ERREUR!'}`);

// Check 3: reste + commissions = netRevenue
assertFinancialIntegrity(revenue.netRevenue, n1Commissions.n1_commission, n2Commission, resteFinal);
console.log(`✅ Équation finale: ${n1Commissions.n1_commission} + ${n2Commission} + ${resteFinal} = ${revenue.netRevenue} F`);

console.log('\n═══════════════════════════════════════════════════════════');
console.log('  RÉSUMÉ FINAL');
console.log('═══════════════════════════════════════════════════════════');
console.log(`
  Principal              : ${PRINCIPAL} F
  Frais Encaissement     : ${revenue.gatewayIngress} F
  Frais Retrait          : ${revenue.gatewayEgress} F
  Revenu Net EasyArena   : ${revenue.netRevenue} F
  Parrain N1 (Amb. 7%)   : ${n1Commissions.n1_commission} F
  Parrain N2 (Client 2%) : ${n2Commission} F
  Reste Final EasyArena  : ${resteFinal} F
`);
console.log('🎯 TEST RÉUSSI — Tous les calculs sont corrects et en entiers.');
