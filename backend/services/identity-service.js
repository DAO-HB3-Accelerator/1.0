const db = require('../db');
const logger = require('../utils/logger');

/**
 * Сервис для работы с идентификаторами пользователей
 */
class IdentityService {
  /**
   * Нормализует значения идентификаторов (приводит к нижнему регистру где нужно)
   * @param {string} provider - Тип идентификатора
   * @param {string} providerId - Значение идентификатора
   * @returns {object} - Нормализованные значения
   */
  normalizeIdentity(provider, providerId) {
    if (!provider || !providerId) {
      return { provider, providerId };
    }
    
    // Приводим провайдер к нижнему регистру
    const normalizedProvider = provider.toLowerCase();
    
    // Для email и wallet приводим значение к нижнему регистру
    let normalizedProviderId = providerId;
    if (normalizedProvider === 'wallet' || normalizedProvider === 'email') {
      normalizedProviderId = providerId.toLowerCase();
    }
    
    return { 
      provider: normalizedProvider, 
      providerId: normalizedProviderId 
    };
  }

  /**
   * Сохраняет идентификатор пользователя в базу данных
   * @param {number} userId - ID пользователя
   * @param {string} provider - Тип идентификатора (wallet, email, telegram)
   * @param {string} providerId - Значение идентификатора
   * @param {boolean} verified - Флаг верификации идентификатора
   * @returns {Promise<object>} - Результат операции
   */
  async saveIdentity(userId, provider, providerId, verified = true) {
    try {
      if (!userId || !provider || !providerId) {
        logger.warn(`[IdentityService] Missing required parameters: userId=${userId}, provider=${provider}, providerId=${providerId}`);
        return {
          success: false,
          error: 'Missing required parameters'
        };
      }
      
      // Нормализуем значения
      const { provider: normalizedProvider, providerId: normalizedProviderId } = 
        this.normalizeIdentity(provider, providerId);
      
      // Проверяем тип провайдера и перенаправляем гостевые идентификаторы в guest_user_mapping
      if (normalizedProvider === 'guest') {
        logger.info(`[IdentityService] Converting guest identity for user ${userId} to guest_user_mapping: ${normalizedProviderId}`);
        
        try {
          await db.query(
            'INSERT INTO guest_user_mapping (user_id, guest_id) VALUES ($1, $2) ON CONFLICT (guest_id) DO UPDATE SET user_id = $1',
            [userId, normalizedProviderId]
          );
          return { success: true };
        } catch (guestError) {
          logger.error(`[IdentityService] Error saving guest identity for user ${userId}:`, guestError);
          return { success: false, error: guestError.message };
        }
      }
      
      // Проверяем, разрешен ли такой тип провайдера
      const allowedProviders = ['email', 'wallet', 'telegram', 'username'];
      if (!allowedProviders.includes(normalizedProvider)) {
        logger.warn(`[IdentityService] Invalid provider type: ${normalizedProvider}`);
        return {
          success: false,
          error: `Invalid provider type. Allowed types: ${allowedProviders.join(', ')}`
        };
      }
      
      logger.info(`[IdentityService] Saving identity for user ${userId}: ${normalizedProvider}:${normalizedProviderId}`);
      
      // Проверяем, существует ли уже такой идентификатор
      const existingResult = await db.query(
        `SELECT user_id FROM user_identities WHERE provider = $1 AND provider_id = $2`,
        [normalizedProvider, normalizedProviderId]
      );
      
      if (existingResult.rows.length > 0) {
        const existingUserId = existingResult.rows[0].user_id;
        
        // Если идентификатор уже принадлежит этому пользователю, ничего не делаем
        if (existingUserId === userId) {
          logger.info(`[IdentityService] Identity ${normalizedProvider}:${normalizedProviderId} already exists for user ${userId}`);
        } else {
          // Если идентификатор принадлежит другому пользователю, логируем это
          logger.warn(`[IdentityService] Identity ${normalizedProvider}:${normalizedProviderId} already belongs to user ${existingUserId}, not user ${userId}`);
          return {
            success: false,
            error: `Identity already belongs to another user (${existingUserId})`
          };
        }
      } else {
        // Создаем новую запись
        await db.query(
          `INSERT INTO user_identities (user_id, provider, provider_id) 
           VALUES ($1, $2, $3)`,
          [userId, normalizedProvider, normalizedProviderId]
        );
        logger.info(`[IdentityService] Created new identity ${normalizedProvider}:${normalizedProviderId} for user ${userId}`);
      }
      
      return { success: true };
    } catch (error) {
      logger.error(`[IdentityService] Error saving identity ${provider}:${providerId} for user ${userId}:`, error);
      return { success: false, error: error.message };
    }
  }
  
  /**
   * Получает все идентификаторы пользователя
   * @param {number} userId - ID пользователя
   * @returns {Promise<Array>} - Массив идентификаторов
   */
  async getUserIdentities(userId) {
    try {
      if (!userId) {
        logger.warn('[IdentityService] Missing userId parameter');
        return [];
      }
      
      const result = await db.query(
        `SELECT provider, provider_id FROM user_identities WHERE user_id = $1`,
        [userId]
      );
      
      logger.info(`[IdentityService] Found ${result.rows.length} identities for user ${userId}`);
      return result.rows;
    } catch (error) {
      logger.error(`[IdentityService] Error getting identities for user ${userId}:`, error);
      return [];
    }
  }
  
  /**
   * Получает все идентификаторы пользователя определенного типа
   * @param {number} userId - ID пользователя
   * @param {string} provider - Тип идентификатора
   * @returns {Promise<Array>} - Массив идентификаторов
   */
  async getUserIdentitiesByProvider(userId, provider) {
    try {
      if (!userId || !provider) {
        logger.warn(`[IdentityService] Missing parameters: userId=${userId}, provider=${provider}`);
        return [];
      }
      
      const result = await db.query(
        `SELECT provider_id FROM user_identities WHERE user_id = $1 AND provider = $2`,
        [userId, provider]
      );
      
      logger.info(`[IdentityService] Found ${result.rows.length} ${provider} identities for user ${userId}`);
      return result.rows.map(row => row.provider_id);
    } catch (error) {
      logger.error(`[IdentityService] Error getting ${provider} identities for user ${userId}:`, error);
      return [];
    }
  }
  
  /**
   * Находит пользователя по идентификатору
   * @param {string} provider - Тип идентификатора
   * @param {string} providerId - Значение идентификатора
   * @returns {Promise<object|null>} - Информация о пользователе или null
   */
  async findUserByIdentity(provider, providerId) {
    try {
      if (!provider || !providerId) {
        logger.warn(`[IdentityService] Missing parameters: provider=${provider}, providerId=${providerId}`);
        return null;
      }
      
      // Нормализуем значения
      const { provider: normalizedProvider, providerId: normalizedProviderId } = 
        this.normalizeIdentity(provider, providerId);
      
      const result = await db.query(
        `SELECT u.id, u.role FROM users u 
         JOIN user_identities ui ON u.id = ui.user_id 
         WHERE ui.provider = $1 AND ui.provider_id = $2`,
        [normalizedProvider, normalizedProviderId]
      );
      
      if (result.rows.length === 0) {
        logger.info(`[IdentityService] No user found with identity ${normalizedProvider}:${normalizedProviderId}`);
        return null;
      }
      
      logger.info(`[IdentityService] Found user ${result.rows[0].id} with identity ${normalizedProvider}:${normalizedProviderId}`);
      return result.rows[0];
    } catch (error) {
      logger.error(`[IdentityService] Error finding user by identity ${provider}:${providerId}:`, error);
      return null;
    }
  }
  
  /**
   * Сохраняет идентификаторы из сессии для пользователя
   * @param {object} session - Объект сессии
   * @param {number} userId - ID пользователя
   * @returns {Promise<object>} - Результат операции
   */
  async saveIdentitiesFromSession(session, userId) {
    try {
      if (!session || !userId) {
        logger.warn(`[IdentityService] Missing parameters: session=${!!session}, userId=${userId}`);
        return { success: false, error: 'Missing required parameters' };
      }
      
      const results = [];
      
      // Сохраняем все постоянные идентификаторы из сессии
      if (session.email) {
        const emailResult = await this.saveIdentity(userId, 'email', session.email, true);
        results.push({ type: 'email', result: emailResult });
      }
      
      if (session.address) {
        const walletResult = await this.saveIdentity(userId, 'wallet', session.address, true);
        results.push({ type: 'wallet', result: walletResult });
      }
      
      if (session.telegramId) {
        const telegramResult = await this.saveIdentity(userId, 'telegram', session.telegramId, true);
        results.push({ type: 'telegram', result: telegramResult });
      }
      
      // Сохраняем гостевые идентификаторы в guest_user_mapping
      if (session.guestId) {
        try {
          await db.query(
            'INSERT INTO guest_user_mapping (user_id, guest_id) VALUES ($1, $2) ON CONFLICT (guest_id) DO UPDATE SET user_id = $1',
            [userId, session.guestId]
          );
          results.push({ type: 'guest', result: { success: true } });
        } catch (error) {
          logger.error(`[IdentityService] Error saving guest ID for user ${userId}:`, error);
          results.push({ type: 'guest', result: { success: false, error: error.message } });
        }
      }
      
      if (session.previousGuestId && session.previousGuestId !== session.guestId) {
        try {
          await db.query(
            'INSERT INTO guest_user_mapping (user_id, guest_id) VALUES ($1, $2) ON CONFLICT (guest_id) DO UPDATE SET user_id = $1',
            [userId, session.previousGuestId]
          );
          results.push({ type: 'previousGuest', result: { success: true } });
        } catch (error) {
          logger.error(`[IdentityService] Error saving previous guest ID for user ${userId}:`, error);
          results.push({ type: 'previousGuest', result: { success: false, error: error.message } });
        }
      }
      
      logger.info(`[IdentityService] Saved ${results.length} identities from session for user ${userId}`);
      return { success: true, results };
    } catch (error) {
      logger.error(`[IdentityService] Error saving identities from session for user ${userId}:`, error);
      return { success: false, error: error.message };
    }
  }
  
  /**
   * Мигрирует все идентификаторы и сообщения от одного пользователя к другому
   * @param {number} fromUserId - ID исходного пользователя
   * @param {number} toUserId - ID целевого пользователя
   * @returns {Promise<object>} - Результат операции
   */
  async migrateUserData(fromUserId, toUserId) {
    try {
      if (!fromUserId || !toUserId) {
        logger.warn(`[IdentityService] Missing parameters: fromUserId=${fromUserId}, toUserId=${toUserId}`);
        return { success: false, error: 'Missing required parameters' };
      }

      // Начинаем транзакцию
      const client = await db.pool.connect();
      try {
        await client.query('BEGIN');

        // Получаем все идентификаторы исходного пользователя
        const identitiesResult = await client.query(
          `SELECT provider, provider_id FROM user_identities WHERE user_id = $1`,
          [fromUserId]
        );
        
        // Переносим каждый идентификатор
        for (const identity of identitiesResult.rows) {
          await client.query(
            `INSERT INTO user_identities (user_id, provider, provider_id)
             VALUES ($1, $2, $3)
             ON CONFLICT (provider, provider_id) DO NOTHING`,
            [toUserId, identity.provider, identity.provider_id]
          );
          
          // Удаляем старый идентификатор
          await client.query(
            `DELETE FROM user_identities
             WHERE user_id = $1 AND provider = $2 AND provider_id = $3`,
            [fromUserId, identity.provider, identity.provider_id]
          );
        }
        
        // Мигрируем гостевые идентификаторы из новой таблицы guest_user_mapping
        const guestMappingsResult = await client.query(
          `SELECT guest_id, processed FROM guest_user_mapping WHERE user_id = $1`,
          [fromUserId]
        );
        
        // Переносим каждый гостевой идентификатор
        for (const mapping of guestMappingsResult.rows) {
          await client.query(
            `INSERT INTO guest_user_mapping (user_id, guest_id, processed)
             VALUES ($1, $2, $3)
             ON CONFLICT (guest_id) DO UPDATE 
             SET user_id = $1, processed = EXCLUDED.processed OR guest_user_mapping.processed`,
            [toUserId, mapping.guest_id, mapping.processed]
          );
        }
        
        // Удаляем старые гостевые маппинги
        await client.query(
          `DELETE FROM guest_user_mapping WHERE user_id = $1`,
          [fromUserId]
        );

        // Переносим все сообщения
        await client.query(
          `UPDATE messages 
           SET user_id = $1 
           WHERE user_id = $2`,
          [toUserId, fromUserId]
        );

        // Переносим все диалоги
        await client.query(
          `UPDATE conversations 
           SET user_id = $1 
           WHERE user_id = $2`,
          [toUserId, fromUserId]
        );
        
        // Переносим настройки пользователя
        await client.query(
          `UPDATE user_preferences
           SET user_id = $1
           WHERE user_id = $2`,
          [toUserId, fromUserId]
        );

        // Завершаем транзакцию
        await client.query('COMMIT');
        
        logger.info(`[IdentityService] Successfully migrated data from user ${fromUserId} to ${toUserId}`);
        return { success: true };
      } catch (error) {
        await client.query('ROLLBACK');
        logger.error(`[IdentityService] Transaction error:`, error);
        return { success: false, error: error.message };
      } finally {
        client.release();
      }
    } catch (error) {
      logger.error(`[IdentityService] Error migrating user data:`, error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Находит всех пользователей с похожими идентификаторами
   * @param {object} identities - Объект с идентификаторами
   * @returns {Promise<Array>} - Массив ID пользователей
   */
  async findRelatedUsers(identities) {
    try {
      const userIds = new Set();
      
      for (const [provider, providerId] of Object.entries(identities)) {
        if (!providerId) continue;
        
        const result = await db.query(
          `SELECT DISTINCT user_id 
           FROM user_identities 
           WHERE provider = $1 AND provider_id = $2`,
          [provider, providerId]
        );
        
        result.rows.forEach(row => userIds.add(row.user_id));
      }
      
      return Array.from(userIds);
    } catch (error) {
      logger.error(`[IdentityService] Error finding related users:`, error);
      return [];
    }
  }
}

module.exports = new IdentityService(); 