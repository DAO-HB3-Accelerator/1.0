const fs = require('fs').promises;
const path = require('path');
require('dotenv').config();
const { pool } = require('../db');
const logger = require('../utils/logger');

async function runMigrations() {
  try {
    console.log('Запуск миграций...');

    // Создаем таблицу для отслеживания миграций, если её нет
    await pool.query(`
      CREATE TABLE IF NOT EXISTS migrations (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Получаем список выполненных миграций
    const { rows } = await pool.query('SELECT name FROM migrations');
    const executedMigrations = new Set(rows.map(row => row.name));

    // Читаем файлы миграций
    const migrationsDir = path.join(__dirname, '../db/migrations');
    const files = await fs.readdir(migrationsDir);

    // Сортируем файлы по номеру
    const migrationFiles = files
      .filter(f => f.endsWith('.sql'))
      .sort((a, b) => {
        const numA = parseInt(a.split('_')[0]);
        const numB = parseInt(b.split('_')[0]);
        return numA - numB;
      });

    // Выполняем миграции
    for (const file of migrationFiles) {
      if (!executedMigrations.has(file)) {
        const filePath = path.join(migrationsDir, file);
        const sql = await fs.readFile(filePath, 'utf-8');

        await pool.query('BEGIN');
        try {
          await pool.query(sql);
          await pool.query('INSERT INTO migrations (name) VALUES ($1)', [file]);
          await pool.query('COMMIT');
          logger.info(`Migration ${file} executed successfully`);
        } catch (error) {
          await pool.query('ROLLBACK');
          throw error;
        }
      }
    }

    // Выполняем SQL-функции
    const functionsDir = path.join(migrationsDir, 'functions');
    if (await fs.stat(functionsDir).then(() => true).catch(() => false)) {
      const functionFiles = await fs.readdir(functionsDir);
      
      for (const file of functionFiles) {
        if (file.endsWith('.sql')) {
          const filePath = path.join(functionsDir, file);
          const sql = await fs.readFile(filePath, 'utf-8');
          
          try {
            await pool.query(sql);
            logger.info(`Function ${file} executed successfully`);
          } catch (error) {
            logger.error(`Error executing function ${file}:`, error);
            throw error;
          }
        }
      }
    }

    console.log('Все миграции успешно применены');
  } catch (error) {
    console.error('Ошибка при выполнении миграций:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runMigrations();
