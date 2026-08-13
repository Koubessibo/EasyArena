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
  if (adminRes.rows.length > 0) {
    const hash = adminRes.rows[0].pin_hash;
    const updateRes = await client.query(`UPDATE users SET pin_hash = $1 WHERE phone = '+221773333333'`, [hash]);
    console.log('Updated 773333333 PIN to 1234, rows affected:', updateRes.rowCount);
  }
  await client.end();
}).catch(console.error);
