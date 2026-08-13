const { Client } = require('pg');
const client = new Client({ 
  host: 'postgresql-lexotimeaan.alwaysdata.net',
  port: 5432,
  user: 'lexotimeaan', 
  password: 'passer123', 
  database: 'lexotimeaan_xeweul_prod' 
});
client.connect().then(async () => {
  const adminRes = await client.query(`SELECT id FROM users WHERE phone = '+221771111111'`);
  if (adminRes.rows.length > 0) {
    const userId = adminRes.rows[0].id;
    const ownerRes = await client.query(`SELECT id FROM owners WHERE user_id = $1`, [userId]);
    console.log('Owner ID for 771111111:', ownerRes.rows[0]?.id);
  } else {
    const adminRes2 = await client.query(`SELECT id FROM users WHERE phone = '+221773780756'`);
    if(adminRes2.rows.length > 0) {
      const userId2 = adminRes2.rows[0].id;
      const ownerRes2 = await client.query(`SELECT id FROM owners WHERE user_id = $1`, [userId2]);
      console.log('Owner ID for 773780756:', ownerRes2.rows[0]?.id);
    }
  }
  await client.end();
}).catch(console.error);
