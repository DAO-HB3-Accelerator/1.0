// Инициализация таблицы roles
async function initRoles() {
  try {
    // Проверяем, существует ли таблица roles
    const tableExists = await db.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'roles'
      );
    `);
    
    if (!tableExists.rows[0].exists) {
      // Создаем таблицу roles
      await db.query(`
        CREATE TABLE roles (
          id SERIAL PRIMARY KEY,
          name VARCHAR(50) NOT NULL UNIQUE,
          description TEXT,
          created_at TIMESTAMP NOT NULL DEFAULT NOW()
        );
      `);
      
      // Добавляем роли
      await db.query(`
        INSERT INTO roles (id, name, description) VALUES 
        (3, 'user', 'Обычный пользователь'),
        (4, 'admin', 'Администратор с полным доступом');
      `);
      
      console.log('Таблица roles создана и заполнена');
    } else {
      // Проверяем наличие ролей
      const rolesExist = await db.query(`
        SELECT COUNT(*) FROM roles WHERE id IN (3, 4);
      `);
      
      if (rolesExist.rows[0].count < 2) {
        // Добавляем недостающие роли
        const userRoleExists = await db.query(`SELECT EXISTS (SELECT FROM roles WHERE name = 'user');`);
        const adminRoleExists = await db.query(`SELECT EXISTS (SELECT FROM roles WHERE name = 'admin');`);
        
        if (!userRoleExists.rows[0].exists) {
          await db.query(`
            INSERT INTO roles (id, name, description) VALUES 
            (3, 'user', 'Обычный пользователь');
          `);
        }
        
        if (!adminRoleExists.rows[0].exists) {
          await db.query(`
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