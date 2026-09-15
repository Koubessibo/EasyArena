import { DataSource } from 'typeorm';
import * as bcrypt from 'bcrypt';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../.env') });

const isSsl = process.env.DB_SSL === 'true' || process.env.DATABASE_URL?.includes('sslmode=require');

let dbHost = process.env.DB_HOST;
let dbPort = parseInt(process.env.DB_PORT || '5432', 10);
let dbUser = process.env.DB_USERNAME;
let dbPass = process.env.DB_PASSWORD;
let dbName = process.env.DB_NAME;

if (process.env.DATABASE_URL && (!dbHost || !dbUser)) {
  try {
    const parsed = new URL(process.env.DATABASE_URL);
    dbHost = parsed.hostname;
    dbPort = parseInt(parsed.port || '5432', 10);
    dbUser = decodeURIComponent(parsed.username);
    dbPass = decodeURIComponent(parsed.password);
    dbName = parsed.pathname.replace(/^\//, '');
  } catch (e) {
    console.error('Failed to parse DATABASE_URL:', e);
  }
}

console.log(`Connecting to database at ${dbHost}:${dbPort}/${dbName}...`);

const dataSource = new DataSource({
  type: 'postgres',
  host: dbHost,
  port: dbPort,
  username: dbUser,
  password: dbPass,
  database: dbName,
  ssl: isSsl ? { rejectUnauthorized: false } : false,
  entities: [path.join(__dirname, '/**/*.entity{.ts,.js}')],
  synchronize: false,
});

async function runSeed() {
  try {
    await dataSource.initialize();
    console.log('✅ Database connection established.');

    const queryRunner = dataSource.createQueryRunner();
    const pinHash = await bcrypt.hash('1234', 10);

    console.log('\n--- 1. SEEDING CORE USERS & ACCOUNTS ---');

    // 1. Super Admin
    let superAdmin = await queryRunner.query(
      `SELECT id FROM users WHERE phone = '+221770000000' OR phone = '770000000'`
    );
    if (superAdmin.length === 0) {
      const res = await queryRunner.query(`
        INSERT INTO users (phone, first_name, last_name, role, status, pin_hash, must_change_pin, login_attempts)
        VALUES ('+221770000000', 'Super', 'Admin', 'admin', 'active', '${pinHash}', false, 0)
        RETURNING id
      `);
      console.log('✅ Created Super Admin (+221770000000)');
    } else {
      await queryRunner.query(`
        UPDATE users 
        SET pin_hash = '${pinHash}', status = 'active', must_change_pin = false, login_attempts = 0 
        WHERE id = '${superAdmin[0].id}'
      `);
      console.log('✅ Updated Super Admin (+221770000000)');
    }

    // 2. Owner (Lionel DIEDHIOU)
    let ownerUser = await queryRunner.query(
      `SELECT id FROM users WHERE phone = '+221773780756' OR phone = '773780756'`
    );
    let ownerUserId = '';
    if (ownerUser.length === 0) {
      const res = await queryRunner.query(`
        INSERT INTO users (phone, first_name, last_name, role, status, pin_hash, must_change_pin, login_attempts)
        VALUES ('+221773780756', 'Lionel', 'DIEDHIOU', 'owner', 'active', '${pinHash}', false, 0)
        RETURNING id
      `);
      ownerUserId = res[0].id;
      console.log('✅ Created Owner user (+221773780756)');
    } else {
      ownerUserId = ownerUser[0].id;
      await queryRunner.query(`
        UPDATE users 
        SET pin_hash = '${pinHash}', status = 'active', must_change_pin = false, login_attempts = 0 
        WHERE id = '${ownerUserId}'
      `);
      console.log('✅ Updated Owner user (+221773780756)');
    }

    // Ensure Owner record
    const existingOwnerRecord = await queryRunner.query(
      `SELECT id FROM owners WHERE user_id = '${ownerUserId}'`
    );
    let ownerRecordId = '';
    if (existingOwnerRecord.length === 0) {
      const res = await queryRunner.query(`
        INSERT INTO owners (user_id, mobile_money)
        VALUES ('${ownerUserId}', '+221773780756')
        RETURNING id
      `);
      ownerRecordId = res[0].id;
      console.log('✅ Created Owner profile for Lionel DIEDHIOU');
    } else {
      ownerRecordId = existingOwnerRecord[0].id;
    }

    // 3. Vendor (Joseph DIEDHIOU)
    let vendorUser = await queryRunner.query(
      `SELECT id FROM users WHERE phone = '+221763827361' OR phone = '763827361'`
    );
    let vendorUserId = '';
    if (vendorUser.length === 0) {
      const res = await queryRunner.query(`
        INSERT INTO users (phone, first_name, last_name, role, status, pin_hash, must_change_pin, login_attempts)
        VALUES ('+221763827361', 'Joseph', 'DIEDHIOU', 'vendor', 'active', '${pinHash}', false, 0)
        RETURNING id
      `);
      vendorUserId = res[0].id;
      console.log('✅ Created Vendor user (+221763827361)');
    } else {
      vendorUserId = vendorUser[0].id;
      await queryRunner.query(`
        UPDATE users 
        SET pin_hash = '${pinHash}', status = 'active', must_change_pin = false, login_attempts = 0 
        WHERE id = '${vendorUserId}'
      `);
      console.log('✅ Updated Vendor user (+221763827361)');
    }

    // Ensure Vendor record
    const existingVendorRecord = await queryRunner.query(
      `SELECT id FROM vendors WHERE user_id = '${vendorUserId}'`
    );
    if (existingVendorRecord.length === 0) {
      await queryRunner.query(`
        INSERT INTO vendors (user_id, shop_name, contact_phone, location)
        VALUES ('${vendorUserId}', 'Boutique EasyArena', '+221763827361', 'Dakar, Sénégal')
      `);
      console.log('✅ Created Vendor profile for Joseph DIEDHIOU');
    }

    // 4. Controller & Client (Koubessibo DIEDHIOU)
    let controllerUser = await queryRunner.query(
      `SELECT id FROM users WHERE phone = '+221766992661' OR phone = '766992661'`
    );
    let controllerUserId = '';
    if (controllerUser.length === 0) {
      const res = await queryRunner.query(`
        INSERT INTO users (phone, first_name, last_name, role, status, pin_hash, must_change_pin, login_attempts)
        VALUES ('+221766992661', 'Koubessibo', 'DIEDHIOU', 'controller', 'active', '${pinHash}', false, 0)
        RETURNING id
      `);
      controllerUserId = res[0].id;
      console.log('✅ Created Controller user (+221766992661)');
    } else {
      controllerUserId = controllerUser[0].id;
      await queryRunner.query(`
        UPDATE users 
        SET pin_hash = '${pinHash}', status = 'active', must_change_pin = false, login_attempts = 0 
        WHERE id = '${controllerUserId}'
      `);
      console.log('✅ Updated Controller user (+221766992661)');
    }

    // Ensure Client profile for controller/clients
    const clientRecord = await queryRunner.query(
      `SELECT id FROM clients WHERE user_id = '${controllerUserId}'`
    );
    if (clientRecord.length === 0) {
      await queryRunner.query(`
        INSERT INTO clients (user_id)
        VALUES ('${controllerUserId}')
      `);
      console.log('✅ Created Client profile for Koubessibo DIEDHIOU');
    }

    console.log('\n--- 2. SEEDING FIELDS & SCHEDULES ---');
    const existingFields = await queryRunner.query(`SELECT COUNT(*) FROM fields`);
    if (parseInt(existingFields[0].count, 10) === 0) {
      const fieldRes = await queryRunner.query(`
        INSERT INTO fields (
          owner_id, name, sport_type, address, latitude, longitude,
          contact_phone, description, surface_type, has_lighting,
          has_changing_rooms, has_parking, status
        ) VALUES (
          '${ownerRecordId}',
          'Arena Dakar Fann',
          'football',
          'Fann Résidence, Dakar',
          14.6937,
          -17.4721,
          '+221773780756',
          'Terrain synthétique de football 5x5 avec éclairage LED nocturne et vestiaires haut de gamme.',
          'Synthétique',
          true,
          true,
          true,
          'available'
        ) RETURNING id
      `);
      const fieldId = fieldRes[0].id;
      console.log(`✅ Created Demo Field "Arena Dakar Fann" (${fieldId})`);

      // Add default schedule (Monday to Sunday, 08:00 - 23:00)
      for (let day = 0; day <= 6; day++) {
        await queryRunner.query(`
          INSERT INTO field_schedules (
            field_id, day_of_week, open_time, close_time, slot_duration_minutes,
            price_per_slot, is_active
          ) VALUES (
            '${fieldId}', ${day}, '08:00', '23:00', 60, 20000, true
          )
        `);
      }
      console.log('✅ Added 7-day schedule slots (20 000 FCFA / heure)');
    } else {
      console.log(`✅ Fields already exist (${existingFields[0].count} fields found).`);
    }

    console.log('\n--- 3. VERIFYING SEEDED ACCOUNTS ---');
    const allUsers = await queryRunner.query(
      `SELECT id, phone, first_name, last_name, role, status FROM users ORDER BY role, first_name`
    );
    console.table(allUsers);

    console.log('\n🎉 Database Seed & Security Check Completed Successfully!');
    await dataSource.destroy();
  } catch (err) {
    console.error('❌ Error running seed:', err);
    process.exit(1);
  }
}

runSeed();
