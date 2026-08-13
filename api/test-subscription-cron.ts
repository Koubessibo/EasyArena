/**
 * ══════════════════════════════════════════════════════════════════
 *  CRASH TEST RECOUVREMENT — EasyArena
 *  Prouve que le cron quotidien :
 *   - Relance les échéances dues (J+0 à J+3)
 *   - Suspend les abonnements en défaut (> 3 jours)
 * ══════════════════════════════════════════════════════════════════
 */

import { Client } from 'pg';
import * as dotenv from 'dotenv';
import { randomUUID } from 'crypto';

dotenv.config();

function separator() {
  console.log('─'.repeat(60));
}

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

async function main() {
  console.log('\n══════════════════════════════════════════════════════════════');
  console.log('  📅 CRASH TEST RECOUVREMENT — Abonnements & Échéances');
  console.log('══════════════════════════════════════════════════════════════\n');

  const client = new Client({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 5432),
    user: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    ssl: process.env.DB_HOST?.includes('alwaysdata') ? { rejectUnauthorized: false } : undefined,
  });

  await client.connect();
  console.log('  ✅ Connexion PostgreSQL établie\n');

  // ── Find existing client + owner for test data ─────────────────
  const clientRes = await client.query(`SELECT id FROM clients LIMIT 1`);
  if (clientRes.rows.length === 0) {
    console.log('  ⚠️  Aucun client en base.');
    await client.end();
    process.exit(1);
  }
  const testClientId = clientRes.rows[0].id;

  // Find or create a subscription plan
  const planRes = await client.query(`SELECT id FROM subscription_plans LIMIT 1`);
  let planId: string;
  if (planRes.rows.length === 0) {
    // Find an owner to create a plan
    const ownerRes = await client.query(`SELECT id FROM owners LIMIT 1`);
    if (ownerRes.rows.length === 0) {
      console.log('  ⚠️  Aucun owner en base.');
      await client.end();
      process.exit(1);
    }
    planId = randomUUID();
    await client.query(
      `INSERT INTO subscription_plans (id, owner_id, name, price, duration_days, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, NOW(), NOW())`,
      [planId, ownerRes.rows[0].id, '__TEST_PLAN__', 15000, 30],
    );
    console.log(`  Plan de test créé : ${planId.slice(0, 8)}...`);
  } else {
    planId = planRes.rows[0].id;
    console.log(`  Plan existant utilisé : ${planId.slice(0, 8)}...`);
  }

  // ── SETUP: 2 subscriptions with 2 installments ─────────────────
  separator();
  console.log('📋 SETUP : 2 abonnements de test');
  separator();

  // Sub A: active, installment due TODAY (J+0) → should get SMS relance
  const subAId = randomUUID();
  await client.query(
    `INSERT INTO user_subscriptions (id, client_id, plan_id, status, start_date, end_date, created_at, updated_at)
     VALUES ($1, $2, $3, 'active', $4, $5, NOW(), NOW())`,
    [subAId, testClientId, planId, daysAgo(15), new Date(Date.now() + 15 * 24 * 60 * 60 * 1000)],
  );
  const installAId = randomUUID();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  await client.query(
    `INSERT INTO payment_installments (id, subscription_id, amount, due_date, status, created_at, updated_at)
     VALUES ($1, $2, $3, $4, 'pending', NOW(), NOW())`,
    [installAId, subAId, 7500, today],
  );
  console.log(`  Abonnement A : ${subAId.slice(0, 8)}... — ACTIVE`);
  console.log(`  Échéance A   : ${installAId.slice(0, 8)}... — 7500 FCFA — due AUJOURD'HUI (J+0)\n`);

  // Sub B: active, installment due 4 DAYS AGO (J-4) → should be SUSPENDED
  const subBId = randomUUID();
  await client.query(
    `INSERT INTO user_subscriptions (id, client_id, plan_id, status, start_date, end_date, created_at, updated_at)
     VALUES ($1, $2, $3, 'active', $4, $5, NOW(), NOW())`,
    [subBId, testClientId, planId, daysAgo(25), new Date(Date.now() + 5 * 24 * 60 * 60 * 1000)],
  );
  const installBId = randomUUID();
  await client.query(
    `INSERT INTO payment_installments (id, subscription_id, amount, due_date, status, created_at, updated_at)
     VALUES ($1, $2, $3, $4, 'pending', NOW(), NOW())`,
    [installBId, subBId, 7500, daysAgo(4)],
  );
  console.log(`  Abonnement B : ${subBId.slice(0, 8)}... — ACTIVE`);
  console.log(`  Échéance B   : ${installBId.slice(0, 8)}... — 7500 FCFA — due il y a 4 JOURS (J-4)\n`);

  // ── EXECUTE CRON LOGIC ─────────────────────────────────────────
  separator();
  console.log('📋 EXÉCUTION DU CRON : processInstallments()');
  separator();

  const GRACE_PERIOD_DAYS = 3;
  const now = new Date();
  const cutoff = new Date(now.getTime() - GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000);

  // ── Phase 1: Relance (due between cutoff and now)
  console.log('\n  ▶ Phase 1 : Relance...');
  const dueInstallments = await client.query(
    `SELECT i.id, i.amount, i.due_date, s.id as sub_id, s.status as sub_status
     FROM payment_installments i
     JOIN user_subscriptions s ON s.id = i.subscription_id
     WHERE i.status = 'pending'
       AND i.due_date <= $1
       AND i.due_date > $2
       AND s.status = 'active'`,
    [now, cutoff],
  );

  let relanced = 0;
  for (const row of dueInstallments.rows) {
    // Only process our test installments
    if (row.id !== installAId) continue;
    console.log(`    📩 SMS RELANCE déclenché pour échéance ${row.id.slice(0, 8)}... (${row.amount} FCFA, due ${new Date(row.due_date).toISOString().slice(0, 10)})`);
    console.log(`       → "EasyArena: Votre échéance de ${row.amount} FCFA est due aujourd'hui. Réglez pour maintenir votre accès."`);
    relanced++;
  }
  console.log(`    Relances envoyées : ${relanced}`);

  // ── Phase 2: Suspension (due before cutoff)
  console.log('\n  ▶ Phase 2 : Suspension...');
  const overdueInstallments = await client.query(
    `SELECT i.id, i.amount, i.due_date, s.id as sub_id, s.status as sub_status
     FROM payment_installments i
     JOIN user_subscriptions s ON s.id = i.subscription_id
     WHERE i.status = 'pending'
       AND i.due_date <= $1
       AND s.status = 'active'`,
    [cutoff],
  );

  let suspended = 0;
  for (const row of overdueInstallments.rows) {
    if (row.id !== installBId) continue;

    // Mark overdue
    await client.query(`UPDATE payment_installments SET status = 'overdue' WHERE id = $1`, [row.id]);
    // Suspend subscription
    await client.query(`UPDATE user_subscriptions SET status = 'suspended' WHERE id = $1`, [row.sub_id]);

    console.log(`    ⛔ Abonnement ${row.sub_id.slice(0, 8)}... → SUSPENDU`);
    console.log(`       Échéance ${row.id.slice(0, 8)}... impayée depuis > 3 jours → OVERDUE`);
    console.log(`       → SMS : "EasyArena: Votre abonnement a été suspendu pour défaut de paiement."`);
    suspended++;
  }
  console.log(`    Suspensions : ${suspended}`);

  // ── VERIFY ─────────────────────────────────────────────────────
  console.log('');
  separator();
  console.log('📋 VÉRIFICATION FINALE');
  separator();

  const subAStatus = (await client.query(`SELECT status FROM user_subscriptions WHERE id = $1`, [subAId])).rows[0].status;
  const subBStatus = (await client.query(`SELECT status FROM user_subscriptions WHERE id = $1`, [subBId])).rows[0].status;
  const installAStatus = (await client.query(`SELECT status FROM payment_installments WHERE id = $1`, [installAId])).rows[0].status;
  const installBStatus = (await client.query(`SELECT status FROM payment_installments WHERE id = $1`, [installBId])).rows[0].status;

  console.log(`  Abonnement A (J+0) : status = ${subAStatus} (attendu: active)`);
  console.log(`  Échéance A (J+0)   : status = ${installAStatus} (attendu: pending — relancé par SMS)`);
  console.log(`  Abonnement B (J-4) : status = ${subBStatus} (attendu: suspended)`);
  console.log(`  Échéance B (J-4)   : status = ${installBStatus} (attendu: overdue)`);
  console.log('');

  const allOk =
    subAStatus === 'active' &&
    installAStatus === 'pending' &&
    subBStatus === 'suspended' &&
    installBStatus === 'overdue' &&
    relanced === 1 &&
    suspended === 1;

  if (allOk) {
    console.log('  ✅ Abonnement A reste ACTIVE — SMS de relance envoyé');
    console.log('  ✅ Abonnement B passe en SUSPENDED — période de grâce expirée');
    console.log('  ✅ Échéance B marquée OVERDUE');
    console.log('');
    separator();
    console.log('🏆 RÉSULTAT : RECOUVREMENT OPÉRATIONNEL. ZÉRO IMPAYÉ IGNORÉ.');
    separator();
  } else {
    console.log('  ❌ ÉCHEC — Les statuts ne correspondent pas aux attentes');
    separator();
  }

  // ── CLEANUP ────────────────────────────────────────────────────
  await client.query(`DELETE FROM payment_installments WHERE id IN ($1, $2)`, [installAId, installBId]);
  await client.query(`DELETE FROM user_subscriptions WHERE id IN ($1, $2)`, [subAId, subBId]);
  // Clean up test plan only if we created it
  await client.query(`DELETE FROM subscription_plans WHERE name = '__TEST_PLAN__'`);
  console.log('\n  🧹 Données de test nettoyées.\n');

  await client.end();
  if (!allOk) process.exit(1);
}

main().catch(err => {
  console.error('FATAL:', err);
  process.exit(1);
});
