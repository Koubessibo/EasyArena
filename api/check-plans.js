const { Client } = require('pg');
const client = new Client({ 
  host: 'postgresql-lexotimeaan.alwaysdata.net',
  port: 5432,
  user: 'lexotimeaan', 
  password: 'passer123', 
  database: 'lexotimeaan_xeweul_prod' 
});
client.connect().then(async () => {
  const plans = await client.query(`SELECT * FROM subscription_plans`);
  console.log('PLANS:', plans.rows);
  await client.end();
}).catch(console.error);
