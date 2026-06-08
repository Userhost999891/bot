require('dotenv').config({ path: '../.env' });
const mysql = require('mysql2/promise');

async function check() {
  const connection = await mysql.createConnection({
    host: process.env.MYSQL_HOST,
    port: parseInt(process.env.MYSQL_PORT) || 3306,
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    database: process.env.MYSQL_DATABASE
  });

  try {
    const [rows] = await connection.execute('SELECT * FROM guild_config');
    console.log('Guild Config rows in database:');
    console.log(JSON.stringify(rows, null, 2));
  } catch (err) {
    console.error('Error querying database:', err);
  } finally {
    await connection.end();
  }
}

check();
