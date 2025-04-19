const db = require('../db');
const logger = require('./logger');
const authService = require('../services/auth-service');

/**
 * Проверяет токены всех пользователей и обновляет их роли
 * @returns {Promise<void>}
 */
async function checkAllUsersTokens() {
  try {
    // Получаем всех пользователей с кошельками
    const walletUsers = await db.query(`
      SELECT u.id, ui.identity_value as address 
      FROM users u
      JOIN user_identities ui ON u.id = ui.user_id
      WHERE ui.identity_type = 'wallet'
    `);
    
    logger.info(`Checking tokens for ${walletUsers.rows.length} users`);
    
    for (const user of walletUsers.rows) {
      try {
        // Используем существующий метод для проверки токенов и обновления роли
        const isAdmin = await authService.checkTokensAndUpdateRole(user.address);
        logger.info(`Updated user ${user.id} with address ${user.address}: admin=${isAdmin}`);
      } catch (error) {
        logger.error(`Error checking tokens for user ${user.id}: ${error.message}`);
      }
    }
    
    logger.info('Token check completed');
  } catch (error) {
    logger.error(`Error checking all users tokens: ${error.message}`);
  }
}

module.exports = {
  checkAllUsersTokens
};