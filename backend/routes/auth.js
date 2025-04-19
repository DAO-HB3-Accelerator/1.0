const express = require('express');
const router = express.Router();
const { ethers } = require('ethers');
const crypto = require('crypto');
const db = require('../db');
const logger = require('../utils/logger');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { checkRole, requireAuth } = require('../middleware/auth');
const { pool } = require('../db');
const { verifySignature, checkAccess, findOrCreateUser } = require('../utils/auth');
const authService = require('../services/auth-service');

// Создайте лимитер для попыток аутентификации
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 минут
  max: 20, // Увеличьте лимит с 5 до 20
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
    
    // Сохраняем nonce в сессии
    req.session.authNonce = nonce;
    req.session.pendingAddress = address;
    
    // Важно: сохраняем сессию перед отправкой ответа
    await new Promise((resolve, reject) => {
      req.session.save(err => {
        if (err) reject(err);
        else resolve();
      });
    });
    
    console.log('Сессия после генерации nonce:', req.session);
    console.log('Сессия после сохранения:', req.session);
    
    return res.json({ nonce });
  } catch (error) {
    console.error('Error generating nonce:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// Функция для проверки роли пользователя
async function checkUserRole(address, req) {
  try {
    const lowerCaseAddress = address.toLowerCase();

    // Проверяем наличие токена доступа в базе данных
    const result = await db.query(
      'SELECT role FROM access_tokens WHERE LOWER(wallet_address) = $1 AND expires_at > NOW()',
      [lowerCaseAddress]
    );

    if (result.rows.length > 0) {
      // Если есть активный токен, проверяем роль
      const role = result.rows[0].role;
      return role === 'ADMIN';
    }

    // Если нет токена, проверяем адрес администратора из переменных окружения
    const adminAddresses = (process.env.ADMIN_ADDRESSES || '')
      .split(',')
      .map((a) => a.toLowerCase());
    return adminAddresses.includes(lowerCaseAddress);
  } catch (error) {
    console.error('Ошибка при проверке роли пользователя:', error);
    return false;
  }
}

// Проверка подписи и аутентификация
router.post('/verify', async (req, res) => {
  try {
    const { address, signature, message } = req.body;
    
    console.log('Verify request: address=' + address + ', signature=' + signature.substring(0, 10) + '...');
    console.log('Session data: nonce=' + req.session.authNonce + ', pendingAddress=' + req.session.pendingAddress);
    
    // Проверяем, что nonce и адрес совпадают с сохраненными в сессии
    if (!req.session.authNonce || !req.session.pendingAddress || req.session.pendingAddress !== address) {
      console.error(`Invalid session or address mismatch: nonce=${req.session.authNonce}, pendingAddress=${req.session.pendingAddress}, address=${address}`);
      return res.status(401).json({ error: 'Invalid session or address mismatch' });
    }
    
    // Проверяем подпись
    const isValid = await verifySignature(req.session.authNonce, signature, address);
    console.log('Signature verification result:', isValid);
    
    if (!isValid) {
      return res.status(401).json({ error: 'Invalid signature' });
    }
    
    // Находим или создаем пользователя
    console.log('Finding or creating user for address:', address);
    const { userId, isAdmin } = await findOrCreateUser(address);
    console.log('User found/created:', { userId, isAdmin });
    
    // Очищаем nonce и pendingAddress из сессии
    const nonce = req.session.authNonce;
    req.session.authNonce = null;
    req.session.pendingAddress = null;
    
    // Устанавливаем пользователя в сессии
    req.session.userId = userId;
    req.session.address = address;
    req.session.isAdmin = isAdmin;
    req.session.authenticated = true;
    
    // Сохраняем сессию
    await new Promise((resolve, reject) => {
      req.session.save(err => {
        if (err) {
          console.error('Error saving session:', err);
          reject(err);
        } else {
          console.log('Session saved successfully');
          resolve();
        }
      });
    });
    
    console.log('Authentication successful for user:', { userId, address, isAdmin });
    
    return res.json({
      authenticated: true,
      userId,
      address,
      isAdmin,
      authType: 'wallet'
    });
  } catch (error) {
    console.error('Error verifying signature:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// Аутентификация через Telegram
router.post('/telegram', async (req, res) => {
  try {
    const { telegramId, authData } = req.body;
    
    // Здесь должна быть проверка данных от Telegram
    
    // Получаем или создаем пользователя
    let userId = await authService.getUserIdByIdentity('telegram', telegramId);
    
    if (!userId) {
      // Создаем нового пользователя
      const userResult = await db.query(
        'INSERT INTO users (created_at, role_id) VALUES (NOW(), (SELECT id FROM roles WHERE name = $1)) RETURNING id',
        ['user']
      );
      
      userId = userResult.rows[0].id;
      
      // Добавляем идентификатор Telegram
      await db.query(
        'INSERT INTO user_identities (user_id, identity_type, identity_value, created_at) VALUES ($1, $2, $3, NOW())',
        [userId, 'telegram', telegramId]
      );
    }
    
    // Проверяем связанные аккаунты
    const identities = await authService.getAllUserIdentities(userId);
    
    // Если есть связанный кошелек, проверяем токены
    if (identities.wallet) {
      await authService.checkTokensAndUpdateRole(identities.wallet);
    }
    
    // Получаем текущую роль
    const isAdmin = await authService.isAdmin(userId);
    
    // Устанавливаем сессию
    req.session.userId = userId;
    req.session.telegramId = telegramId;
    req.session.authType = 'telegram';
    req.session.authenticated = true;
    
    res.json({
      authenticated: true,
      userId,
      isAdmin,
      authType: 'telegram',
      identities
    });
  } catch (error) {
    logger.error(`Telegram auth error: ${error.message}`);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Аутентификация через Email
router.post('/email', async (req, res) => {
  try {
    const { email, verificationCode } = req.body;
    
    // Здесь должна быть проверка кода подтверждения
    
    // Получаем или создаем пользователя
    let userId = await authService.getUserIdByIdentity('email', email);
    
    if (!userId) {
      // Создаем нового пользователя
      const userResult = await db.query(
        'INSERT INTO users (created_at, role_id) VALUES (NOW(), (SELECT id FROM roles WHERE name = $1)) RETURNING id',
        ['user']
      );
      
      userId = userResult.rows[0].id;
      
      // Добавляем идентификатор Email
      await db.query(
        'INSERT INTO user_identities (user_id, identity_type, identity_value, created_at) VALUES ($1, $2, $3, NOW())',
        [userId, 'email', email]
      );
    }
    
    // Проверяем связанные аккаунты
    const identities = await authService.getAllUserIdentities(userId);
    
    // Если есть связанный кошелек, проверяем токены
    if (identities.wallet) {
      await authService.checkTokensAndUpdateRole(identities.wallet);
    }
    
    // Получаем текущую роль
    const isAdmin = await authService.isAdmin(userId);
    
    // Устанавливаем сессию
    req.session.userId = userId;
    req.session.email = email;
    req.session.authType = 'email';
    req.session.authenticated = true;
      
      res.json({ 
        authenticated: true, 
      userId,
      isAdmin,
      authType: 'email',
      identities
    });
  } catch (error) {
    logger.error(`Email auth error: ${error.message}`);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Связывание аккаунтов
router.post('/link-identity', async (req, res) => {
  try {
    if (!req.session || !req.session.userId) {
      return res.status(401).json({ error: 'Требуется аутентификация' });
    }
    
    const { identityType, identityValue } = req.body;
    
    // Проверяем, не привязан ли уже этот идентификатор к другому пользователю
    const existingUserId = await authService.getUserIdByIdentity(identityType, identityValue);
    
    if (existingUserId && existingUserId !== req.session.userId) {
      return res.status(400).json({ error: 'Этот идентификатор уже привязан к другому аккаунту' });
    }
    
    // Добавляем новый идентификатор
    if (!existingUserId) {
      await db.query(
        'INSERT INTO user_identities (user_id, identity_type, identity_value, created_at) VALUES ($1, $2, $3, NOW())',
        [req.session.userId, identityType, identityValue]
      );
    }
    
    // Если добавлен кошелек, проверяем токены
    if (identityType === 'wallet') {
      await authService.checkTokensAndUpdateRole(identityValue);
    }
    
    // Получаем все идентификаторы пользователя
    const identities = await authService.getAllUserIdentities(req.session.userId);
    
    // Получаем текущую роль
    const isAdmin = await authService.isAdmin(req.session.userId);
    
    res.json({
      success: true,
      identities,
      isAdmin
    });
  } catch (error) {
    logger.error(`Link identity error: ${error.message}`);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Проверка текущей сессии
router.get('/check', (req, res) => {
  console.log('Сессия при проверке:', req.session);
  
  // Если сессия существует и пользователь аутентифицирован
  if (req.session && req.session.authenticated) {
    res.json({
      authenticated: true,
      address: req.session.address,
      isAdmin: req.session.isAdmin || false,
      role: req.session.role || 'USER'
    });
  } else {
    res.json({
      authenticated: false,
      address: null,
      isAdmin: false,
      authType: null
    });
  }
});

// Обработчик выхода из системы
router.post('/logout', (req, res) => {
  try {
    // Сохраняем sessionID перед удалением сессии
    const sessionID = req.sessionID;
    
    // Удаляем сессию из хранилища
    req.session.destroy(async (err) => {
      if (err) {
        console.error('Ошибка при удалении сессии:', err);
        return res.status(500).json({ error: 'Internal server error' });
      }
      
      try {
        // Удаляем запись из базы данных
        await db.query('DELETE FROM sessions WHERE sid = $1', [sessionID]);
        console.log(`Сессия ${sessionID} удалена из базы данных`);
      } catch (dbErr) {
        console.error('Ошибка при удалении сессии из базы данных:', dbErr);
      }
      
      // Очищаем cookie
      res.clearCookie('dapp.sid');
      res.json({ success: true });
    });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Маршрут для авторизации через Telegram
router.get('/telegram', (req, res) => {
  // Генерируем случайный токен для авторизации
  const token = crypto.randomBytes(32).toString('hex');

  // Сохраняем токен в сессии
  req.session.telegramToken = token;

  // Создаем URL для авторизации через Telegram
  const botName = process.env.TELEGRAM_BOT_NAME || 'YourBotName';
  const authUrl = `https://t.me/${botName}?start=${token}`;

  res.json({ authUrl });
});

// Маршрут для авторизации через Email
router.post('/email', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    // Генерируем код подтверждения
    const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();

    // Сохраняем код в сессии
    req.session.emailVerificationCode = verificationCode;
    req.session.pendingEmail = email;

    // В реальном приложении здесь нужно отправить email с кодом подтверждения
    // Удалите или закомментируйте эти логи
    // console.log(`Verification code for ${email}: ${verificationCode}`);

    res.json({ success: true, message: 'Verification code sent' });
  } catch (error) {
    // Удалите или закомментируйте эти логи
    // console.error('Error sending verification code:', error);
    logger.error('Error sending verification code:', error);
    res.status(500).json({ error: 'Failed to send verification code' });
  }
});

// Маршрут для проверки кода подтверждения Email
router.post('/email/verify', async (req, res) => {
  try {
    const { email, code } = req.body;

    if (!email || !code) {
      return res.status(400).json({ error: 'Email and code are required' });
    }

    // Получаем код из сессии
    const verificationCode = req.session.emailVerificationCode;
    const pendingEmail = req.session.pendingEmail;

    if (!verificationCode || !pendingEmail) {
      return res.status(400).json({ error: 'No pending verification' });
    }

    // Проверяем, что email совпадает с тем, для которого был сгенерирован код
    if (pendingEmail !== email) {
      return res.status(400).json({ error: 'Email mismatch' });
    }

    // Проверяем код
    if (verificationCode !== code) {
      return res.status(400).json({ error: 'Invalid verification code' });
    }

    // Проверяем, существует ли пользователь в базе данных
    const user = await db.query('SELECT * FROM users WHERE email = $1', [email]);

    let userId;
    let isAdmin = false;

    if (user.rows.length === 0) {
      // Если пользователь не существует, создаем его
      const newUser = await db.query(
        'INSERT INTO users (email, created_at) VALUES ($1, NOW()) RETURNING id',
        [email]
      );
      userId = newUser.rows[0].id;
    } else {
      userId = user.rows[0].id;
      isAdmin = user.rows[0].is_admin || false;
    }

    // Устанавливаем состояние аутентификации в сессии
    req.session.isAuthenticated = true;
    req.session.authenticated = true;
    req.session.address = email;
    req.session.userId = userId;
    req.session.isAdmin = isAdmin;
    req.session.authType = 'email';

    // Удаляем код из сессии
    delete req.session.emailVerificationCode;
    delete req.session.pendingEmail;

    res.json({
      authenticated: true,
      address: email,
      isAdmin,
      authType: 'email',
    });
  } catch (error) {
    // Удалите или закомментируйте эти логи
    // console.error('Error verifying email code:', error);
    logger.error('Error verifying email code:', error);
    res.status(500).json({ error: 'Failed to verify email code' });
  }
});

// Добавляем маршрут для проверки прав доступа
router.get('/check-access', requireAuth, (req, res) => {
  try {
    // Получаем информацию о пользователе
    const userData = {
      address: req.session.address,
      isAdmin: req.session.isAdmin || false,
      roles: req.session.roles || [],
      authenticated: true,
    };

    // Проверяем доступ к различным разделам
    const access = {
      dashboard: true, // Все аутентифицированные пользователи имеют доступ к панели управления
      admin: userData.isAdmin, // Только администраторы имеют доступ к админке
      contracts: userData.roles.includes('CONTRACT_MANAGER') || userData.isAdmin,
      users: userData.roles.includes('USER_MANAGER') || userData.isAdmin,
    };

    res.json({
      user: userData,
      access: access,
    });
  } catch (error) {
    console.error('Ошибка при проверке прав доступа:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Добавьте этот маршрут в routes/auth.js
router.post('/refresh-session', async (req, res) => {
  try {
    const { address } = req.body;
    
    if (!address) {
      return res.status(400).json({ error: 'Address is required' });
    }
    
    logger.info(`Получен запрос на обновление сессии для адреса: ${address}`);
    
    // Проверяем доступ пользователя
    const accessInfo = await checkAccess(address);
    
    if (!accessInfo.hasAccess) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    // Устанавливаем данные сессии
    req.session.authenticated = true;
    req.session.address = address;
    req.session.userId = accessInfo.userId;
    req.session.isAdmin = accessInfo.isAdmin;
    req.session.authType = 'wallet';
    
    await req.session.save();
    
    res.json({
      authenticated: true,
      address,
      isAdmin: accessInfo.isAdmin,
      authType: 'wallet'
    });
  } catch (error) {
    logger.error(`Error refreshing session: ${error.message}`);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Маршрут для обновления статуса администратора
router.post('/update-admin-status', async (req, res) => {
  try {
    const { address, isAdmin } = req.body;

    if (!address) {
      return res.status(400).json({ error: 'Address is required' });
    }

    console.log(`Запрос на обновление статуса администратора для адреса ${address} на ${isAdmin}`);

    // Проверяем, существует ли пользователь
    const userResult = await db.query('SELECT * FROM users WHERE address = $1', [
      address.toLowerCase(),
    ]);

    if (userResult.rows.length === 0) {
      // Если пользователь не найден, создаем его
      await db.query('INSERT INTO users (address, is_admin, created_at) VALUES ($1, $2, NOW())', [
        address.toLowerCase(),
        isAdmin,
      ]);

      console.log(
        `Создан новый пользователь с адресом ${address} и статусом администратора ${isAdmin}`
      );
    } else {
      // Если пользователь найден, обновляем его статус
      await db.query('UPDATE users SET is_admin = $1 WHERE address = $2', [
        isAdmin,
        address.toLowerCase(),
      ]);

      console.log(
        `Обновлен статус администратора для пользователя с адресом ${address} на ${isAdmin}`
      );
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Ошибка при обновлении статуса администратора:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Маршрут для проверки структуры таблицы users
router.get('/check-db-structure', async (req, res) => {
  try {
    // Получаем информацию о таблице users
    const tableInfo = await pool.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'users'
    `);

    res.json({
      tableStructure: tableInfo.rows,
    });
  } catch (error) {
    console.error('Ошибка при получении структуры базы данных:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Добавьте этот маршрут для отладки
router.get('/debug-session', (req, res) => {
  res.json({
    sessionID: req.sessionID,
    session: req.session,
    authenticated: req.session ? req.session.authenticated : undefined,
    address: req.session ? req.session.address : undefined,
    userId: req.session ? req.session.userId : undefined,
    isAdmin: req.session ? req.session.isAdmin : undefined,
    role: req.session ? req.session.role : undefined
  });
});

// Маршрут для проверки сессии
router.get('/session-debug', (req, res) => {
  console.log('Текущая сессия:', {
    id: req.sessionID,
    session: req.session,
    cookie: req.session.cookie
  });
  
  res.json({
    sessionID: req.sessionID,
    authenticated: req.session.authenticated,
    address: req.session.address,
    userId: req.session.userId,
    isAdmin: req.session.isAdmin,
    role: req.session.role,
    cookie: req.session.cookie
  });
});

// Маршрут для проверки содержимого таблицы сессий
router.get('/check-sessions', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM sessions');
    res.json({
      currentSessionID: req.sessionID,
      sessions: result.rows
    });
  } catch (error) {
    console.error('Ошибка при получении сессий:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Добавьте обработку ошибок
router.use((err, req, res, next) => {
  console.error('Auth route error:', err);
  res.status(500).json({ success: false, message: 'Ошибка сервера' });
});

module.exports = router;
