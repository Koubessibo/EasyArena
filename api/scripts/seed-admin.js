const { Client } = require('pg');
const bcrypt = require('bcrypt');
const { randomUUID } = require('crypto');

const ADMIN_PHONE = '+22177000000';
const ADMIN_PIN = '1234';
const SALT_ROUNDS = 10;

async function main() {
  const client = new Client({
    host: 'postgresql-lexotimeaan.alwaysdata.net',
    port: 5432,
    user: 'lexotimeaan',
    password: 'passer123',
    database: 'lexotimeaan_xeweul_prod',
    ssl: { rejectUnauthorized: false },
  });

  await client.connect();
  console.log('Connected to database.');

  const existing = await client.query('SELECT id FROM users WHERE phone = $1', [ADMIN_PHONE]);
  if (existing.rows.length > 0) {
    console.log(`Admin with phone ${ADMIN_PHONE} already exists (id: ${existing.rows[0].id}). Aborting.`);
    await client.end();
    return;
  }

  const pin_hash = await bcrypt.hash(ADMIN_PIN, SALT_ROUNDS);
  const id = randomUUID();
  const now = new Date();

  await client.query(
    `INSERT INTO users (id, phone, pin_hash, first_name, last_name, email, role, status, must_change_pin, login_attempts, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
    [
      id,
      ADMIN_PHONE,
      pin_hash,
      'Admin',
      'XEWEUL',
      'ndenealexandreadiouma@gmail.com',
      'admin',
      'active',
      false,
      0,
      now,
      now,
    ]
  );

  console.log('');
  console.log('Admin account created successfully!');
  console.log('--------------------------------');
  console.log(`Phone : ${ADMIN_PHONE}`);
  console.log(`PIN   : ${ADMIN_PIN}`);
  console.log(`Role  : admin`);
  console.log(`ID    : ${id}`);
  console.log('--------------------------------');

  await client.end();
}

main().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
