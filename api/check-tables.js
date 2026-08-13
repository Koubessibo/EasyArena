const { Client } = require('pg');
const client = new Client({ 
  host: 'postgresql-lexotimeaan.alwaysdata.net',
  port: 5432,
  user: 'lexotimeaan', 
  password: 'passer123', 
  database: 'lexotimeaan_xeweul_prod' 
});
client.connect().then(async () => {
  const articlesRes = await client.query(`SELECT COUNT(*) FROM articles`);
  console.log('Articles count:', articlesRes.rows[0].count);
  
  const productsRes = await client.query(`SELECT COUNT(*) FROM products`);
  console.log('Products count:', productsRes.rows[0].count);
  
  await client.end();
}).catch(console.error);
