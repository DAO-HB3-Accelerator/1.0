const db = require('../db');
const logger = require('../utils/logger');
const { ethers } = require('ethers');
const crypto = require('crypto');
const { processMessage } = require('./ai-assistant'); // Используем AI Assistant
const verificationService = require('./verification-service'); // Используем сервис верификации
const identityService = require('./identity-service'); // <-- ДОБАВЛЕН ИМПОРТ
const authTokenService = require('./authTokenService');
const rpcProviderService = require('./rpcProviderService');
const { getLinkedWallet } = require('./wallet-service');
const { checkAdminRole } = require('./admin-role');
const { broadcastContactsUpdate } = require('../wsHub');

const ERC20_ABI = ['function balanceOf(address owner) view returns (uint256)'];

class AuthService {
  constructor() {}

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
      const userResult = await db.getQuery()(
        `
        SELECT u.* FROM users u 
        JOIN user_identities ui ON u.id = ui.user_id 
        WHERE ui.provider = 'wallet' AND ui.provider_id = $1
      `,
        [normalizedAddress]
      );

      if (userResult.rows.length > 0) {
        const user = userResult.rows[0];

        // Проверяем роль администратора при каждой аутентификации
        const isAdmin = await checkAdminRole(normalizedAddress);

        // Если статус админа изменился, обновляем роль в базе данных
        if (user.role === 'admin' && !isAdmin) {
          await db.getQuery()('UPDATE users SET role = $1 WHERE id = $2', ['user', user.id]);
          logger.info(`Updated user ${user.id} role to user (admin tokens no longer present)`);
          return { userId: user.id, isAdmin: false };
        } else if (user.role !== 'admin' && isAdmin) {
          await db.getQuery()('UPDATE users SET role = $1 WHERE id = $2', ['admin', user.id]);
          logger.info(`Updated user ${user.id} role to admin (admin tokens found)`);
          return { userId: user.id, isAdmin: true };
        }

        return {
          userId: user.id,
          isAdmin: user.role === 'admin',
        };
      }

      // Если пользователь не найден, создаем нового
      const newUserResult = await db.getQuery()('INSERT INTO users (role) VALUES ($1) RETURNING id', [
        'user',
      ]);

      const userId = newUserResult.rows[0].id;

      // Добавляем идентификатор кошелька (всегда в нижнем регистре)
      await db.getQuery()(
        'INSERT INTO user_identities (user_id, provider, provider_id) VALUES ($1, $2, $3)',
        [userId, 'wallet', normalizedAddress]
      );

      // Проверяем, есть ли у пользователя роль админа
      const isAdmin = await checkAdminRole(normalizedAddress);
      logger.info(`New user ${userId} role check result: ${isAdmin ? 'admin' : 'user'}`);

      // Если у пользователя есть админские токены, обновляем его роль
      if (isAdmin) {
        await db.getQuery()('UPDATE users SET role = $1 WHERE id = $2', ['admin', userId]);
        logger.info(
          `New user ${userId} with wallet ${normalizedAddress} automatically granted admin role`
        );
      }

      broadcastContactsUpdate();

      return { userId, isAdmin };
    } catch (error) {
      logger.error('Error finding or creating user:', error);
      throw error;
    }
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
        ethereum: '0',
        bsc: '0',
        arbitrum: '0',
        polygon: '0',
        sepolia: '0',
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

        // Проверяем доступность провайдера
        try {
          // Проверка доступности сети с таймаутом
          const networkCheckPromise = provider.getNetwork();
          const networkTimeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Network check timeout')), timeout)
          );

          await Promise.race([networkCheckPromise, networkTimeoutPromise]);
        } catch (networkError) {
          logger.error(
            `Provider for ${contract.network} is not available: ${networkError.message}`
          );
          balances[contract.network] = '0';
          continue;
        }

        const tokenContract = new ethers.Contract(contract.address, ERC20_ABI, provider);

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
          timestamp: new Date().toISOString(),
        });

        balances[contract.network] = formattedBalance;
      } catch (error) {
        logger.error(`Error getting balance for ${contract.network}:`, {
          address,
          contract: contract.address,
          error: error.message || 'Unknown error',
          timestamp: new Date().toISOString(),
        });
        balances[contract.network] = '0';
      }
    }

    logger.info(`Token balances fetched for ${address}:`, {
      ...balances,
      timestamp: new Date().toISOString(),
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
      const result = await db.getQuery()(
        `UPDATE session 
         SET sess = $1 
         WHERE sid = $2`,
        [
          JSON.stringify({
            userId,
            authenticated,
            authType,
            address,
            cookie: session.cookie,
          }),
          session.id,
        ]
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
      const result = await db.getQuery()('SELECT * FROM session WHERE sid = $1', [sessionId]);
      return result.rows[0];
    } catch (error) {
      console.error('Error getting session:', error);
      throw error;
    }
  }

  /**
   * Проверяет роль пользователя Telegram
   * @param {number} userId - ID пользователя
   * @returns {Promise<string>} - Роль пользователя
   */
  async checkUserRole(userId) {
    try {
      // Проверяем наличие связанного кошелька
      const wallet = await getLinkedWallet(userId);

      // Если кошелек не привязан, пользователь получает роль user
      // с базовым доступом к чату и истории сообщений
      if (!wallet) {
        logger.info(`No wallet linked for user ${userId}, assigning basic user role`);
        return 'user';
      }

      // Если есть кошелек, проверяем админские токены
      const isAdmin = await checkAdminRole(wallet);
      logger.info(
        `Role check for user ${userId} with wallet ${wallet}: ${isAdmin ? 'admin' : 'user'}`
      );
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
      const userResult = await db.getQuery()('SELECT * FROM users WHERE id = $1', [userId]);

      if (userResult.rows.length === 0) {
        return { verified: false };
      }

      // Проверяем наличие кошелька и определяем роль
      const wallet = await getLinkedWallet(userId);
      let role = 'user'; // Базовая роль для доступа к чату

      if (wallet) {
        // Если есть кошелек, проверяем баланс токенов
        const isAdmin = await checkAdminRole(wallet);
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
        wallet: wallet || null,
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
        logger.info(
          `[verifyTelegramAuth] Using existing authenticated user ${userId} from session`
        );

        // Связываем Telegram с текущим пользователем
        await this.linkIdentity(userId, 'telegram', telegramId);

        return {
          success: true,
          userId,
          role: session.isAdmin ? 'admin' : 'user',
          telegramId,
          isNewUser: false,
        };
      }

      // Если в сессии нет авторизованного пользователя, проверяем существующие идентификаторы
      // Проверяем, существует ли уже пользователь с таким Telegram ID
      const existingUserResult = await db.getQuery()(
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
        logger.info(
          `[verifyTelegramAuth] Found existing user ${userId} for Telegram ID ${telegramId}`
        );
      } else {
        // Создаем нового пользователя для нового telegramId
        const newUserResult = await db.getQuery()('INSERT INTO users (role) VALUES ($1) RETURNING id', [
          'user',
        ]);
        userId = newUserResult.rows[0].id;
        isNewUser = true;

        // Добавляем Telegram идентификатор
        await db.getQuery()(
          'INSERT INTO user_identities (user_id, provider, provider_id) VALUES ($1, $2, $3)',
          [userId, 'telegram', telegramId]
        );

        logger.info(
          `[verifyTelegramAuth] Created new user ${userId} for Telegram ID ${telegramId}`
        );
      }

      // Если есть гостевой ID в сессии, сохраняем его для нового пользователя
      if (session.guestId && isNewUser) {
        await db.getQuery()(
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
        isNewUser,
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

    try {
      const isAdmin = await checkAdminRole(address);

      // Обновляем роль пользователя в базе данных, если есть админские токены
      if (isAdmin) {
        try {
          // Находим userId по адресу
          const userResult = await db.getQuery()(
            `
            SELECT u.id FROM users u 
            JOIN user_identities ui ON u.id = ui.user_id 
            WHERE ui.provider = 'wallet' AND ui.provider_id = $1`,
            [address.toLowerCase()]
          );

          if (userResult.rows.length > 0) {
            const userId = userResult.rows[0].id;
            // Обновляем роль пользователя
            await db.getQuery()('UPDATE users SET role = $1 WHERE id = $2', ['admin', userId]);
            logger.info(`Updated user ${userId} role to admin based on token holdings`);
          }
        } catch (error) {
          logger.error('Error updating user role:', error);
          // Продолжаем выполнение, даже если обновление роли не удалось
        }
      } else {
        // Если пользователь не является администратором, сбрасываем роль на "user", если она была "admin"
        try {
          const userResult = await db.getQuery()(
            `
            SELECT u.id, u.role FROM users u 
            JOIN user_identities ui ON u.id = ui.user_id 
            WHERE ui.provider = 'wallet' AND ui.provider_id = $1`,
            [address.toLowerCase()]
          );

          if (userResult.rows.length > 0 && userResult.rows[0].role === 'admin') {
            const userId = userResult.rows[0].id;
            await db.getQuery()('UPDATE users SET role = $1 WHERE id = $2', ['user', userId]);
            logger.info(`Reset user ${userId} role from admin to user (no tokens found)`);
          }
        } catch (error) {
          logger.error('Error updating user role:', error);
        }
      }

      return isAdmin;
    } catch (error) {
      logger.error(`Error in checkAdminTokens: ${error.message}`);
      return false; // При любой ошибке считаем, что пользователь не админ
    }
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
      const guestIdentities = identities.filter((id) => id.identity_type === 'guest');

      // Если гостевых идентификаторов больше 3, удаляем старые
      if (guestIdentities.length > 3) {
        // Сортируем по дате создания (новые первые)
        guestIdentities.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

        // Оставляем только 3 последних идентификатора
        const identitiesToDelete = guestIdentities.slice(3);

        // Удаляем старые идентификаторы
        for (const identity of identitiesToDelete) {
          await db.getQuery()('DELETE FROM user_identities WHERE id = $1', [identity.id]);
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
      const result = await db.getQuery()(
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
        new Promise((_, reject) => setTimeout(() => reject(new Error('TIMEOUT')), timeout)),
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
        logger.warn(
          `[AuthService] Missing parameters for linkIdentity: userId=${userId}, provider=${provider}, providerId=${providerId}`
        );
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

      logger.info(
        `[AuthService] Linking identity ${provider}:${normalizedProviderId} to user ${userId}`
      );

      // Проверяем, существует ли уже такой идентификатор
      const existingResult = await db.getQuery()(
        `SELECT user_id FROM user_identities WHERE provider = $1 AND provider_id = $2`,
        [provider, normalizedProviderId]
      );

      if (existingResult.rows.length > 0) {
        const existingUserId = existingResult.rows[0].user_id;

        // Если идентификатор уже принадлежит этому пользователю, ничего не делаем
        if (existingUserId === userId) {
          logger.info(
            `[AuthService] Identity ${provider}:${normalizedProviderId} already exists for user ${userId}`
          );
          return { success: true, message: 'Identity already exists' };
        } else {
          // Если идентификатор принадлежит другому пользователю, возвращаем ошибку
          logger.warn(
            `[AuthService] Identity ${provider}:${normalizedProviderId} already belongs to user ${existingUserId}, not user ${userId}`
          );
          throw new Error(`Identity already belongs to another user (${existingUserId})`);
        }
      }

      // Добавляем новый идентификатор для пользователя
      await db.getQuery()(
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
          await db.getQuery()('UPDATE users SET role = $1 WHERE id = $2', ['admin', userId]);
          logger.info(`[AuthService] Updated user ${userId} role to admin based on token holdings`);
        }
      }

      logger.info(
        `[AuthService] Identity ${provider}:${normalizedProviderId} successfully linked to user ${userId}`
      );
      return { success: true, isAdmin };
    } catch (error) {
      logger.error(
        `[AuthService] Error linking identity ${provider}:${providerId} to user ${userId}:`,
        error
      );
      throw error;
    }
  }

  /**
   * Обрабатывает успешную верификацию Email.
   * Находит или создает пользователя, связывает email, проверяет роль админа.
   * @param {string} email - Верифицированный email.
   * @param {object} session - Объект сессии запроса.
   * @returns {Promise<{userId: number, email: string, role: string, isNewUser: boolean}>}
   */
  async handleEmailVerification(email, session) {
    const normalizedEmail = email.toLowerCase();
    let userId;
    let isNewUser = false;
    let userRole = 'user'; // Роль по умолчанию

    try {
      // 1. Определить пользователя (существующий по email/сессии или новый)
      if (session.authenticated && session.userId) {
        // Используем уже аутентифицированного пользователя
        userId = session.userId;
        logger.info(`[handleEmailVerification] Using authenticated user ${userId}`);
      } else {
        // Ищем существующего пользователя по email
        const existingUser = await identityService.findUserByIdentity('email', normalizedEmail);
        if (existingUser) {
          userId = existingUser.id;
          logger.info(`[handleEmailVerification] Found existing user ${userId} by email ${normalizedEmail}`);
        } else if (session.tempUserId) {
          // Используем временного пользователя, если есть
          userId = session.tempUserId;
          logger.info(`[handleEmailVerification] Using temporary user ${userId}`);
        } else {
          // Создаем нового пользователя
          const newUserResult = await db.getQuery()('INSERT INTO users (role) VALUES ($1) RETURNING id', [
            'user',
          ]);
          userId = newUserResult.rows[0].id;
          isNewUser = true;
          logger.info(`[handleEmailVerification] Created new user ${userId}`);
        }
      }

      // 2. Связать email с пользователем (если еще не связан)
      await identityService.saveIdentity(userId, 'email', normalizedEmail, true);
      logger.info(`[handleEmailVerification] Ensured email identity ${normalizedEmail} for user ${userId}`);

      // 3. Связать гостевые ID (если есть)
      if (session.guestId) {
        await identityService.saveIdentity(userId, 'guest', session.guestId, true);
      }
      if (session.previousGuestId && session.previousGuestId !== session.guestId) {
        await identityService.saveIdentity(userId, 'guest', session.previousGuestId, true);
      }

      // 4. Проверить роль на основе привязанного кошелька
      try {
        const linkedWallet = await getLinkedWallet(userId);
        if (linkedWallet && linkedWallet.provider_id) {
          logger.info(`[handleEmailVerification] Found linked wallet ${linkedWallet.provider_id}. Checking role...`);
          const isAdmin = await checkAdminRole(linkedWallet.provider_id);
          userRole = isAdmin ? 'admin' : 'user';
          logger.info(`[handleEmailVerification] Role determined as: ${userRole}`);

          // Опционально: Обновить роль в таблице users
          const currentUser = await db.getQuery()('SELECT role FROM users WHERE id = $1', [userId]);
          if (currentUser.rows.length > 0 && currentUser.rows[0].role !== userRole) {
            await db.getQuery()('UPDATE users SET role = $1 WHERE id = $2', [userRole, userId]);
            logger.info(`[handleEmailVerification] Updated user role in DB to ${userRole}`);
          }
        } else {
          logger.info(`[handleEmailVerification] No linked wallet found. Role remains 'user'.`);
          // Если кошелька нет, проверяем текущую роль из базы (на случай, если она была admin ранее)
          const currentUser = await db.getQuery()('SELECT role FROM users WHERE id = $1', [userId]);
          if (currentUser.rows.length > 0) {
            userRole = currentUser.rows[0].role;
          }
        }
      } catch (roleCheckError) {
        logger.error(`[handleEmailVerification] Error checking admin role:`, roleCheckError);
        // В случае ошибки берем текущую роль из базы или оставляем 'user'
        try {
          const currentUser = await db.getQuery()('SELECT role FROM users WHERE id = $1', [userId]);
          if (currentUser.rows.length > 0) {
            userRole = currentUser.rows[0].role;
          }
        } catch (dbError) {
          logger.error('Error fetching current user role after role check error:', dbError);
        }
      }

      // Очистка временных данных из сессии
      delete session.tempUserId;
      delete session.pendingEmail;

      broadcastContactsUpdate();

      return {
        userId,
        email: normalizedEmail,
        role: userRole,
        isNewUser,
      };
    } catch (error) {
      logger.error('Error in handleEmailVerification:', error);
      throw new Error('Ошибка обработки верификации Email');
    }
  }

  /**
   * Получение балансов токенов пользователя только по токенам из базы
   * @param {string} address - адрес кошелька
   * @returns {Promise<Array>} - массив объектов с балансами
   */
  async getUserTokenBalances(address) {
    if (!address) return [];
    const tokens = await authTokenService.getAllAuthTokens();
    const rpcProviders = await rpcProviderService.getAllRpcProviders();
    const rpcMap = {};
    for (const rpc of rpcProviders) {
      rpcMap[rpc.network_id] = rpc.rpc_url;
    }
    const ERC20_ABI = ['function balanceOf(address owner) view returns (uint256)'];
    const results = [];
    for (const token of tokens) {
      const rpcUrl = rpcMap[token.network];
      if (!rpcUrl) continue;
      const provider = new ethers.JsonRpcProvider(rpcUrl);
      const tokenContract = new ethers.Contract(token.address, ERC20_ABI, provider);
      let balance = '0';
      try {
        const rawBalance = await tokenContract.balanceOf(address);
        balance = ethers.formatUnits(rawBalance, 18);
        if (!balance || isNaN(Number(balance))) balance = '0';
      } catch (e) {
        logger.error(`[getUserTokenBalances] Ошибка получения баланса для ${token.name} (${token.address}) в сети ${token.network}:`, e);
        balance = '0';
      }
      results.push({
        network: token.network,
        tokenAddress: token.address,
        tokenName: token.name,
        symbol: token.symbol || '',
        balance,
      });
    }
    return results;
  }
}

// Создаем и экспортируем единственный экземпляр
const authService = new AuthService();
module.exports = authService;
