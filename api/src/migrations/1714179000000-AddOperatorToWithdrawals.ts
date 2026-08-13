import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddOperatorToWithdrawals1714179000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create MobileOperator enum type if it doesn't exist
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE withdrawals_operator_enum AS ENUM ('WAVE', 'ORANGE_MONEY');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    // Add operator column if it doesn't exist
    await queryRunner.query(`
      ALTER TABLE "withdrawals"
      ADD COLUMN IF NOT EXISTS "operator" withdrawals_operator_enum;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "withdrawals" DROP COLUMN IF EXISTS "operator";`);
  }
}
