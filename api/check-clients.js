const { Client } = require('pg');
const client = new Client({ 
  host: 'postgresql-lexotimeaan.alwaysdata.net',
  port: 5432,
  user: 'lexotimeaan', 
  password: 'passer123', 
  database: 'lexotimeaan_xeweul_prod' 
});
client.connect().then(async () => {
  const res = await client.query(`SELECT phone, role FROM users WHERE role = 'client' LIMIT 5`);
  console.log('CLIENTS:', res.rows);
  await client.end();
}).catch(console.error);
