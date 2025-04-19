const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// Подключение к БД
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

async function runMigrations() {
  try {
    console.log('Запуск миграций...');

    // Создаем таблицу для отслеживания миграций, если её нет
    await pool.query(`
      CREATE TABLE IF NOT EXISTS migrations (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        applied_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // Получаем список уже примененных миграций
    const { rows } = await pool.query('SELECT name FROM migrations');
    const appliedMigrations = rows.map((row) => row.name);

    // Получаем список файлов миграций
    const migrationsDir = path.join(__dirname, '../migrations');
    const migrationFiles = fs
      .readdirSync(migrationsDir)
      .filter((file) => file.endsWith('.sql'))
      .sort(); // Сортируем файлы по имени

    // Применяем миграции, которые еще не были применены
    for (const file of migrationFiles) {
      if (!appliedMigrations.includes(file)) {
        console.log(`Применение миграции: ${file}`);

        // Читаем содержимое файла миграции
        const filePath = path.join(migrationsDir, file);
        const sql = fs.readFileSync(filePath, 'utf8');

        // Выполняем SQL-запросы из файла
        await pool.query(sql);

        // Записываем информацию о примененной миграции
        await pool.query('INSERT INTO migrations (name) VALUES ($1)', [file]);

        console.log(`Миграция ${file} успешно применена`);
      } else {
        console.log(`Миграция ${file} уже применена`);
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
