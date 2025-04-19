const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const db = require('../db');
const logger = require('../utils/logger');
const rateLimit = require('express-rate-limit');
const { checkRole, requireAuth, auth } = require('../middleware/auth');
const authService = require('../services/auth-service');
const emailBot = require('../services/emailBot');
const { verificationCodes } = require('../services/telegramBot');
const { ethers } = require('ethers');
const { initTelegramAuth } = require('../services/telegramBot');
const emailAuth = require('../services/emailAuth');
const verificationService = require('../services/verification-service');
const { processGuestMessages } = require('./chat');
const identityService = require('../services/identity-service');
const sessionService = require('../services/session-service');

// Создаем лимитер для попыток аутентификации
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 минут
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Слишком много попыток аутентификации. Попробуйте позже.' },
});

// Получение nonce для аутентификации
router.get('/nonce', async (req, res) => {
  try {
    const { address } = req.query;
    if (!address) {
      return res.status(400).json({ error: 'Address is required' });
    }

    // Генерируем случайный nonce
    const nonce = crypto.randomBytes(16).toString('hex');
    
    // Проверяем, существует ли уже nonce для этого адреса
    const existingNonce = await db.query(
      'SELECT id FROM nonces WHERE identity_value = $1',
      [address.toLowerCase()]
    );
    
    if (existingNonce.rows.length > 0) {
      // Обновляем существующий nonce
      await db.query(
        'UPDATE nonces SET nonce = $1, expires_at = NOW() + INTERVAL \'15 minutes\' WHERE identity_value = $2',
        [nonce, address.toLowerCase()]
      );
    } else {
      // Создаем новый nonce
      await db.query(
        'INSERT INTO nonces (identity_value, nonce, expires_at) VALUES ($1, $2, NOW() + INTERVAL \'15 minutes\')',
        [address.toLowerCase(), nonce]
      );
    }
    
    logger.info(`Nonce ${nonce} сохранен для адреса ${address}`);
    
    res.json({ nonce });
  } catch (error) {
    logger.error('Error generating nonce:', error);
    res.status(500).json({ error: 'Failed to generate nonce' });
  }
});

// Верификация подписи и создание сессии
router.post('/verify', async (req, res) => {
  try {
    const { address, message, signature } = req.body;
    
    logger.info(`[verify] Verifying signature for address: ${address}`);
    
    // Сохраняем гостевые ID до проверки
    const guestId = req.session.guestId;
    const previousGuestId = req.session.previousGuestId;
    
    // Проверяем подпись
    const isValid = await authService.verifySignature(message, signature, address);
    if (!isValid) {
      return res.status(401).json({ success: false, error: 'Invalid signature' });
    }
    
    // Нормализуем адрес для использования в запросах
    const normalizedAddress = ethers.getAddress(address).toLowerCase();
    
    // Проверяем nonce
    const nonceResult = await db.query('SELECT nonce FROM nonces WHERE identity_value = $1', [normalizedAddress]);
    if (nonceResult.rows.length === 0 || nonceResult.rows[0].nonce !== message.match(/Nonce: ([^\n]+)/)[1]) {
      return res.status(401).json({ success: false, error: 'Invalid nonce' });
    }
    
    let userId;
    let isAdmin = false;
    
    // Проверяем, авторизован ли пользователь уже
    if (req.session.authenticated && req.session.userId) {
      // Если пользователь уже авторизован, привязываем кошелек к существующему пользователю
      userId = req.session.userId;
      logger.info(`[verify] Using existing authenticated user ${userId} for wallet ${normalizedAddress}`);
      
      // Связываем кошелек с пользователем через identity-service для предотвращения дубликатов
      const linkResult = await authService.linkIdentity(
        userId, 
        'wallet',
        address
      );
      
      if (!linkResult.success && linkResult.error) {
        return res.status(400).json({
          success: false,
          error: linkResult.error
        });
      }
      
      // Если linkResult.message содержит 'already exists', значит кошелек уже привязан
      logger.info(`[verify] Wallet ${normalizedAddress} linked to user ${userId}: ${linkResult.message || 'success'}`);
    } else {
      // Находим или создаем пользователя, если не авторизован
      const result = await authService.findOrCreateUser(address);
      userId = result.userId;
      isAdmin = result.isAdmin;
      logger.info(`[verify] Found or created user ${userId} for wallet ${normalizedAddress}`);
    }
    
    // Сохраняем идентификаторы гостевой сессии
    if (guestId) {
      await identityService.saveIdentity(userId, 'guest', guestId, true);
    }
    
    if (previousGuestId && previousGuestId !== guestId) {
      await identityService.saveIdentity(userId, 'guest', previousGuestId, true);
    }
    
    // Проверяем наличие админских токенов
    const adminStatus = await authService.checkAdminTokens(normalizedAddress);
    
    if (adminStatus) {
      await db.query('UPDATE users SET role = $1 WHERE id = $2', ['admin', userId]);
      isAdmin = true;
    }
    
    // Обновляем сессию
    req.session.userId = userId;
    req.session.authenticated = true;
    req.session.authType = 'wallet';
    req.session.isAdmin = adminStatus || isAdmin;
    req.session.address = normalizedAddress; // Всегда сохраняем нормализованный адрес
    
    // Удаляем временный ID
    delete req.session.tempUserId;
    
    // Сохраняем сессию
    await sessionService.saveSession(req.session);
    
    // Связываем гостевые сообщения с пользователем
    await sessionService.linkGuestMessages(req.session, userId);
    
    // Возвращаем успешный ответ
    return res.json({
      success: true,
      userId,
      address: normalizedAddress, // Возвращаем нормализованный адрес
      isAdmin: adminStatus || isAdmin,
      authenticated: true
    });
    
  } catch (error) {
    logger.error('[verify] Error:', error);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

// Аутентификация через Telegram
router.post('/telegram/verify', async (req, res) => {
  try {
    const { telegramId, verificationCode } = req.body;
    
    if (!telegramId || !verificationCode) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields'
      });
    }

    // Сохраняем гостевой ID из текущей сессии
    const guestId = req.session.guestId;
    
    // Передаем сессию в метод верификации
    const verificationResult = await authService.verifyTelegramAuth(
      telegramId,
      verificationCode,
      req.session
    );

    if (!verificationResult.success) {
      return res.status(400).json({
        success: false,
        error: verificationResult.error || 'Verification failed'
      });
    }

    // Создаем новую сессию для этого telegramId
    req.session.regenerate(async (err) => {
      if (err) {
        logger.error('[telegram/verify] Error regenerating session:', err);
        return res.status(500).json({ 
          success: false, 
          error: 'Session error' 
        });
      }

      // Устанавливаем данные в новой сессии
      req.session.userId = verificationResult.userId;
      req.session.telegramId = telegramId;
      req.session.authType = 'telegram';
      req.session.authenticated = true;
      req.session.role = verificationResult.role;
      
      // Восстанавливаем гостевой ID, если он был
      if (guestId) {
        req.session.guestId = guestId;
      }

      // Сохраняем сессию
      await sessionService.saveSession(req.session);

      // Связываем гостевые сообщения только один раз
      if (guestId) {
        await sessionService.linkGuestMessages(req.session, verificationResult.userId);
      }

      return res.json({
        success: true,
        userId: verificationResult.userId,
        role: verificationResult.role,
        telegramId,
        isNewUser: verificationResult.isNewUser
      });
    });
  } catch (error) {
    logger.error('[telegram/verify] Error:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// Маршрут для запроса кода подтверждения по email
router.post('/email/request', authLimiter, async (req, res) => {
  try {
    const { email } = req.body;
    
    if (!email || !email.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) {
      return res.status(400).json({ error: 'Invalid email format' });
    }
    
    // Инициализация email аутентификации
    const result = await emailAuth.initEmailAuth(req.session, email);
    
    // Сохраняем сессию после установки pendingEmail
    await sessionService.saveSession(req.session);
    
    if (result.success) {
      res.json({ 
        success: true, 
        message: 'Код подтверждения отправлен на email' 
      });
    } else {
      res.status(500).json({ 
        success: false, 
        error: result.error || 'Ошибка отправки кода' 
      });
    }
  } catch (error) {
    logger.error('Error requesting email code:', error);
    res.status(500).json({ error: error.message || 'Ошибка сервера' });
  }
});

// Маршрут для верификации email
router.post('/email/verify-code', async (req, res) => {
  try {
    const { code, email } = req.body;
    
    if (!code) {
      return res.status(400).json({ 
        success: false, 
        error: 'Код подтверждения обязателен' 
      });
    }
    
    // Если email передан в запросе, сохраняем его в сессии
    if (email && !req.session.pendingEmail) {
      req.session.pendingEmail = email.toLowerCase();
    }
    
    if (!req.session.pendingEmail) {
      return res.status(400).json({
        success: false,
        error: 'Email не найден в сессии. Пожалуйста, запросите код подтверждения снова.'
      });
    }
    
    // Сохраняем гостевой ID до проверки
    const guestId = req.session.guestId;
    const previousGuestId = req.session.previousGuestId;
    
    // Проверяем код через сервис верификации
    const verificationResult = await verificationService.verifyCode(
      code, 
      'email', 
      req.session.pendingEmail
    );
    
    if (!verificationResult.success) {
      return res.status(400).json({
        success: false,
        error: verificationResult.error || 'Неверный код подтверждения'
      });
    }
    
    // Получаем или создаем пользователя
    let userId;
    let isNewAuth = false;
    
    // Проверяем, авторизован ли пользователь
    if (req.session.authenticated && req.session.userId) {
      // Связываем email с существующим пользователем
      userId = req.session.userId;
      logger.info(`[email/verify-code] Linking email ${req.session.pendingEmail} to existing authenticated user ${userId}`);
      
      // Связываем email с текущим аккаунтом
      const linkResult = await authService.linkIdentity(
        userId, 
        'email', 
        req.session.pendingEmail
      );
      
      // Сохраняем email в сессии
      req.session.email = req.session.pendingEmail;
      
      // Удаляем временные данные
      delete req.session.pendingEmail;
      
      // Сохраняем сессию
      await sessionService.saveSession(req.session);
      
      return res.json({ 
        success: true,
        userId,
        email: req.session.email,
        authenticated: true,
        linked: true
      });
    } else {
      // Если пользователь не авторизован, ищем существующего пользователя или создаем нового
      
      // Ищем существующего пользователя по email
      const existingUser = await identityService.findUserByIdentity(
        'email', 
        req.session.pendingEmail
      );
      
      if (existingUser) {
        // Используем существующего пользователя
        userId = existingUser.id;
        logger.info(`[email/verify-code] Using existing user ${userId} with email ${req.session.pendingEmail}`);
      } else if (req.session.userId) {
        // Используем текущего пользователя
        userId = req.session.userId;
        logger.info(`[email/verify-code] Using current user ${userId} for email ${req.session.pendingEmail}`);
      } else if (req.session.tempUserId) {
        // Используем временного пользователя
        userId = req.session.tempUserId;
        logger.info(`[email/verify-code] Using temporary user ${userId} for email ${req.session.pendingEmail}`);
      } else {
        // Создаем нового пользователя
        const newUser = await db.query(
          'INSERT INTO users (role) VALUES ($1) RETURNING id',
          ['user']
        );
        userId = newUser.rows[0].id;
        isNewAuth = true;
        logger.info(`[email/verify-code] Created new user ${userId} for email ${req.session.pendingEmail}`);
      }
      
      // Сохраняем email как идентификатор
      await identityService.saveIdentity(userId, 'email', req.session.pendingEmail, true);
      
      // Сохраняем гостевые идентификаторы
      if (guestId) {
        await identityService.saveIdentity(userId, 'guest', guestId, true);
      }
      
      if (previousGuestId && previousGuestId !== guestId) {
        await identityService.saveIdentity(userId, 'guest', previousGuestId, true);
      }
      
      // Устанавливаем сессию
      req.session.userId = userId;
      req.session.authenticated = true;
      req.session.authType = 'email';
      req.session.email = req.session.pendingEmail;
      
      // Удаляем временные данные
      delete req.session.tempUserId;
      delete req.session.pendingEmail;
      
      // Сохраняем сессию
      await sessionService.saveSession(req.session);
      
      // Связываем гостевые сообщения
      await sessionService.linkGuestMessages(req.session, userId);
      
      return res.json({ 
        success: true,
        userId,
        email: req.session.email,
        authenticated: true,
        isNewAuth
      });
    }
  } catch (error) {
    logger.error('[email/verify-code] Error:', error);
    return res.status(500).json({ 
      success: false, 
      error: 'Ошибка сервера' 
    });
  }
});

// Инициализация Telegram аутентификации
router.post('/telegram/init', async (req, res) => {
  try {
    const { verificationCode, botLink } = await initTelegramAuth(req.session);
    
    if (!verificationCode || !botLink) {
      throw new Error('Failed to generate verification code');
    }
    
    res.json({ 
      success: true,
      verificationCode, 
      botLink 
    });
  } catch (error) {
    logger.error('Error initializing Telegram auth:', error);
    
    if (error.message === 'Telegram уже привязан к этому аккаунту') {
      return res.status(400).json({ 
        success: false,
        error: error.message 
      });
    }
    
    res.status(500).json({ 
      success: false,
      error: 'Failed to initialize Telegram auth' 
    });
  }
});

// Инициализация email аутентификации
router.post('/email/init', async (req, res) => {
  try {
    const { email } = req.body;
    
    if (!email || !email.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) {
      return res.status(400).json({
        success: false,
        error: 'Некорректный формат email'
      });
    }
    
    // Инициализация email аутентификации
    const result = await emailAuth.initEmailAuth(req.session, email);
    
    // Сохраняем сессию
    await sessionService.saveSession(req.session);
    
    return res.json({
      success: true,
      message: 'Код верификации отправлен на email'
    });
  } catch (error) {
    logger.error('Error in email auth initialization:', error);
    res.status(500).json({
      success: false,
      error: 'Внутренняя ошибка сервера'
    });
  }
});

// Проверка статуса аутентификации
router.get('/check', async (req, res) => {
  try {
    const authenticated = req.session.authenticated || false;
    const authType = req.session.authType || null;
    
    let identities = [];
    let isAdmin = false;
    
    if (authenticated && req.session.userId) {
      // Если пользователь аутентифицирован, получаем его идентификаторы из БД
      try {
        identities = await identityService.getUserIdentities(req.session.userId);
        
        // Проверяем роль пользователя
        const roleResult = await db.query(
          'SELECT role FROM users WHERE id = $1',
          [req.session.userId]
        );
        
        if (roleResult.rows.length > 0) {
          isAdmin = roleResult.rows[0].role === 'admin';
          req.session.isAdmin = isAdmin;
        }
      } catch (error) {
        logger.error(`[session/check] Error fetching identities: ${error.message}`);
      }
    }
    
    // Проверяем, нужно ли создать новый гостевой ID
    if (!authenticated && !req.session.guestId) {
      req.session.guestId = crypto.randomBytes(16).toString('hex');
      
      // Сохраняем сессию с новым гостевым ID
      await sessionService.saveSession(req.session);
    }
    
    // Формируем ответ
    const response = {
      success: true,
      authenticated,
      userId: req.session.userId || null,
      guestId: req.session.guestId || null,
      authType,
      identitiesCount: identities.length,
      isAdmin: isAdmin || false
    };
    
    // Добавляем специфические поля в зависимости от типа аутентификации
    if (authType === 'wallet') {
      response.address = req.session.address || null;
    } else if (authType === 'email') {
      response.email = req.session.email || null;
    } else if (authType === 'telegram') {
      response.telegramId = req.session.telegramId || null;
      if (req.session.telegramUsername) {
        response.telegramUsername = req.session.telegramUsername;
      }
      if (req.session.telegramFirstName) {
        response.telegramFirstName = req.session.telegramFirstName;
      }
    }
    
    return res.json(response);
  } catch (error) {
    logger.error('[session/check] Error:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// Выход из системы
router.post('/logout', async (req, res) => {
  try {
    // Очищаем все идентификаторы сессии
    req.session.authenticated = false;
    req.session.userId = null;
    req.session.address = null;
    req.session.telegramId = null;
    req.session.email = null;
    req.session.isAdmin = false;
    req.session.guestId = null;
    req.session.previousGuestId = null;
    req.session.processedGuestIds = [];
    req.session.pendingEmail = null;
    req.session.authType = null;

    // Сохраняем изменения в сессии
    await sessionService.saveSession(req.session);

    // Уничтожаем сессию полностью
    req.session.destroy((err) => {
      if (err) {
        logger.error('[logout] Error destroying session:', err);
        return res.status(500).json({ success: false, error: 'Error during logout' });
      }
      res.clearCookie('connect.sid');
      res.json({ success: true, message: 'Logged out successfully' });
    });
  } catch (error) {
    logger.error('[logout] Error:', error);
    res.status(500).json({ success: false, error: 'Internal server error during logout' });
  }
});

// Маршрут для проверки и обновления статуса администратора
router.get('/check-access', requireAuth, async (req, res) => {
  try {
    const userId = req.session.userId;
    const address = req.session.address;

    if (address) {
      const isAdmin = await authService.checkAdminTokens(address);
      
      // Обновляем сессию
      req.session.isAdmin = isAdmin;
      await sessionService.saveSession(req.session);

      return res.json({
        success: true,
        isAdmin,
        userId,
        address
      });
    }

    return res.json({
      success: true,
      isAdmin: false,
      userId,
      address: null
    });

  } catch (error) {
    logger.error('Error checking access:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// Обновление сессии
router.post('/refresh-session', async (req, res) => {
  try {
    const { address } = req.body;
    
    if (req.session && req.session.authenticated) {
      logger.info('Обновление сессии для пользователя:', req.session.userId);
      
      // Обновляем время жизни сессии
      req.session.cookie.maxAge = 30 * 24 * 60 * 60 * 1000; // 30 дней
      
      // Сохраняем обновленную сессию
      await sessionService.saveSession(req.session);
      
      return res.json({ success: true });
    } else if (address) {
      // Если сессия не аутентифицирована, но есть адрес
      try {
        const user = await identityService.findUserByIdentity('wallet', address.toLowerCase());
        
        if (user) {
          // Обновляем сессию
          req.session.authenticated = true;
          req.session.userId = user.id;
          req.session.address = address.toLowerCase();
          req.session.isAdmin = user.role === 'admin';
          req.session.authType = 'wallet';
          
          // Сохраняем обновленную сессию
          await sessionService.saveSession(req.session);
          
          return res.json({ success: true });
        }
      } catch (error) {
        logger.error('Ошибка при проверке пользователя:', error);
      }
    }
    
    // Если не удалось обновить сессию, возвращаем успех=false, но не ошибку
    return res.json({ success: false });
  } catch (error) {
    logger.error('Ошибка при обновлении сессии:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Аутентификация через wallet
router.post('/wallet', async (req, res) => {
  try {
    const { address, nonce, signature } = req.body;
    
    if (!address || !nonce || !signature) {
      return res.status(400).json({ 
        success: false, 
        error: 'Missing required fields' 
      });
    }
    
    // Сохраняем гостевые ID до аутентификации
    const guestId = req.session.guestId;
    const previousGuestId = req.session.previousGuestId;

    // Формируем сообщение для проверки
    const message = `Sign this message to authenticate with HB3 DApp: ${nonce}`;
    
    // Проверяем подпись
    const validSignature = await authService.verifySignature(message, signature, address);
    if (!validSignature) {
      return res.status(401).json({ 
        success: false, 
        error: 'Invalid signature' 
      });
    }
    
    // Получаем или создаем пользователя
    const { userId } = await authService.findOrCreateUser(address);
    
    // Проверяем наличие админских токенов
    const isAdmin = await authService.checkAdminTokens(address);
    
    // Обновляем роль пользователя в базе данных, если нужно
    if (isAdmin) {
      await db.query(
        'UPDATE users SET role = $1 WHERE id = $2',
        ['admin', userId]
      );
    }
    
    // Сохраняем идентификаторы
    await identityService.saveIdentity(userId, 'wallet', address.toLowerCase(), true);
    
    if (guestId) {
      await identityService.saveIdentity(userId, 'guest', guestId, true);
    }
    
    if (previousGuestId && previousGuestId !== guestId) {
      await identityService.saveIdentity(userId, 'guest', previousGuestId, true);
    }
    
    // Устанавливаем сессию
    req.session.userId = userId;
    req.session.address = address.toLowerCase();
    req.session.authType = 'wallet';
    req.session.authenticated = true;
    req.session.isAdmin = isAdmin;
    
    // Сохраняем сессию
    await sessionService.saveSession(req.session);
    
    // Связываем гостевые сообщения с пользователем
    await sessionService.linkGuestMessages(req.session, userId);
    
    // Возвращаем успешный ответ
    return res.json({
      success: true,
      userId,
      address,
      isAdmin,
      authenticated: true
    });
    
  } catch (error) {
    logger.error('[wallet] Error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Server error during wallet authentication' 
    });
  }
});

// Маршрут для получения всех идентификаторов пользователя
router.get('/identities', requireAuth, async (req, res) => {
  try {
    const { userId } = req.session;
    
    // Получаем все идентификаторы пользователя
    const identities = await identityService.getUserIdentities(userId);
    
    res.json({
      success: true,
      identities
    });
  } catch (error) {
    logger.error('Error getting user identities:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// Маршрут для проверки и инициализации сессии гостя
router.get('/check-session', async (req, res) => {
  try {
    // Если у пользователя нет guestId, создаем его
    if (!req.session.guestId && !req.session.authenticated) {
      req.session.guestId = crypto.randomBytes(16).toString('hex');
      await sessionService.saveSession(req.session);
    }
    
    res.json({
      success: true,
      guestId: req.session.guestId,
      isAuthenticated: req.session.authenticated || false
    });
  } catch (error) {
    logger.error('Error checking session:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// Маршрут для проверки баланса токенов
router.get('/check-tokens/:address', async (req, res) => {
  try {
    const { address } = req.params;
    
    // Получаем балансы токенов на всех сетях
    const balances = await authService.getTokenBalances(address);
    
    res.json({
      success: true,
      balances
    });
  } catch (error) {
    logger.error('Error checking token balances:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

module.exports = router; 