const { Client } = require('pg');
const client = new Client({ 
  host: 'postgresql-lexotimeaan.alwaysdata.net',
  port: 5432,
  user: 'lexotimeaan', 
  password: 'passer123', 
  database: 'lexotimeaan_xeweul_prod' 
});
client.connect().then(async () => {
  const updateRes = await client.query(`UPDATE users SET role = 'client' WHERE phone = '+221773333333'`);
  console.log('Updated 773333333 to client role, rows affected:', updateRes.rowCount);
  const res = await client.query(`SELECT phone, role FROM users WHERE phone = '+221773333333'`);
  console.log(res.rows);
  await client.end();
}).catch(console.error);
