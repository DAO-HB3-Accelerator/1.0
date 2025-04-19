const { Pool } = require('pg');
const logger = require('../utils/logger');

const pool = new Pool({
  user: process.env.DB_USER || 'dapp_user',
  host: process.env.DB_HOST || 'localhost',
  database: process.env.DB_NAME || 'dapp_db',
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT || 5432,
});

// Проверка подключения
pool.query('SELECT NOW()', (err, res) => {
  if (err) {
    logger.error('Error connecting to database:', err);
  } else {
    logger.info('Успешное подключение к базе данных:', res.rows[0]);
  }
});

module.exports = { pool };