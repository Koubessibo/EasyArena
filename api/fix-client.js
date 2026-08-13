const { Client } = require('pg');
const client = new Client({ 
  host: 'postgresql-lexotimeaan.alwaysdata.net',
  port: 5432,
  user: 'lexotimeaan', 
  password: 'passer123', 
  database: 'lexotimeaan_xeweul_prod' 
});
client.connect().then(async () => {
  const res = await client.query(`UPDATE users SET phone = '+221773333333' WHERE phone = '773333333'`);
  console.log('Updated rows:', res.rowCount);
  await client.end();
}).catch(console.error);
