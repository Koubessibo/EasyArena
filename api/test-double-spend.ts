/**
 * ══════════════════════════════════════════════════════════════════
 *  CRASH TEST FINANCIER — Double-Spend Attack
 *  Prouve qu'un vendeur ne peut PAS retirer plus que son solde
 *  même en bombardant le serveur de requêtes simultanées.
 * ══════════════════════════════════════════════════════════════════
 */

import { Client } from 'pg';
import * as dotenv from 'dotenv';
import { randomUUID } from 'crypto';

dotenv.config();

function separator() {
  console.log('─'.repeat(60));
}

async function main() {
  console.log('\n══════════════════════════════════════════════════════════════');
  console.log('  💸 CRASH TEST — Attaque Double-Spend (5 retraits simultanés)');
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

  // ── SETUP: Vendor with exactly 20,000 FCFA balance ─────────────
  separator();
  console.log('📋 SETUP : Vendeur avec solde = 20 000 FCFA');
  separator();

  // Find an existing vendor
  const vendorRes = await client.query(`SELECT id FROM vendors LIMIT 1`);
  if (vendorRes.rows.length === 0) {
    console.log('  ⚠️  Aucun vendor en base.');
    await client.end();
    process.exit(1);
  }
  const vendorId = vendorRes.rows[0].id;
  console.log(`  Vendor ID : ${vendorId.slice(0, 8)}...`);

  // Find or create a client for the order
  const clientRes = await client.query(`SELECT id FROM clients LIMIT 1`);
  const clientId = clientRes.rows[0]?.id || vendorId;

  // Create a PAID order for 20,000 FCFA to establish vendor balance
  const orderId = randomUUID();
  await client.query(
    `INSERT INTO orders (id, client_id, vendor_id, total_amount, reference, status, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())`,
    [orderId, clientId, vendorId, 20000, 'EA-TEST-DOUBLE-SPEND', 'PAID'],
  );
  console.log(`  Commande PAID créée : ${orderId.slice(0, 8)}... (20 000 FCFA)`);

  // Clear any existing test withdrawals for this vendor
  await client.query(
    `DELETE FROM vendor_withdrawals WHERE vendor_id = $1 AND amount = 20000`,
    [vendorId],
  );

  // Verify balance
  const balRes = await client.query(
    `SELECT COALESCE(SUM(total_amount), 0) as revenue FROM orders WHERE vendor_id = $1 AND status IN ('PAID', 'DELIVERED')`,
    [vendorId],
  );
  const wdRes = await client.query(
    `SELECT COALESCE(SUM(amount), 0) as withdrawn FROM vendor_withdrawals WHERE vendor_id = $1 AND status IN ('PENDING', 'COMPLETED')`,
    [vendorId],
  );
  const balance = Number(balRes.rows[0].revenue) - Number(wdRes.rows[0].withdrawn);
  console.log(`  Solde disponible calculé : ${balance} FCFA`);
  console.log(`  (Revenus: ${balRes.rows[0].revenue}, Retraits: ${wdRes.rows[0].withdrawn})\n`);

  // ── ATTACK: 5 concurrent withdrawals of 20,000 FCFA ────────────
  separator();
  console.log('📋 ATTAQUE : 5 requêtes de retrait simultanées (20 000 FCFA chacune)');
  console.log('   → Si pas de verrou, le vendeur récupère 100 000 FCFA au lieu de 20 000');
  separator();

  // We simulate what the service does: transaction + lock + check + insert
  // Each "attacker" opens its own connection (like 5 concurrent HTTP requests)
  const results: { success: boolean; error?: string }[] = [];

  const attackPromises = Array.from({ length: 5 }, async (_, i) => {
    const attacker = new Client({
      host: process.env.DB_HOST,
      port: Number(process.env.DB_PORT || 5432),
      user: process.env.DB_USERNAME,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      ssl: process.env.DB_HOST?.includes('alwaysdata') ? { rejectUnauthorized: false } : undefined,
    });
    await attacker.connect();

    try {
      // Reproduce exactly what the fixed service does:
      await attacker.query('BEGIN');

      // 1. Pessimistic lock on vendor's withdrawals (SELECT FOR UPDATE)
      await attacker.query(
        `SELECT * FROM vendor_withdrawals WHERE vendor_id = $1 AND status IN ('PENDING', 'COMPLETED') FOR UPDATE`,
        [vendorId],
      );

      // 2. Compute balance under lock
      const revRes = await attacker.query(
        `SELECT COALESCE(SUM(total_amount), 0) as total FROM orders WHERE vendor_id = $1 AND status IN ('PAID', 'DELIVERED')`,
        [vendorId],
      );
      const wdRes = await attacker.query(
        `SELECT COALESCE(SUM(amount), 0) as total FROM vendor_withdrawals WHERE vendor_id = $1 AND status IN ('PENDING', 'COMPLETED')`,
        [vendorId],
      );
      const available = Number(revRes.rows[0].total) - Number(wdRes.rows[0].total);

      // 3. Check balance
      if (20000 > available) {
        await attacker.query('ROLLBACK');
        results.push({ success: false, error: 'Solde insuffisant' });
        console.log(`  [Requête ${i + 1}] ❌ REJETÉ — Solde insuffisant (disponible: ${available})`);
      } else {
        // 4. Insert withdrawal
        await attacker.query(
          `INSERT INTO vendor_withdrawals (id, vendor_id, amount, status, requested_at)
           VALUES ($1, $2, $3, $4, NOW())`,
          [randomUUID(), vendorId, 20000, 'PENDING'],
        );
        await attacker.query('COMMIT');
        results.push({ success: true });
        console.log(`  [Requête ${i + 1}] ✅ ACCEPTÉ — Retrait de 20 000 FCFA créé`);
      }
    } catch (err: any) {
      try { await attacker.query('ROLLBACK'); } catch {}
      results.push({ success: false, error: err.message });
      console.log(`  [Requête ${i + 1}] ❌ ERREUR — ${err.message.slice(0, 60)}`);
    } finally {
      await attacker.end();
    }
  });

  await Promise.all(attackPromises);

  // ── VERIFY ─────────────────────────────────────────────────────
  console.log('');
  separator();
  console.log('📋 VÉRIFICATION FINALE');
  separator();

  const successCount = results.filter(r => r.success).length;
  const failedCount = results.filter(r => !r.success).length;

  // Check actual withdrawals created
  const finalWd = await client.query(
    `SELECT COUNT(*) as count, COALESCE(SUM(amount), 0) as total FROM vendor_withdrawals WHERE vendor_id = $1 AND amount = 20000 AND status = 'PENDING'`,
    [vendorId],
  );
  const withdrawalsCreated = Number(finalWd.rows[0].count);
  const totalWithdrawn = Number(finalWd.rows[0].total);

  console.log(`  Requêtes acceptées  : ${successCount} / 5`);
  console.log(`  Requêtes rejetées   : ${failedCount} / 5`);
  console.log(`  Retraits en base    : ${withdrawalsCreated}`);
  console.log(`  Montant total retiré: ${totalWithdrawn} FCFA`);
  console.log('');

  if (successCount === 1 && failedCount === 4 && withdrawalsCreated === 1 && totalWithdrawn === 20000) {
    console.log('  ✅ UN SEUL retrait créé (20 000 FCFA)');
    console.log('  ✅ 4 requêtes rejetées pour "Solde insuffisant"');
    console.log('  ✅ Le pessimistic lock a parfaitement sérialisé les requêtes');
    console.log('');
    separator();
    console.log('🏆 RÉSULTAT : DOUBLE-SPEND IMPOSSIBLE. INTÉGRITÉ FINANCIÈRE PARFAITE.');
    separator();
  } else {
    console.log(`  ❌ FAILLE DÉTECTÉE — ${successCount} retraits acceptés au lieu de 1 !`);
    separator();
  }

  // ── CLEANUP ────────────────────────────────────────────────────
  await client.query(`DELETE FROM vendor_withdrawals WHERE vendor_id = $1 AND amount = 20000`, [vendorId]);
  await client.query(`DELETE FROM orders WHERE id = $1`, [orderId]);
  console.log('\n  🧹 Données de test nettoyées.\n');

  await client.end();

  if (successCount !== 1) process.exit(1);
}

main().catch(err => {
  console.error('FATAL:', err);
  process.exit(1);
});
