const { Client } = require('pg');
const client = new Client({ 
  host: 'postgresql-lexotimeaan.alwaysdata.net',
  port: 5432,
  user: 'lexotimeaan', 
  password: 'passer123', 
  database: 'lexotimeaan_xeweul_prod' 
});
client.connect().then(async () => {
  const subs = await client.query(`SELECT id, status, plan_id FROM user_subscriptions ORDER BY created_at DESC LIMIT 1`);
  if (subs.rows.length > 0) {
    const subId = subs.rows[0].id;
    console.log('--- ABONNEMENT ---');
    console.log(subs.rows[0]);
    
    const installments = await client.query(`SELECT amount, due_date, status FROM payment_installments WHERE subscription_id = $1 ORDER BY due_date ASC`, [subId]);
    console.log('--- ÉCHÉANCIER GÉNÉRÉ ---');
    console.log(installments.rows);
  }
  await client.end();
}).catch(console.error);
