const db = require('../db');
const logger = require('../utils/logger');
const { ethers } = require('ethers');
const crypto = require('crypto');
const { processMessage } = require('./ai-assistant'); // Используем AI Assistant
const verificationService = require('./verification-service'); // Используем сервис верификации

const ADMIN_CONTRACTS = [
  { address: "0xd95a45fc46a7300e6022885afec3d618d7d3f27c", network: "eth" },
  { address: "0x4B294265720B09ca39BFBA18c7E368413c0f68eB", network: "bsc" },
  { address: "0xdce769b847a0a697239777d0b1c7dd33b6012ba0", network: "arbitrum" },
  { address: "0x351f59de4fedbdf7601f5592b93db3b9330c1c1d", network: "polygon" }
];

const ERC20_ABI = [
  "function balanceOf(address owner) view returns (uint256)"
];

class AuthService {
  constructor() {
    this.providers = {
      eth: new ethers.JsonRpcProvider(process.env.RPC_URL_ETH),
      polygon: new ethers.JsonRpcProvider(process.env.RPC_URL_POLYGON),
      bsc: new ethers.JsonRpcProvider(process.env.RPC_URL_BSC),
      arbitrum: new ethers.JsonRpcProvider(process.env.RPC_URL_ARBITRUM)
    };
  }

  // Проверка подписи
  async verifySignature(message, signature, address) {
    try {
      if (!message || !signature || !address) return false;
      
      // Нормализуем входящий адрес
      const normalizedAddress = ethers.getAddress(address).toLowerCase();
      
      // Восстанавливаем адрес из подписи
      const recoveredAddress = ethers.verifyMessage(message, signature);
      
      // Сравниваем нормализованные адреса
      return ethers.getAddress(recoveredAddress).toLowerCase() === normalizedAddress;
    } catch (error) {
      logger.error('Error in signature verification:', error);
      return false;
    }
  }

  /**
   * Находит или создает пользователя по адресу кошелька
   * @param {string} address - Адрес кошелька
   * @returns {Promise<{userId: number, isAdmin: boolean}>}
   */
  async findOrCreateUser(address) {
    try {
      // Нормализуем адрес - всегда приводим к нижнему регистру
      const normalizedAddress = ethers.getAddress(address).toLowerCase();
      
      // Ищем пользователя по адресу в таблице user_identities
      const userResult = await db.query(`
        SELECT u.* FROM users u 
        JOIN user_identities ui ON u.id = ui.user_id 
        WHERE ui.provider = 'wallet' AND ui.provider_id = $1
      `, [normalizedAddress]);
      
      if (userResult.rows.length > 0) {
        const user = userResult.rows[0];
        return { 
          userId: user.id, 
          isAdmin: user.role === 'admin' 
        };
      }
      
      // Если пользователь не найден, создаем нового
      const newUserResult = await db.query(
        'INSERT INTO users (role) VALUES ($1) RETURNING id',
        ['user']
      );
      
      const userId = newUserResult.rows[0].id;
      
      // Добавляем идентификатор кошелька (всегда в нижнем регистре)
      await db.query(
        'INSERT INTO user_identities (user_id, provider, provider_id) VALUES ($1, $2, $3)',
        [userId, 'wallet', normalizedAddress]
      );
      
      // Проверяем, есть ли у пользователя роль админа
      const isAdmin = await this.checkAdminRole(normalizedAddress);
      
      // Если у пользователя есть админские токены, обновляем его роль
      if (isAdmin) {
        await db.query('UPDATE users SET role = $1 WHERE id = $2', ['admin', userId]);
        logger.info(`New user ${userId} with wallet ${normalizedAddress} automatically granted admin role`);
      }
      
      return { userId, isAdmin };
    } catch (error) {
      console.error('Error finding or creating user:', error);
      throw error;
    }
  }

  /**
   * Основной метод проверки роли админа
   * @param {string} address - Адрес кошелька
   * @returns {Promise<boolean>} - Является ли пользователь админом
   */
  async checkAdminRole(address) {
    if (!address) return false;
    
    logger.info(`Checking admin role for address: ${address}`);
    let foundTokens = false;
    const balances = {};
    
    // Создаем массив промисов для параллельной проверки балансов
    const checkPromises = ADMIN_CONTRACTS.map(async (contract) => {
      try {
        const provider = this.providers[contract.network];
        if (!provider) return null;
        
        const tokenContract = new ethers.Contract(
          contract.address,
          ERC20_ABI,
          provider
        );
        
        // Создаем промис с таймаутом
        const balancePromise = tokenContract.balanceOf(address);
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Timeout')), 3000)
        );
        
        // Ждем первый выполненный промис
        const balance = await Promise.race([balancePromise, timeoutPromise]);
        const formattedBalance = ethers.formatUnits(balance, 18);
        balances[contract.network] = formattedBalance;
        
        logger.info(`Token balance on ${contract.network}:`, {
          address,
          contract: contract.address,
          balance: formattedBalance,
          hasTokens: balance > 0
        });

        if (balance > 0) {
          logger.info(`Found admin tokens on ${contract.network}`);
          foundTokens = true;
        }
        
        return { network: contract.network, balance: formattedBalance };
      } catch (error) {
        logger.error(`Error checking balance in ${contract.network}:`, {
          address,
          contract: contract.address,
          error: error.message
        });
        balances[contract.network] = 'Error';
        return null;
      }
    });
    
    // Ждем выполнения всех проверок
    await Promise.all(checkPromises);
    
    if (foundTokens) {
      logger.info(`Admin role summary for ${address}:`, {
        networks: Object.keys(balances).filter(net => balances[net] > 0),
        balances
      });
      logger.info(`Admin role granted for ${address}`);
      return true;
    }
    
    logger.info(`Admin role denied - no tokens found for ${address}`);
    return false;
  }

  /**
   * Получение балансов токенов для адреса
   * @param {string} address - Адрес кошелька
   * @returns {Promise<Object>} - Объект с балансами токенов
   */
  async getTokenBalances(address) {
    if (!address) {
      logger.error('No address provided for getTokenBalances');
      return {
        eth: '0',
        bsc: '0',
        arbitrum: '0',
        polygon: '0'
      };
    }

    const balances = {};
    const timeout = 3000; // 3 секунды таймаут
    
    for (const contract of ADMIN_CONTRACTS) {
      try {
        const provider = this.providers[contract.network];
        if (!provider) {
          logger.error(`No provider for network ${contract.network}`);
          balances[contract.network] = '0';
          continue;
        }

        const tokenContract = new ethers.Contract(
          contract.address,
          ERC20_ABI,
          provider
        );

        // Создаем промис с таймаутом
        const balancePromise = tokenContract.balanceOf(address);
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Timeout')), timeout)
        );

        // Ждем первый выполненный промис
        const balance = await Promise.race([balancePromise, timeoutPromise]);
        const formattedBalance = ethers.formatUnits(balance, 18);
        
        logger.info(`Token balance for ${address} on ${contract.network}:`, {
          contract: contract.address,
          balance: formattedBalance,
          timestamp: new Date().toISOString()
        });

        balances[contract.network] = formattedBalance;
      } catch (error) {
        logger.error(`Error getting balance for ${contract.network}:`, {
          address,
          contract: contract.address,
          error: error.message || 'Unknown error',
          timestamp: new Date().toISOString()
        });
        balances[contract.network] = '0';
      }
    }
    
    logger.info(`Token balances fetched for ${address}:`, {
      ...balances,
      timestamp: new Date().toISOString()
    });
    
    return balances;
  }

  // Создание сессии с проверкой роли
  async createSession(session, { userId, authenticated, authType, guestId, address }) {
    try {
      // Если пользователь аутентифицирован, обрабатываем гостевые сообщения
      if (authenticated && guestId) {
        await this.processAndCleanupGuestData(userId, guestId, session);
      }

      // Обновляем данные сессии
      session.userId = userId;
      session.authenticated = authenticated;
      session.authType = authType;
      
      // Сохраняем адрес кошелька если есть
      if (address) {
        session.address = address;
      }
      
      // Сохраняем сессию в БД
      const result = await db.query(
        `UPDATE session 
         SET sess = $1 
         WHERE sid = $2`,
        [JSON.stringify({
          userId,
          authenticated,
          authType,
          address,
          cookie: session.cookie
        }), session.id]
      );
      
      return true;
    } catch (error) {
      logger.error('Error creating session:', error);
      return false;
    }
  }

  /**
   * Обработка и очистка гостевых данных после авторизации
   * @param {number} userId - ID пользователя
   * @param {string} guestId - Гостевой ID
   * @param {Object} session - Объект сессии
   */
  async processAndCleanupGuestData(userId, guestId, session) {
    try {
      // Обрабатываем гостевые сообщения
      const { processGuestMessages } = require('../routes/chat');
      await processGuestMessages(userId, guestId);

      // Очищаем гостевой ID из сессии
      delete session.guestId;
      if (session.previousGuestId) {
        delete session.previousGuestId;
      }

      logger.info(`Cleaned up guest data for user ${userId}, guest ID ${guestId}`);
    } catch (error) {
      logger.error('Error processing and cleaning up guest data:', error);
      throw error;
    }
  }

  async getSession(sessionId) {
    try {
      const result = await db.query('SELECT * FROM session WHERE sid = $1', [sessionId]);
      return result.rows[0];
    } catch (error) {
      console.error('Error getting session:', error);
      throw error;
    }
  }

  // Получение связанного кошелька
  async getLinkedWallet(userId) {
    const result = await db.query(
      `SELECT provider_id as address 
       FROM user_identities 
       WHERE user_id = $1 AND provider = 'wallet'`,
      [userId]
    );
    return result.rows[0]?.address;
  }

  /**
   * Проверяет роль пользователя Telegram
   * @param {number} userId - ID пользователя
   * @returns {Promise<string>} - Роль пользователя
   */
  async checkUserRole(userId) {
    try {
      // Проверяем наличие связанного кошелька
      const wallet = await this.getLinkedWallet(userId);
      
      // Если кошелек не привязан, пользователь получает роль user
      // с базовым доступом к чату и истории сообщений
      if (!wallet) {
        logger.info(`No wallet linked for user ${userId}, assigning basic user role`);
        return 'user';
      }
      
      // Если есть кошелек, проверяем админские токены
      const isAdmin = await this.checkAdminRole(wallet);
      logger.info(`Role check for user ${userId} with wallet ${wallet}: ${isAdmin ? 'admin' : 'user'}`);
      return isAdmin ? 'admin' : 'user';
    } catch (error) {
      logger.error('Error checking user role:', error);
      return 'user';
    }
  }

  // Проверка верификации Email
  async checkEmailVerification(code) {
    try {
      // Проверяем код через сервис верификации
      const result = await verificationService.verifyCode(code, 'email', null);
      
      if (!result.success) {
        return { verified: false };
      }
      
      const userId = result.userId;
      const email = result.providerId;
      
      // Проверяем, существует ли пользователь с таким email
      const userResult = await db.query(
        'SELECT * FROM users WHERE id = $1',
        [userId]
      );
      
      if (userResult.rows.length === 0) {
        return { verified: false };
      }

      // Проверяем наличие кошелька и определяем роль
      const wallet = await this.getLinkedWallet(userId);
      let role = 'user'; // Базовая роль для доступа к чату
      
      if (wallet) {
        // Если есть кошелек, проверяем баланс токенов
        const isAdmin = await this.checkAdminRole(wallet);
        role = isAdmin ? 'admin' : 'user';
        logger.info(`User ${userId} has wallet ${wallet}, role set to ${role}`);
      } else {
        logger.info(`User ${userId} has no wallet, using basic user role`);
      }
      
      return {
        verified: true,
        userId,
        email,
        role,
        wallet: wallet || null
      };
    } catch (error) {
      logger.error('Error checking email verification:', error);
      return { verified: false };
    }
  }

  /**
   * Проверка Telegram аутентификации
   */
  async verifyTelegramAuth(telegramId, verificationCode, session) {
    try {
      logger.info(`[verifyTelegramAuth] Starting for telegramId: ${telegramId}`);
      
      let userId;
      let isNewUser = false;
      
      // Проверяем наличие аутентифицированного пользователя в сессии
      if (session && session.authenticated && session.userId) {
        // Если есть авторизованный пользователь в сессии, связываем Telegram с ним
        userId = session.userId;
        logger.info(`[verifyTelegramAuth] Using existing authenticated user ${userId} from session`);
        
        // Связываем Telegram с текущим пользователем
        await this.linkIdentity(userId, 'telegram', telegramId);
        
        return {
          success: true,
          userId,
          role: session.isAdmin ? 'admin' : 'user',
          telegramId,
          isNewUser: false
        };
      }
      
      // Если в сессии нет авторизованного пользователя, проверяем существующие идентификаторы
      // Проверяем, существует ли уже пользователь с таким Telegram ID
      const existingUserResult = await db.query(
        `SELECT u.*, ui.provider, ui.provider_id 
         FROM users u 
         JOIN user_identities ui ON u.id = ui.user_id 
         WHERE ui.provider = 'telegram' AND ui.provider_id = $1`,
        [telegramId]
      );

      // Если пользователь существует с таким telegramId, используем его
      if (existingUserResult.rows.length > 0) {
        const existingUser = existingUserResult.rows[0];
        userId = existingUser.id;
        logger.info(`[verifyTelegramAuth] Found existing user ${userId} for Telegram ID ${telegramId}`);
      } else {
        // Создаем нового пользователя для нового telegramId
        const newUserResult = await db.query(
          'INSERT INTO users (role) VALUES ($1) RETURNING id',
          ['user']
        );
        userId = newUserResult.rows[0].id;
        isNewUser = true;
        
        // Добавляем Telegram идентификатор
        await db.query(
          'INSERT INTO user_identities (user_id, provider, provider_id) VALUES ($1, $2, $3)',
          [userId, 'telegram', telegramId]
        );
        
        logger.info(`[verifyTelegramAuth] Created new user ${userId} for Telegram ID ${telegramId}`);
      }

      // Если есть гостевой ID в сессии, сохраняем его для нового пользователя
      if (session.guestId && isNewUser) {
        await db.query(
          'INSERT INTO guest_user_mapping (user_id, guest_id) VALUES ($1, $2) ON CONFLICT (guest_id) DO UPDATE SET user_id = $1',
          [userId, session.guestId]
        );
        logger.info(`[verifyTelegramAuth] Saved guest ID ${session.guestId} for user ${userId}`);
      }

      return {
        success: true,
        userId,
        role: 'user',
        telegramId,
        isNewUser
      };
    } catch (error) {
      logger.error('[verifyTelegramAuth] Error:', error);
      throw error;
    }
  }

  // Добавляем псевдоним функции checkAdminRole для обратной совместимости
  async checkAdminTokens(address) {
    if (!address) return false;
    
    logger.info(`Checking admin tokens for address: ${address}`);
    const isAdmin = await this.checkAdminRole(address);
    
    // Обновляем роль пользователя в базе данных, если есть админские токены
    if (isAdmin) {
      try {
        // Находим userId по адресу
        const userResult = await db.query(`
          SELECT u.id FROM users u 
          JOIN user_identities ui ON u.id = ui.user_id 
          WHERE ui.provider = 'wallet' AND ui.provider_id = $1`,
          [address.toLowerCase()]
        );
        
        if (userResult.rows.length > 0) {
          const userId = userResult.rows[0].id;
          // Обновляем роль пользователя
          await db.query(
            'UPDATE users SET role = $1 WHERE id = $2',
            ['admin', userId]
          );
          logger.info(`Updated user ${userId} role to admin based on token holdings`);
        }
      } catch (error) {
        logger.error('Error updating user role:', error);
      }
    }
    
    return isAdmin;
  }

  /**
   * Очистка старых гостевых идентификаторов
   * @param {number} userId - ID пользователя
   * @returns {Promise<void>}
   */
  async cleanupGuestIdentities(userId) {
    try {
      // Получаем все идентификаторы пользователя
      const identities = await this.getUserIdentities(userId);
      
      // Фильтруем только гостевые идентификаторы
      const guestIdentities = identities.filter(id => id.identity_type === 'guest');
      
      // Если гостевых идентификаторов больше 3, удаляем старые
      if (guestIdentities.length > 3) {
        // Сортируем по дате создания (новые первые)
        guestIdentities.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
        
        // Оставляем только 3 последних идентификатора
        const identitiesToDelete = guestIdentities.slice(3);
        
        // Удаляем старые идентификаторы
        for (const identity of identitiesToDelete) {
          await db.query(
            'DELETE FROM user_identities WHERE id = $1',
            [identity.id]
          );
          logger.info(`Deleted old guest identity: ${identity.identity_value}`);
        }
      }
    } catch (error) {
      logger.error('Error cleaning up guest identities:', error);
    }
  }

  /**
   * Получение всех идентификаторов пользователя
   * @param {number} userId - ID пользователя
   * @returns {Promise<Array>} - Массив идентификаторов
   */
  async getUserIdentities(userId) {
    try {
      const result = await db.query(
        'SELECT * FROM user_identities WHERE user_id = $1 ORDER BY created_at DESC',
        [userId]
      );
      return result.rows;
    } catch (error) {
      logger.error('[getUserIdentities] Error:', error);
      throw error;
    }
  }

  /**
   * Проверка баланса токенов в сети Arbitrum с оптимизированным таймаутом
   * @param {string} address - Адрес кошелька
   * @returns {Promise<Object>} - Результат проверки баланса
   */
  async checkArbitrumBalance(address) {
    const timeout = 2000; // Уменьшаем таймаут до 2 секунд
    try {
      const balance = await Promise.race([
        this.getTokenBalance(address, ADMIN_CONTRACTS.ARBITRUM),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('TIMEOUT')), timeout)
        )
      ]);
      return { balance, hasTokens: balance > 0 };
    } catch (error) {
      logger.warn(`[checkArbitrumBalance] Timeout or error for ${address}:`, error);
      return { balance: 0, hasTokens: false, error: error.message };
    }
  }

  /**
   * Связывает новый идентификатор с существующим пользователем
   * @param {number} userId - ID пользователя
   * @param {string} provider - Тип идентификатора (wallet, email, telegram)
   * @param {string} providerId - Значение идентификатора
   * @returns {Promise<Object>} - Результат операции
   */
  async linkIdentity(userId, provider, providerId) {
    try {
      if (!userId || !provider || !providerId) {
        logger.warn(`[AuthService] Missing parameters for linkIdentity: userId=${userId}, provider=${provider}, providerId=${providerId}`);
        throw new Error('Missing parameters');
      }
      
      // Нормализуем значение идентификатора
      let normalizedProviderId = providerId;
      if (provider === 'wallet') {
        // Для кошельков используем ethers для валидации и нормализации
        try {
          normalizedProviderId = ethers.getAddress(providerId).toLowerCase();
        } catch (error) {
          logger.error(`[AuthService] Invalid wallet address: ${providerId}`, error);
          throw new Error('Invalid wallet address');
        }
      } else if (provider === 'email') {
        normalizedProviderId = providerId.toLowerCase();
      }
      
      logger.info(`[AuthService] Linking identity ${provider}:${normalizedProviderId} to user ${userId}`);
      
      // Проверяем, существует ли уже такой идентификатор
      const existingResult = await db.query(
        `SELECT user_id FROM user_identities WHERE provider = $1 AND provider_id = $2`,
        [provider, normalizedProviderId]
      );
      
      if (existingResult.rows.length > 0) {
        const existingUserId = existingResult.rows[0].user_id;
        
        // Если идентификатор уже принадлежит этому пользователю, ничего не делаем
        if (existingUserId === userId) {
          logger.info(`[AuthService] Identity ${provider}:${normalizedProviderId} already exists for user ${userId}`);
          return { success: true, message: 'Identity already exists' };
        } else {
          // Если идентификатор принадлежит другому пользователю, возвращаем ошибку
          logger.warn(`[AuthService] Identity ${provider}:${normalizedProviderId} already belongs to user ${existingUserId}, not user ${userId}`);
          throw new Error(`Identity already belongs to another user (${existingUserId})`);
        }
      }
      
      // Добавляем новый идентификатор для пользователя
      await db.query(
        `INSERT INTO user_identities (user_id, provider, provider_id) 
         VALUES ($1, $2, $3)`,
        [userId, provider, normalizedProviderId]
      );
      
      // Проверяем и обновляем роль администратора, если это идентификатор кошелька
      let isAdmin = false;
      if (provider === 'wallet') {
        isAdmin = await this.checkAdminTokens(normalizedProviderId);
        
        // Обновляем роль пользователя в базе данных, если нужно
        if (isAdmin) {
          await db.query(
            'UPDATE users SET role = $1 WHERE id = $2',
            ['admin', userId]
          );
          logger.info(`[AuthService] Updated user ${userId} role to admin based on token holdings`);
        }
      }
      
      logger.info(`[AuthService] Identity ${provider}:${normalizedProviderId} successfully linked to user ${userId}`);
      return { success: true, isAdmin };
    } catch (error) {
      logger.error(`[AuthService] Error linking identity ${provider}:${providerId} to user ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Обработка гостевых сообщений после аутентификации
   * ПРИМЕЧАНИЕ: Эта функция оставлена для обратной совместимости.
   * Фактически все маршруты теперь используют версию функции из auth.js,
   * которая корректно обрабатывает сообщения для всех типов аутентификации.
   * @deprecated Используйте функцию linkGuestMessagesAfterAuth из routes/auth.js
   */
  async linkGuestMessagesAfterAuth(userId, currentGuestId, previousGuestId) {
    try {
      logger.info(`[linkGuestMessagesAfterAuth] Starting for user ${userId} with guestId=${currentGuestId}`);
      
      // Проверяем, есть ли идентификатор для обработки
      if (!currentGuestId) {
        logger.debug('[linkGuestMessagesAfterAuth] No guest ID to process');
        return { success: true, message: 'No guest ID to process' };
      }

      // Проверяем, не привязаны ли уже эти гостевые сообщения к другому пользователю
      const existingMessagesCheck = await db.query(
        `SELECT DISTINCT user_id 
         FROM messages 
         WHERE guest_message_id IN (
           SELECT id FROM guest_messages WHERE guest_id = $1
         )`,
        [currentGuestId]
      );

      if (existingMessagesCheck.rows.length > 0) {
        const existingUserId = existingMessagesCheck.rows[0].user_id;
        if (existingUserId !== userId) {
          logger.warn(`[linkGuestMessagesAfterAuth] Guest messages for ${currentGuestId} are already linked to user ${existingUserId}`);
          return { 
            success: false, 
            error: 'Guest messages are already linked to another user' 
          };
        }
      }

      // Используем ту же функцию processGuestMessages что и в auth.js
      const result = await processGuestMessages(userId, currentGuestId);
      logger.info(`[linkGuestMessagesAfterAuth] Guest messages processed: ${JSON.stringify(result)}`);

      // Если есть предыдущий гостевой ID, обработаем и его
      if (previousGuestId && previousGuestId !== currentGuestId) {
        const prevResult = await processGuestMessages(userId, previousGuestId);
        logger.info(`[linkGuestMessagesAfterAuth] Previous guest messages processed: ${JSON.stringify(prevResult)}`);
      }

      return {
        success: true,
        result: result
      };
    } catch (error) {
      logger.error('[linkGuestMessagesAfterAuth] Error:', error);
      throw error;
    }
  }
}

// Создаем и экспортируем единственный экземпляр
const authService = new AuthService();
module.exports = authService;