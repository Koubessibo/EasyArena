import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Sécurisation du journal des transactions partenaire.
 *
 * ── Problème ───────────────────────────────────────────────────────────────
 * `transactions` n'avait AUCUNE contrainte d'unicité sur la source : la
 * réconciliation (cron 5 min) pouvait créditer deux fois la même réservation.
 * C'est déjà arrivé en base : `TXN-20260813-0048` et `TXN-20260813-0049`
 * créditent toutes deux le paiement `8dbfa9fb-…` de 10 FCFA.
 *
 * `UNIQUE(reference)` ne protège pas de ça : `reference` change à chaque
 * écriture, elle ne relie jamais deux écritures de la même source.
 *
 * ── Décision de périmètre (validée) ────────────────────────────────────────
 * L'index est partiel et borné dans le temps :
 *
 *     WHERE source_id IS NOT NULL AND created_at >= TIMESTAMP '2026-09-29 00:00:00'
 *
 * Un index UNIQUE ne peut pas se créer sur des données dupliquées — c'est
 * vérifié : le CREATE échoue « could not create unique index ». Or l'historique
 * contient 22 lignes violant la règle, et la consigne est de NE PAS altérer
 * l'historique :
 *   - 20 × WITHDRAWAL_DEBIT dont `source_id` est l'id du PARTENAIRE (bug de
 *     provenance corrigé dans `withdrawals.service.ts`) ;
 *   - 2  × BOOKING_CREDIT : le double crédit réel du 13 août.
 *
 * On choisit donc de ne modifier AUCUNE ligne : la garantie couvre toutes les
 * écritures postérieures à l'adoption, ce qui est exactement l'objectif
 * anti-double-crédit. Si une violation apparaît dans le périmètre garanti, le
 * pré-vol ci-dessous liste les lignes fautives et fait échouer la migration —
 * mieux vaut un déploiement qui crie qu'un index silencieusement inutile.
 *
 * `down()` est propre : contrairement à un `ALTER TYPE ... ADD VALUE`
 * (cf. AddInAppNotifications), un index se supprime sans reste.
 */
export class AddTransactionSourceUniqueIndex1790556000000 implements MigrationInterface {
  name = 'AddTransactionSourceUniqueIndex1790556000000';

  /** Date d'adoption de la garantie (borne basse de l'index, en horloge UTC). */
  private readonly guardFrom = `TIMESTAMP '2026-09-29 00:00:00'`;

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── Pré-vol : refuse de migrer si le périmètre garanti est déjà violé ──
    const violations = (await queryRunner.query(
      `
        SELECT "type"::text            AS type,
               "source_id"::text       AS source_id,
               count(*)::int           AS n,
               string_agg("reference", ' , ' ORDER BY "reference") AS refs
          FROM "transactions"
         WHERE "source_id" IS NOT NULL
           AND "created_at" >= ${this.guardFrom}
         GROUP BY 1, 2
        HAVING count(*) > 1
      `,
    )) as Array<{ type: string; source_id: string; n: number; refs: string }>;

    if (violations.length > 0) {
      const detail = violations
        .map((v) => `  - ${v.type} / source ${v.source_id} ×${v.n} → ${v.refs}`)
        .join('\n');
      throw new Error(
        'IDX_unique_transaction_source_type impossible à créer : ' +
          `${violations.length} groupe(s) de doublons dans le périmètre garanti ` +
          `(créé après 2026-09-29).\n${detail}\n` +
          'Corriger les écritures fautives avant de relancer migration:run.',
      );
    }

    // ── L'index ─────────────────────────────────────────────────────────────
    // (source_id, type) unique : une source ne peut être débitée/créditée
    // qu'une fois par type d'opération. Rejeu de webhook ou de cron = 23505.
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "IDX_unique_transaction_source_type"
        ON "transactions" ("source_id", "type")
        WHERE "source_id" IS NOT NULL
          AND "created_at" >= ${this.guardFrom};
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_unique_transaction_source_type";`,
    );
  }
}
