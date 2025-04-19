const db = require('../db');
const { getContract } = require('../utils/contracts');
const logger = require('../utils/logger');
const { ethers } = require('ethers');
const path = require('path');

// Инициализируем провайдер
const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);

const contractsDir = path.join(__dirname, '../artifacts/contracts/AccessToken.sol');

/**
 * Сервис для работы с аутентификацией и авторизацией
 */
class AuthService {
  /**
   * Проверяет наличие токена администратора для кошелька
   * @param {string} walletAddress - Адрес кошелька
   * @returns {Promise<boolean>} - Имеет ли кошелек токен администратора
   */
  async checkAdminToken(walletAddress) {
    try {
      if (!walletAddress) {
        logger.error('Wallet address is undefined');
        return false;
      }

      // Получаем контракт AccessToken
      const accessToken = await getContract('AccessToken');
      
      // Проверяем роль пользователя
      const role = await accessToken.checkRole(walletAddress);
      
      // 0 = ADMIN
      return role === 0;
    } catch (error) {
      logger.error(`Error checking admin token: ${error.message}`);
      return false;
    }
  }

  /**
   * Проверяет наличие токенов на кошельке и обновляет роль
   * @param {string} walletAddress - Адрес кошелька
   * @returns {Promise<boolean>} - Имеет ли пользователь права администратора
   */
  async checkTokensAndUpdateRole(walletAddress) {
    try {
      // Получаем ID пользователя по адресу кошелька
      const userResult = await db.query(`
        SELECT u.id FROM users u
        JOIN user_identities ui ON u.id = ui.user_id
        WHERE ui.identity_type = 'wallet' AND ui.identity_value = $1
      `, [walletAddress]);
      
      if (userResult.rows.length === 0) {
        logger.warn(`User with wallet ${walletAddress} not found`);
        return false;
      }
      
      const userId = userResult.rows[0].id;
      
      // Проверяем наличие токена администратора
      const isAdmin = await this.checkAdminToken(walletAddress);
      
      // Обновляем роль в базе данных
      await this.updateUserRole(userId, isAdmin ? 'admin' : 'user');
      
      logger.info(`User ${userId} with address ${walletAddress}: admin=${isAdmin}`);
      
      return isAdmin;
    } catch (error) {
      logger.error(`Error checking tokens: ${error.message}`);
      return false;
    }
  }

  /**
   * Обновляет роль пользователя в базе данных
   * @param {number} userId - ID пользователя
   * @param {string} role - Новая роль ('admin' или 'user')
   * @returns {Promise<boolean>} - Успешно ли обновлена роль
   */
  async updateUserRole(userId, role) {
    try {
      // Получаем ID роли
      const roleResult = await db.query('SELECT id FROM roles WHERE name = $1', [role]);
      
      if (roleResult.rows.length === 0) {
        logger.error(`Role ${role} not found`);
        return false;
      }
      
      const roleId = roleResult.rows[0].id;
      
      // Обновляем роль пользователя
      await db.query('UPDATE users SET role_id = $1 WHERE id = $2', [roleId, userId]);
      
      logger.info(`Updated role for user ${userId} to ${role}`);
      return true;
    } catch (error) {
      logger.error(`Error updating user role: ${error.message}`);
      return false;
    }
  }

  /**
   * Получает все токены доступа
   * @returns {Promise<Array>} - Список токенов доступа
   */
  async getAllTokens() {
    try {
      const result = await db.query(`
        SELECT * FROM access_tokens
        ORDER BY created_at DESC
      `);
      
      return result.rows.map(token => ({
        id: token.id,
        walletAddress: token.wallet_address,
        role: token.role,
        createdAt: token.created_at,
        expiresAt: token.expires_at,
      }));
    } catch (error) {
      logger.error(`Error getting all tokens: ${error.message}`);
      return [];
    }
  }

  /**
   * Получает ID пользователя по идентификатору
   * @param {string} identityType - Тип идентификатора ('wallet', 'email', 'telegram')
   * @param {string} identityValue - Значение идентификатора
   * @returns {Promise<number|null>} - ID пользователя или null, если пользователь не найден
   */
  async getUserIdByIdentity(identityType, identityValue) {
    try {
      // Нормализуем значение идентификатора
      const normalizedValue = identityType === 'wallet' 
        ? identityValue.toLowerCase() 
        : identityValue;
      
      // Получаем ID пользователя
      const result = await db.query(`
        SELECT u.id FROM users u
        JOIN user_identities ui ON u.id = ui.user_id
        WHERE ui.identity_type = $1 AND LOWER(ui.identity_value) = LOWER($2)
      `, [identityType, normalizedValue]);
      
      if (result.rows.length === 0) {
        return null;
      }
      
      return result.rows[0].id;
    } catch (error) {
      logger.error(`Error getting user ID by identity: ${error.message}`);
      return null;
    }
  }
}

module.exports = new AuthService(); 