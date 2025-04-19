const { ethers } = require('ethers');
const db = require('../db');
const logger = require('./logger');
const authService = require('../services/auth-service');
const { USER_ROLES, IDENTITY_TYPES } = require('./constants');

// Инициализация провайдера
const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);

/**
 * Проверяет подпись сообщения
 * @param {string} nonce - Независимый идентификатор
 * @param {string} signature - Подпись
 * @param {string} address - Адрес кошелька
 * @returns {Promise<boolean>} - Результат проверки
 */
async function verifySignature(nonce, signature, address) {
  try {
    // Создаем сообщение для проверки
    const message = `Sign this message to authenticate with our app: ${nonce}`;
    
    // Восстанавливаем адрес из подписи
    const recoveredAddress = ethers.verifyMessage(message, signature);
    
    // Проверяем, что восстановленный адрес совпадает с предоставленным
    return recoveredAddress.toLowerCase() === address.toLowerCase();
  } catch (error) {
    console.error('Error verifying signature:', error);
    return false;
  }
}

/**
 * Проверяет, является ли пользователь администратором
 * @param {string} address - Адрес кошелька
 * @returns {Promise<boolean>} - Является ли пользователь администратором
 */
async function checkUserRole(address) {
  try {
    // Проверяем наличие токена администратора
    const isAdmin = await authService.checkAdminToken(address);
    return isAdmin;
  } catch (error) {
    console.error('Error checking user role:', error);
    return false;
  }
}

/**
 * Проверяет доступ пользователя
 * @param {string} walletAddress - Адрес кошелька
 * @returns {Promise<Object>} - Информация о доступе
 */
async function checkAccess(walletAddress) {
  try {
    // Проверяем наличие токена администратора
    const isAdmin = await authService.checkAdminToken(walletAddress);
    
    // Получаем или создаем пользователя
    const userId = await findOrCreateUser(walletAddress);
    
    return {
      userId,
      isAdmin,
      hasAccess: true
    };
  } catch (error) {
    logger.error(`Error checking access: ${error.message}`);
    return {
      hasAccess: false,
      error: error.message
    };
  }
}

/**
 * Находит или создает пользователя по адресу кошелька
 * @param {string} address - Адрес кошелька
 * @returns {Promise<Object>} - ID пользователя и роль
 */
async function findOrCreateUser(address) {
  try {
    // Проверяем, существует ли пользователь
    const userResult = await db.query('SELECT * FROM users WHERE LOWER(address) = LOWER($1)', [address]);
    
    let userId;
    let isAdmin = false;
    
    if (userResult.rows.length === 0) {
      // Если пользователь не найден, создаем его
      // Получаем ID роли 'user'
      const roleResult = await db.query('SELECT id FROM roles WHERE name = $1', ['user']);
      if (roleResult.rows.length === 0) {
        throw new Error('Role "user" not found');
      }
      const roleId = roleResult.rows[0].id;
      
      // Создаем пользователя с ролью 'user'
      const newUserResult = await db.query(
        'INSERT INTO users (address, role_id, created_at) VALUES (LOWER($1), $2, NOW()) RETURNING id',
        [address, roleId]
      );
      
      userId = newUserResult.rows[0].id;
      
      // Проверяем, является ли пользователь администратором
      isAdmin = await checkUserRole(address);
      
      // Если пользователь администратор, обновляем его роль
      if (isAdmin) {
        const adminRoleResult = await db.query('SELECT id FROM roles WHERE name = $1', ['admin']);
        if (adminRoleResult.rows.length > 0) {
          const adminRoleId = adminRoleResult.rows[0].id;
          await db.query('UPDATE users SET role_id = $1 WHERE id = $2', [adminRoleId, userId]);
        }
      }
    } else {
      // Если пользователь найден, получаем его ID и роль
      userId = userResult.rows[0].id;
      
      // Проверяем, является ли пользователь администратором по роли
      const roleResult = await db.query('SELECT name FROM roles WHERE id = $1', [userResult.rows[0].role_id]);
      isAdmin = roleResult.rows.length > 0 && roleResult.rows[0].name === 'admin';
      
      // Проверяем, является ли пользователь администратором по токену
      const isAdminByToken = await checkUserRole(address);
      
      // Обновляем роль пользователя, если она изменилась
      if (isAdminByToken !== isAdmin) {
        const roleNameToSet = isAdminByToken ? 'admin' : 'user';
        const roleToSetResult = await db.query('SELECT id FROM roles WHERE name = $1', [roleNameToSet]);
        if (roleToSetResult.rows.length > 0) {
          const roleIdToSet = roleToSetResult.rows[0].id;
          await db.query('UPDATE users SET role_id = $1 WHERE id = $2', [roleIdToSet, userId]);
          isAdmin = isAdminByToken;
        }
      }
    }
    
    return { userId, isAdmin };
  } catch (error) {
    console.error('Error finding or creating user:', error);
    throw error;
  }
}

module.exports = {
  verifySignature,
  checkAccess,
  findOrCreateUser,
  checkUserRole
}; 