/**
 * ══════════════════════════════════════════════════════════════════
 *  CRASH TEST FINANCIER — EasyArena
 *  Preuve d'intégrité comptable au Franc CFA près.
 * ══════════════════════════════════════════════════════════════════
 */

import {
  computePlatformFee,
  splitPayment,
  computeWithdrawalFee,
  assertFinancialIntegrity,
  PLATFORM_FEE_PERCENT,
  WITHDRAWAL_FEE_PERCENT,
} from './src/common/utils/finance.utils';

function separator() {
  console.log('─'.repeat(60));
}

console.log('\n══════════════════════════════════════════════════════════════');
console.log('  💰 CRASH TEST FINANCIER — EasyArena');
console.log('  Monnaie : Franc CFA (entier, pas de centimes)');
console.log('══════════════════════════════════════════════════════════════\n');

// ──────────────────────────────────────────────────────────────
// TEST 1 : Montant piégeux qui génère des décimales (15 555 FCFA)
// ──────────────────────────────────────────────────────────────
separator();
console.log('📋 TEST 1 : Réservation terrain à 15 555 FCFA');
separator();

const booking1 = computePlatformFee(15_555);
console.log(`  Prix du créneau (base)  : ${booking1.baseCost} FCFA`);
console.log(`  Commission 5%           : ${booking1.commission} FCFA`);
console.log(`  Total payé par client   : ${booking1.totalWithFee} FCFA`);
console.log(`  Vérification : ${booking1.baseCost} + ${booking1.commission} = ${booking1.baseCost + booking1.commission}`);
assertFinancialIntegrity(booking1.totalWithFee, booking1.baseCost, booking1.commission);
console.log('  ✅ ÉQUATION VÉRIFIÉE : baseCost + commission === totalWithFee\n');

// ──────────────────────────────────────────────────────────────
// TEST 2 : Split du paiement (reverse: du total vers owner+commission)
// ──────────────────────────────────────────────────────────────
separator();
console.log('📋 TEST 2 : Split du paiement reçu (16 333 FCFA)');
separator();

const split1 = splitPayment(booking1.totalWithFee);
console.log(`  Paiement total reçu     : ${booking1.totalWithFee} FCFA`);
console.log(`  Crédit propriétaire     : ${split1.ownerCredit} FCFA`);
console.log(`  Commission plateforme   : ${split1.commission} FCFA`);
console.log(`  Vérification : ${split1.ownerCredit} + ${split1.commission} = ${split1.ownerCredit + split1.commission}`);
assertFinancialIntegrity(booking1.totalWithFee, split1.ownerCredit, split1.commission);
console.log('  ✅ ÉQUATION VÉRIFIÉE : ownerCredit + commission === totalPaid\n');

// ──────────────────────────────────────────────────────────────
// TEST 3 : Retrait Mobile Money avec frais 1%
// ──────────────────────────────────────────────────────────────
separator();
console.log('📋 TEST 3 : Retrait de 50 000 FCFA (frais 1%)');
separator();

const withdrawal1 = computeWithdrawalFee(50_000);
console.log(`  Montant demandé         : ${withdrawal1.requestedAmount} FCFA`);
console.log(`  Frais Mobile Money 1%   : ${withdrawal1.fee} FCFA`);
console.log(`  Montant net reçu        : ${withdrawal1.netReceived} FCFA`);
console.log(`  Vérification : ${withdrawal1.netReceived} + ${withdrawal1.fee} = ${withdrawal1.netReceived + withdrawal1.fee}`);
assertFinancialIntegrity(withdrawal1.requestedAmount, withdrawal1.netReceived, withdrawal1.fee);
console.log('  ✅ ÉQUATION VÉRIFIÉE : netReceived + fee === requestedAmount\n');

// ──────────────────────────────────────────────────────────────
// TEST 4 : Montant diabolique (33 333 FCFA → 5% = 1666.65 → arrondi)
// ──────────────────────────────────────────────────────────────
separator();
console.log('📋 TEST 4 : Montant diabolique — 33 333 FCFA');
separator();

const booking2 = computePlatformFee(33_333);
console.log(`  Prix du créneau (base)  : ${booking2.baseCost} FCFA`);
console.log(`  Commission 5% brute     : ${33_333 * 0.05} (avant arrondi)`);
console.log(`  Commission 5% arrondie  : ${booking2.commission} FCFA`);
console.log(`  Total payé par client   : ${booking2.totalWithFee} FCFA`);
assertFinancialIntegrity(booking2.totalWithFee, booking2.baseCost, booking2.commission);
console.log('  ✅ ÉQUATION VÉRIFIÉE : pas de franc fantôme\n');

// ──────────────────────────────────────────────────────────────
// TEST 5 : Stress test sur 10 000 montants aléatoires
// ──────────────────────────────────────────────────────────────
separator();
console.log('📋 TEST 5 : Stress test — 10 000 montants aléatoires [1 – 500 000 FCFA]');
separator();

let failures = 0;
let totalCommissionAccumulated = 0;
let totalOwnerCreditAccumulated = 0;
let totalPaidAccumulated = 0;

for (let i = 0; i < 10_000; i++) {
  const amount = Math.floor(Math.random() * 500_000) + 1;
  const { baseCost, commission, totalWithFee } = computePlatformFee(amount);

  if (baseCost + commission !== totalWithFee) {
    console.error(`  ❌ FAILURE at amount=${amount}: ${baseCost} + ${commission} !== ${totalWithFee}`);
    failures++;
  }

  // Reverse split must also balance
  const split = splitPayment(totalWithFee);
  if (split.ownerCredit + split.commission !== totalWithFee) {
    console.error(`  ❌ SPLIT FAILURE at totalPaid=${totalWithFee}`);
    failures++;
  }

  totalCommissionAccumulated += commission;
  totalOwnerCreditAccumulated += split.ownerCredit;
  totalPaidAccumulated += totalWithFee;
}

console.log(`  Transactions simulées   : 10 000`);
console.log(`  Total encaissé          : ${totalPaidAccumulated.toLocaleString('fr-FR')} FCFA`);
console.log(`  Total propriétaires     : ${totalOwnerCreditAccumulated.toLocaleString('fr-FR')} FCFA`);
console.log(`  Total commissions       : ${totalCommissionAccumulated.toLocaleString('fr-FR')} FCFA`);
console.log(`  Solde comptable         : ${totalPaidAccumulated - totalOwnerCreditAccumulated - totalCommissionAccumulated} FCFA (doit être 0)`);
console.log(`  Échecs d'intégrité      : ${failures}`);

if (failures === 0) {
  console.log('  ✅ 10 000/10 000 TRANSACTIONS PARFAITES — AUCUN FRANC PERDU OU CRÉÉ\n');
} else {
  console.log(`  ❌ ${failures} ÉCHEC(S) DÉTECTÉ(S)\n`);
  process.exit(1);
}

// ──────────────────────────────────────────────────────────────
// RÉSUMÉ
// ──────────────────────────────────────────────────────────────
separator();
console.log('🏆 RÉSULTAT FINAL');
separator();
console.log(`  Commission plateforme   : ${PLATFORM_FEE_PERCENT * 100}%`);
console.log(`  Frais retrait           : ${WITHDRAWAL_FEE_PERCENT * 100}%`);
console.log(`  Type de données DB      : int (pas de décimales)`);
console.log(`  Arrondi                 : Math.round() strict`);
console.log(`  Intégrité               : net + commission === total TOUJOURS`);
console.log('  ✅ ZÉRO franc fantôme. Comptabilité parfaite.\n');
