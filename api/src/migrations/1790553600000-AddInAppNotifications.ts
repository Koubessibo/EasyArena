import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Phase 1 — Système de notifications in-app.
 *
 * Rend la table `notifications` capable de porter des notifications
 * applicatives (channel = 'in_app') en plus du journal d'envois SMS/email.
 *
 * Points de vigilance PostgreSQL :
 *  - Les valeurs issues de `CREATE TYPE AS ENUM` sont utilisables dans la
 *    même transaction -> backfill et DEFAULT sans risque.
 *  - Une valeur ajoutée par `ALTER TYPE ... ADD VALUE` NE PEUT PAS être
 *    utilisée avant commit. On ajoute donc 'in_app' au type `channel`
 *    sans jamais inscrire cette valeur dans ce même transaction.
 *  - La colonne `sent_at` (nom historique) est conservée : elle sert de
 *    timestamp de création et renommer casserait les données existantes.
 */
export class AddInAppNotifications1790553600000 implements MigrationInterface {
  name = 'AddInAppNotifications1790553600000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── 1. Type du canal : créer avec 'in_app' si absent, sinon l'ajouter ──
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_type t
          JOIN pg_namespace n ON n.oid = t.typnamespace
          WHERE t.typname = 'notifications_channel_enum'
            AND n.nspname = current_schema()
        ) THEN
          CREATE TYPE notifications_channel_enum AS ENUM ('sms', 'email', 'in_app');
        END IF;
      END $$;
    `);

    // No-op si la valeur existe déjà (base fraîche). Valeur non utilisée dans
    // cette transaction -> conforme à la règle "unsafe use of new value".
    await queryRunner.query(
      `ALTER TYPE notifications_channel_enum ADD VALUE IF NOT EXISTS 'in_app';`,
    );

    // ── 2. Nouveaux types d'enum ────────────────────────────────────────────
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE notifications_type_enum AS ENUM (
          'booking_new', 'booking_confirmed', 'booking_cancelled',
          'booking_refund_ok', 'booking_refund_failed', 'booking_rated',
          'cancellation_requested', 'cancellation_approved', 'cancellation_rejected',
          'payment_ok', 'payment_failed',
          'order_new', 'order_paid', 'order_shipped', 'order_delivered',
          'order_cancelled', 'stock_low',
          'ticket_purchased', 'ticket_validated', 'event_reminded', 'event_cancelled',
          'scan_success', 'scan_failed', 'shift_summary',
          'subscription_reminder', 'subscription_due', 'subscription_suspended',
          'subscription_reactivated', 'subscription_expired',
          'commission_earned', 'commission_unlocked',
          'withdrawal_requested', 'withdrawal_approved', 'withdrawal_rejected',
          'withdrawal_paid', 'withdrawal_failed',
          'field_status_changed', 'field_created', 'staff_invited',
          'staff_permissions_changed', 'schedule_assigned',
          'account_suspended', 'account_pin_changed', 'account_created',
          'enrollment_new', 'security_alert', 'system_alert', 'kpi_digest',
          'promo'
        );
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE notifications_priority_enum AS ENUM ('action', 'info', 'digest');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    // Requis uniquement si la table doit être créée (sinon déjà en place).
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE notifications_status_enum AS ENUM ('sent', 'failed');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    // ── 3. Table : créée si absente (dev/schéma neuf), no-op sinon ──────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "notifications" (
        "id"          uuid NOT NULL DEFAULT gen_random_uuid(),
        "user_id"     uuid NOT NULL,
        "channel"     notifications_channel_enum NOT NULL,
        "type"        notifications_type_enum NOT NULL,
        "subject"     character varying,
        "title"       character varying(150),
        "message"     text NOT NULL,
        "link"        character varying(255),
        "metadata"    jsonb,
        "priority"    notifications_priority_enum NOT NULL DEFAULT 'info',
        "dedupe_key"  character varying(191),
        "status"      notifications_status_enum NOT NULL,
        "is_read"     boolean NOT NULL DEFAULT false,
        "read_at"     TIMESTAMP WITHOUT TIME ZONE,
        "sent_at"     TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_notifications" PRIMARY KEY ("id"),
        CONSTRAINT "FK_notifications_user" FOREIGN KEY ("user_id")
          REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION
      );
    `);

    // ── 4. Colonnes manquantes (cas de la table existante en prod) ──────────
    await queryRunner.query(
      `ALTER TABLE "notifications" ADD COLUMN IF NOT EXISTS "type" notifications_type_enum;`,
    );
    await queryRunner.query(
      `ALTER TABLE "notifications" ADD COLUMN IF NOT EXISTS "title" character varying(150);`,
    );
    await queryRunner.query(
      `ALTER TABLE "notifications" ADD COLUMN IF NOT EXISTS "link" character varying(255);`,
    );
    await queryRunner.query(
      `ALTER TABLE "notifications" ADD COLUMN IF NOT EXISTS "metadata" jsonb;`,
    );
    await queryRunner.query(
      `ALTER TABLE "notifications" ADD COLUMN IF NOT EXISTS "priority" notifications_priority_enum;`,
    );
    await queryRunner.query(
      `ALTER TABLE "notifications" ADD COLUMN IF NOT EXISTS "dedupe_key" character varying(191);`,
    );
    await queryRunner.query(
      `ALTER TABLE "notifications" ADD COLUMN IF NOT EXISTS "read_at" TIMESTAMP WITHOUT TIME ZONE;`,
    );

    // ── 5. Backfill des lignes historiques (journal SMS) ────────────────────
    // `type`/`priority` proviennent de CREATE TYPE dans cette transaction -> safe.
    await queryRunner.query(`
      UPDATE "notifications" SET "type" = 'system_alert' WHERE "type" IS NULL;
    `);
    await queryRunner.query(`
      UPDATE "notifications" SET "priority" = 'info' WHERE "priority" IS NULL;
    `);

    // read_at = sent_at pour les lignes déjà marquées lues (si la colonne existe).
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = current_schema()
            AND table_name = 'notifications' AND column_name = 'sent_at'
        ) THEN
          UPDATE "notifications"
             SET "read_at" = "sent_at"
           WHERE "is_read" = true AND "read_at" IS NULL;
        END IF;
      END $$;
    `);

    // ── 6. Contraintes ──────────────────────────────────────────────────────
    await queryRunner.query(
      `ALTER TABLE "notifications" ALTER COLUMN "priority" SET DEFAULT 'info';`,
    );
    await queryRunner.query(
      `ALTER TABLE "notifications" ALTER COLUMN "priority" SET NOT NULL;`,
    );
    await queryRunner.query(
      `ALTER TABLE "notifications" ALTER COLUMN "type" SET NOT NULL;`,
    );

    // ── 7. Index ────────────────────────────────────────────────────────────
    // Idempotence des notifications (cron / webhook rejoué).
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "uq_notifications_dedupe_key"
        ON "notifications" ("dedupe_key") WHERE "dedupe_key" IS NOT NULL;
    `);
    // Filtrage par type.
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_notifications_user_type"
        ON "notifications" ("user_id", "type");
    `);
    // Compteur de non-lus (le plus sollicité).
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_notifications_unread"
        ON "notifications" ("user_id") WHERE "is_read" = false;
    `);
    // Pagination du fil.
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_notifications_user_sent_at"
        ON "notifications" ("user_id", "sent_at" DESC);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_notifications_user_sent_at";`,
    );
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_notifications_unread";`);
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_notifications_user_type";`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "uq_notifications_dedupe_key";`,
    );

    await queryRunner.query(
      `ALTER TABLE "notifications" ALTER COLUMN "type" DROP NOT NULL;`,
    );
    await queryRunner.query(
      `ALTER TABLE "notifications" ALTER COLUMN "priority" DROP NOT NULL;`,
    );
    await queryRunner.query(
      `ALTER TABLE "notifications" ALTER COLUMN "priority" DROP DEFAULT;`,
    );

    await queryRunner.query(
      `ALTER TABLE "notifications" DROP COLUMN IF EXISTS "read_at";`,
    );
    await queryRunner.query(
      `ALTER TABLE "notifications" DROP COLUMN IF EXISTS "dedupe_key";`,
    );
    await queryRunner.query(
      `ALTER TABLE "notifications" DROP COLUMN IF EXISTS "priority";`,
    );
    await queryRunner.query(
      `ALTER TABLE "notifications" DROP COLUMN IF EXISTS "metadata";`,
    );
    await queryRunner.query(
      `ALTER TABLE "notifications" DROP COLUMN IF EXISTS "link";`,
    );
    await queryRunner.query(
      `ALTER TABLE "notifications" DROP COLUMN IF EXISTS "title";`,
    );
    await queryRunner.query(
      `ALTER TABLE "notifications" DROP COLUMN IF EXISTS "type";`,
    );

    // PostgreSQL n'autorise pas la suppression d'une valeur d'enum : la
    // valeur 'in_app' reste dans notifications_channel_enum (inoffensive).
  }
}
