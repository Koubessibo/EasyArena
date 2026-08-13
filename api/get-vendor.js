const { Client } = require('pg');
const client = new Client({ 
  host: 'postgresql-lexotimeaan.alwaysdata.net',
  port: 5432,
  user: 'lexotimeaan', 
  password: 'passer123', 
  database: 'lexotimeaan_xeweul_prod' 
});
client.connect().then(async () => {
  const adminRes = await client.query(`SELECT pin_hash FROM users WHERE phone = '+221771111111'`);
  const hash = adminRes.rows[0].pin_hash;

  const vendorRes = await client.query(`SELECT phone FROM users WHERE role = 'vendor' LIMIT 1`);
  if (vendorRes.rows.length > 0) {
    const phone = vendorRes.rows[0].phone;
    await client.query(`UPDATE users SET pin_hash = $1 WHERE phone = $2`, [hash, phone]);
    console.log('Vendor account ready:', phone, 'PIN: 1234');
  } else {
    console.log('No vendor found');
  }
  await client.end();
}).catch(console.error);
