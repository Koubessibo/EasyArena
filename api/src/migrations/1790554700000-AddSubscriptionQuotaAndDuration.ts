import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * BLOC 1 & BLOC 3 — Impact métier de l'abonnement.
 *
 * 1. `user_subscriptions.reservations_used`
 *    Compteur de séances consommées par souscription. `reservations_count`
 *    vit sur le *plan*, partagé par tous ses souscripteurs : il ne peut pas
 *    servir de quota individuel. On garde donc `reservations_count` comme
 *    source de vérité du plan, et on stocke la consommation par abonnement.
 *    Restant = `plan.reservations_count - sub.reservations_used`.
 *
 * 2. `subscription_plans.duration_days`
 *    La validité était figée à +1 an dans `subscribeClient()`, sans rapport
 *    avec la formule. La durée devient une propriété du plan.
 *
 * 3. Statuts `completed` / `cancelled`
 *    L'enum ne comptait que pending/active/suspended/expired :
 *    - `completed`  = quota entièrement consommé (BLOC 1) ;
 *    - `cancelled`  = souscription stérilisée faute de paiement (BLOC 3).
 *    Sans ces deux valeurs, la purge des `pending` orphelins et l'extinction
 *    du quota auraient été indiscernables d'une simple expiration.
 *
 * 4. `notifications_type_enum += 'subscription_confirmed'`
 *    L'activation après webhook n'émettait aucune notification in-app, alors
 *    que la Phase 3 exigeait un lien profond par événement. `subscription_due`
 *    et `subscription_suspended` existaient déjà, mais `subscription_reactivated`
 *    décrit une *réactivation* et fausserait le filtre thématique du fil.
 *
 * Notes
 * - `ALTER TYPE ... ADD VALUE` est autorisé dans une transaction depuis
 *   PostgreSQL 12 (prod : 16.15) à condition de ne pas *utiliser* la nouvelle
 *   valeur dans cette même transaction — ce que cette migration ne fait pas.
 * - Une valeur d'enum ne peut pas être retirée : `down()` laisse donc les
 *   valeurs en place (inertes après retours en arrière côté TypeScript).
 * - Le nom généré par TypeORM pour le type de `user_subscriptions.status` est
 *   résolu dynamiquement (`pg_attribute`) : aucune dépendance au naming.
 */
export class AddSubscriptionQuotaAndDuration1790554700000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── 1. Quota de séances par souscription ────────────────────────────
    await queryRunner.query(
      `ALTER TABLE "user_subscriptions"
         ADD COLUMN IF NOT EXISTS "reservations_used" integer NOT NULL DEFAULT 0`,
    );

    // ── 2. Durée réelle de la formule ───────────────────────────────────
    await queryRunner.query(
      `ALTER TABLE "subscription_plans"
         ADD COLUMN IF NOT EXISTS "duration_days" integer NOT NULL DEFAULT 30`,
    );

    // ── 3. Statuts completed / cancelled ────────────────────────────────
    await queryRunner.query(`
      DO $$
      DECLARE enum_type text;
      BEGIN
        SELECT t.typname INTO enum_type
          FROM pg_attribute a
          JOIN pg_class c     ON c.oid = a.attrelid
          JOIN pg_type t      ON t.oid = a.atttypid
          JOIN pg_namespace n ON n.oid = c.relnamespace
         WHERE c.relname = 'user_subscriptions'
           AND a.attname  = 'status'
           AND n.nspname  = current_schema()
           AND t.typtype  = 'e';

        IF enum_type IS NULL THEN
          RAISE EXCEPTION 'Enum type for user_subscriptions.status not found';
        END IF;

        EXECUTE format('ALTER TYPE %I ADD VALUE IF NOT EXISTS %L', enum_type, 'completed');
        EXECUTE format('ALTER TYPE %I ADD VALUE IF NOT EXISTS %L', enum_type, 'cancelled');
      END $$;
    `);

    // ── 4. Type de notification « souscription confirmée » ──────────────
    await queryRunner.query(
      `ALTER TYPE "notifications_type_enum"
         ADD VALUE IF NOT EXISTS 'subscription_confirmed'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "user_subscriptions" DROP COLUMN IF EXISTS "reservations_used"`,
    );
    await queryRunner.query(
      `ALTER TABLE "subscription_plans" DROP COLUMN IF EXISTS "duration_days"`,
    );
    // `ALTER TYPE ... DROP VALUE` n'existe pas en PostgreSQL :
    // 'completed', 'cancelled' et 'subscription_confirmed' restent déclarés
    // mais ne sont plus référencés côté TypeScript après retournement.
  }
}
