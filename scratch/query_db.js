const mysql = require('mysql2/promise');
require('dotenv').config();

async function run() {
  const connection = await mysql.createConnection({
    host: process.env.MYSQL_HOST,
    port: parseInt(process.env.MYSQL_PORT) || 3306,
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    database: process.env.MYSQL_DATABASE,
  });

  console.log('Connected to MySQL database!');
  
  // Check ticket_categories
  const [categories] = await connection.execute('SELECT * FROM ticket_categories');
  console.log('Ticket categories:', categories);

  await connection.end();
}

run().catch(console.error);
