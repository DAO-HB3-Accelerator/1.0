const fs = require('fs');
const path = require('path');
const { pool } = require('./index');
const logger = require('../utils/logger');

// Инициализация таблицы roles
async function initRoles() {
  try {
    // Проверяем, существует ли таблица roles
    const tableExists = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'roles'
      );
    `);
    
    if (!tableExists.rows[0].exists) {
      // Создаем таблицу roles
      await pool.query(`
        CREATE TABLE roles (
          id SERIAL PRIMARY KEY,
          name VARCHAR(50) NOT NULL UNIQUE,
          description TEXT,
          created_at TIMESTAMP NOT NULL DEFAULT NOW()
        );
      `);
      
      // Добавляем роли
      await pool.query(`
        INSERT INTO roles (id, name, description) VALUES 
        (3, 'user', 'Обычный пользователь'),
        (4, 'admin', 'Администратор с полным доступом');
      `);
      
      console.log('Таблица roles создана и заполнена');
    } else {
      // Проверяем наличие ролей
      const rolesExist = await pool.query(`
        SELECT COUNT(*) FROM roles WHERE id IN (3, 4);
      `);
      
      if (rolesExist.rows[0].count < 2) {
        // Добавляем недостающие роли
        const userRoleExists = await pool.query(`SELECT EXISTS (SELECT FROM roles WHERE name = 'user');`);
        const adminRoleExists = await pool.query(`SELECT EXISTS (SELECT FROM roles WHERE name = 'admin');`);
        
        if (!userRoleExists.rows[0].exists) {
          await pool.query(`
            INSERT INTO roles (id, name, description) VALUES 
            (3, 'user', 'Обычный пользователь');
          `);
        }
        
        if (!adminRoleExists.rows[0].exists) {
          await pool.query(`
            INSERT INTO roles (id, name, description) VALUES 
            (4, 'admin', 'Администратор с полным доступом');
          `);
        }
        
        console.log('Таблица roles обновлена');
      }
    }
  } catch (error) {
    console.error('Ошибка при инициализации таблицы roles:', error);
    throw error;
  }
}

async function initializeDatabase() {
  try {
    // Создаем таблицу для отслеживания миграций, если её нет
    await pool.query(`
      CREATE TABLE IF NOT EXISTS migrations (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL UNIQUE,
        executed_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `);

    // Путь к папке с миграциями
    const migrationsPath = path.join(__dirname, 'migrations');
    
    // Получаем все файлы миграций
    const migrationFiles = fs.readdirSync(migrationsPath)
      .filter(file => file.endsWith('.sql'))
      .sort();

    // Получаем выполненные миграции
    const { rows } = await pool.query('SELECT name FROM migrations');
    const executedMigrations = new Set(rows.map(row => row.name));

    // Выполняем только новые миграции
    for (const file of migrationFiles) {
      if (!executedMigrations.has(file)) {
        const filePath = path.join(migrationsPath, file);
        const sql = fs.readFileSync(filePath, 'utf8');
        
        logger.info(`Executing migration: ${file}`);
        await pool.query(sql);
        
        // Записываем выполненную миграцию
        await pool.query(
          'INSERT INTO migrations (name) VALUES ($1)',
          [file]
        );
        
        logger.info(`Migration completed: ${file}`);
      }
    }

    logger.info('All migrations completed successfully');
  } catch (error) {
    logger.error('Error during database initialization:', error);
    throw error;
  }
}

module.exports = { initializeDatabase }; 