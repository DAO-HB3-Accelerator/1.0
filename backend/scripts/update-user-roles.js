const { checkAllUsersTokens } = require('../utils/access-check');
const db = require('../db');
const logger = require('../utils/logger');

async function updateRolesFromOldStructure() {
  try {
    logger.info('Starting migration of user roles from old structure');
    
    // Получаем пользователей со старым полем role
    const usersWithOldRoles = await db.query(`
      SELECT id, role, address 
      FROM users 
      WHERE role IS NOT NULL AND role_id IS NULL
    `);
    
    logger.info(`Found ${usersWithOldRoles.rows.length} users with old role structure`);
    
    for (const user of usersWithOldRoles.rows) {
      // Определяем ID роли
      let roleId = 2; // По умолчанию 'user'
      
      if (user.role === 'ADMIN' || user.role === 'admin') {
        roleId = 1; // 'admin'
      }
      
      // Обновляем пользователя
      await db.query(
        'UPDATE users SET role_id = $1 WHERE id = $2',
        [roleId, user.id]
      );
      
      logger.info(`Updated user ${user.id} with role_id ${roleId} (from old role ${user.role})`);
    }
    
    // Запускаем проверку токенов для всех пользователей
    await checkAllUsersTokens();
    
    logger.info('Role migration completed successfully');
  } catch (error) {
    logger.error(`Error during role migration: ${error.message}`);
  }
}

// Запуск скрипта
updateRolesFromOldStructure()
  .then(() => {
    logger.info('Migration script completed');
    process.exit(0);
  })
  .catch(error => {
    logger.error(`Unhandled error: ${error.message}`);
    process.exit(1);
  }); 