/**
 * Seed script: creates an admin user with phone + PIN.
 * Usage: npx ts-node seed-admin.ts
 *
 * Admin credentials:
 *   phone: +221700000000
 *   PIN:   1234
 */
import 'dotenv/config';
import { DataSource } from 'typeorm';
import * as bcrypt from 'bcrypt';
import * as path from 'path';

const ds = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT ?? 5432),
  username: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  ssl: { rejectUnauthorized: false },
  entities: [path.join(__dirname, 'src/**/*.entity.ts')],
});

async function main() {
  await ds.initialize();

  const PHONE = '+221700000000';
  const PIN   = '1234';
  const SALT  = 10;

  const existing = await ds.query(
    `SELECT id FROM "users" WHERE phone = $1`, [PHONE]
  );

  const pin_hash = await bcrypt.hash(PIN, SALT);

  if (existing.length) {
    await ds.query(
      `UPDATE "users" SET role='admin', status='active', pin_hash=$1, login_attempts=0, must_change_pin=false WHERE phone=$2`,
      [pin_hash, PHONE]
    );
    console.log(`✓ Updated existing user ${PHONE} to admin`);
  } else {
    await ds.query(
      `INSERT INTO "users" (phone, first_name, last_name, role, status, pin_hash, login_attempts, created_at, updated_at)
       VALUES ($1, 'Admin', 'XEWEUL', 'admin', 'active', $2, 0, NOW(), NOW())`,
      [PHONE, pin_hash]
    );
    console.log(`✓ Created admin user ${PHONE}`);
  }

  console.log('  Phone : ' + PHONE);
  console.log('  PIN   : ' + PIN);
  await ds.destroy();
}

main().catch(err => { console.error(err); process.exit(1); });
