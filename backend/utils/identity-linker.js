const db = require('../db');
const logger = require('./logger');

/**
 * Связывает идентификатор с пользователем
 * @param {number} userId - ID пользователя
 * @param {string} identityType - Тип идентификатора ('ethereum', 'telegram', 'email')
 * @param {string} identityValue - Значение идентификатора
 * @returns {Promise<boolean>} - Результат операции
 */
async function linkIdentity(userId, identityType, identityValue) {
  try {
    // Проверяем, существует ли уже такой идентификатор
    const existingResult = await db.query(
      'SELECT * FROM user_identities WHERE identity_type = $1 AND identity_value = $2',
      [identityType, identityValue]
    );

    if (existingResult.rows.length > 0) {
      // Если идентификатор уже связан с другим пользователем, возвращаем ошибку
      if (existingResult.rows[0].user_id !== userId) {
        console.warn(`Identity ${identityType}:${identityValue} already linked to another user`);
        return false;
      }
      // Если идентификатор уже связан с этим пользователем, ничего не делаем
      return true;
    }

    // Добавляем новую связь
    await db.query(
      'INSERT INTO user_identities (user_id, identity_type, identity_value, created_at) VALUES ($1, $2, $3, NOW())',
      [userId, identityType, identityValue]
    );

    console.log(`Successfully linked ${identityType}:${identityValue} to user ${userId}`);
    return true;
  } catch (error) {
    console.error('Error linking identity:', error);
    return false;
  }
}

/**
 * Получает ID пользователя по идентификатору
 * @param {string} identityType - Тип идентификатора ('ethereum', 'telegram', 'email')
 * @param {string} identityValue - Значение идентификатора
 * @returns {Promise<number|null>} - ID пользователя или null, если не найден
 */
async function getUserIdByIdentity(identityType, identityValue) {
  try {
    const result = await db.query(
      'SELECT user_id FROM user_identities WHERE identity_type = $1 AND identity_value = $2',
      [identityType, identityValue]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return result.rows[0].user_id;
  } catch (error) {
    console.error('Error getting user ID by identity:', error);
    return null;
  }
}

/**
 * Получает все идентификаторы пользователя
 * @param {number} userId - ID пользователя
 * @returns {Promise<Array|null>} - Массив идентификаторов или null в случае ошибки
 */
async function getUserIdentities(userId) {
  try {
    const result = await db.query(
      'SELECT identity_type, identity_value FROM user_identities WHERE user_id = $1',
      [userId]
    );

    return result.rows;
  } catch (error) {
    console.error('Error getting user identities:', error);
    return null;
  }
}

module.exports = {
  linkIdentity,
  getUserIdByIdentity,
  getUserIdentities,
};
