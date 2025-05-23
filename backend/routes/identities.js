const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const authService = require('../services/auth-service');
const logger = require('../utils/logger');
const db = require('../db');

// Получение всех идентификаторов пользователя
router.get('/', requireAuth, async (req, res, next) => {
  try {
    const userId = req.session.userId;
    const identities = await authService.getUserIdentities(userId);
    res.json({ success: true, identities });
  } catch (error) {
    logger.error('Error getting identities:', error);
    next(error);
  }
});

// Связывание нового идентификатора
router.post('/link', requireAuth, async (req, res, next) => {
  try {
    const { type, value } = req.body;
    const userId = req.session.userId;

    // Если тип - wallet, сначала проверим, не привязан ли он уже к другому пользователю
    if (type === 'wallet') {
      const normalizedWallet = value.toLowerCase();

      // Проверяем, существует ли уже такой кошелек
      const existingCheck = await db.getQuery()(
        `SELECT user_id FROM user_identities 
         WHERE provider = 'wallet' AND provider_id = $1`,
        [normalizedWallet]
      );

      if (existingCheck.rows.length > 0) {
        const existingUserId = existingCheck.rows[0].user_id;
        if (existingUserId !== userId) {
          return res.status(400).json({
            success: false,
            error: `This wallet (${value}) is already linked to another account`,
          });
        }
      }
    }

    await authService.linkIdentity(userId, type, value);

    // Обновляем сессию
    if (type === 'wallet') {
      req.session.address = value;
      req.session.isAdmin = await authService.checkTokensAndUpdateRole(value);
    } else if (type === 'telegram') {
      req.session.telegramId = value;
    } else if (type === 'email') {
      req.session.email = value;
    }

    res.json({
      success: true,
      message: 'Identity linked successfully',
      isAdmin: req.session.isAdmin,
    });
  } catch (error) {
    logger.error('Error linking identity:', error);

    // Делаем более понятные сообщения об ошибках
    if (error.message && error.message.includes('already belongs to another user')) {
      return res.status(400).json({
        success: false,
        error: `This identity is already linked to another account`,
      });
    }

    next(error);
  }
});

// Получение балансов токенов
router.get('/token-balances', requireAuth, async (req, res, next) => {
  try {
    const userId = req.session.userId;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Получаем связанный кошелек
    const wallet = await authService.getLinkedWallet(userId);
    if (!wallet) {
      return res.status(404).json({ error: 'No wallet linked' });
    }

    // Здесь логирование инициирования получения баланса может быть полезно
    logger.info(`Fetching token balances for user ${userId} with wallet ${wallet}`);

    // Получаем балансы токенов
    const balances = await authService.getTokenBalances(wallet);

    res.json({
      success: true,
      balances,
    });
  } catch (error) {
    logger.error('Error getting token balances:', error);
    next(error);
  }
});

// Удаление идентификатора пользователя
router.delete('/:provider/:providerId', requireAuth, async (req, res, next) => {
  try {
    const userId = req.session.userId;
    const { provider, providerId } = req.params;
    const result = await require('../services/identity-service').deleteIdentity(userId, provider, providerId);
    if (result.success) {
      res.json({ success: true, deleted: result.deleted });
    } else {
      res.status(400).json({ success: false, error: result.error });
    }
  } catch (error) {
    logger.error('Error deleting identity:', error);
    next(error);
  }
});

// Получение email-настроек
router.get('/email-settings', requireAuth, async (req, res, next) => {
  try {
    const { rows } = await db.getQuery()('SELECT * FROM email_settings ORDER BY id LIMIT 1');
    if (!rows.length) return res.status(404).json({ success: false, error: 'Not found' });
    const settings = rows[0];
    delete settings.smtp_password; // не возвращаем пароль
    res.json({ success: true, settings });
  } catch (error) {
    logger.error('Error getting email settings:', error, error && error.stack);
    next(error);
  }
});

// Обновление email-настроек
router.put('/email-settings', requireAuth, async (req, res, next) => {
  try {
    const { smtp_host, smtp_port, smtp_user, smtp_password, imap_host, imap_port, from_email } = req.body;
    if (!smtp_host || !smtp_port || !smtp_user || !from_email) {
      return res.status(400).json({ success: false, error: 'Missing required fields' });
    }
    const { rows } = await db.getQuery()('SELECT id FROM email_settings ORDER BY id LIMIT 1');
    if (rows.length) {
      // Обновляем существующую запись
      await db.getQuery()(
        `UPDATE email_settings SET smtp_host=$1, smtp_port=$2, smtp_user=$3, smtp_password=COALESCE($4, smtp_password), imap_host=$5, imap_port=$6, from_email=$7, updated_at=NOW() WHERE id=$8`,
        [smtp_host, smtp_port, smtp_user, smtp_password, imap_host, imap_port, from_email, rows[0].id]
      );
    } else {
      // Вставляем новую
      await db.getQuery()(
        `INSERT INTO email_settings (smtp_host, smtp_port, smtp_user, smtp_password, imap_host, imap_port, from_email) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [smtp_host, smtp_port, smtp_user, smtp_password, imap_host, imap_port, from_email]
      );
    }
    res.json({ success: true });
  } catch (error) {
    logger.error('Error updating email settings:', error);
    next(error);
  }
});

// Получение telegram-настроек
router.get('/telegram-settings', requireAuth, async (req, res, next) => {
  try {
    const { rows } = await db.getQuery()('SELECT * FROM telegram_settings ORDER BY id LIMIT 1');
    if (!rows.length) return res.status(404).json({ success: false, error: 'Not found' });
    const settings = rows[0];
    delete settings.bot_token; // не возвращаем токен
    res.json({ success: true, settings });
  } catch (error) {
    logger.error('Error getting telegram settings:', error, error && error.stack);
    next(error);
  }
});

// Обновление telegram-настроек
router.put('/telegram-settings', requireAuth, async (req, res, next) => {
  try {
    const { bot_token, bot_username } = req.body;
    if (!bot_token || !bot_username) {
      return res.status(400).json({ success: false, error: 'Missing required fields' });
    }
    const { rows } = await db.getQuery()('SELECT id FROM telegram_settings ORDER BY id LIMIT 1');
    if (rows.length) {
      // Обновляем существующую запись
      await db.getQuery()(
        `UPDATE telegram_settings SET bot_token=$1, bot_username=$2, updated_at=NOW() WHERE id=$3`,
        [bot_token, bot_username, rows[0].id]
      );
    } else {
      // Вставляем новую
      await db.getQuery()(
        `INSERT INTO telegram_settings (bot_token, bot_username) VALUES ($1,$2)` ,
        [bot_token, bot_username]
      );
    }
    res.json({ success: true });
  } catch (error) {
    logger.error('Error updating telegram settings:', error);
    next(error);
  }
});

// Получение db-настроек
router.get('/db-settings', requireAuth, async (req, res, next) => {
  try {
    const { rows } = await db.getQuery()('SELECT * FROM db_settings ORDER BY id LIMIT 1');
    if (!rows.length) return res.status(404).json({ success: false, error: 'Not found' });
    const settings = rows[0];
    delete settings.db_password; // не возвращаем пароль
    res.json({ success: true, settings });
  } catch (error) {
    logger.error('Error getting db settings:', error, error && error.stack);
    next(error);
  }
});

// Обновление db-настроек
router.put('/db-settings', requireAuth, async (req, res, next) => {
  try {
    const { db_host, db_port, db_name, db_user, db_password } = req.body;
    if (!db_host || !db_port || !db_name || !db_user) {
      return res.status(400).json({ success: false, error: 'Missing required fields' });
    }
    const { rows } = await db.getQuery()('SELECT id FROM db_settings ORDER BY id LIMIT 1');
    if (rows.length) {
      // Обновляем существующую запись
      await db.getQuery()(
        `UPDATE db_settings SET db_host=$1, db_port=$2, db_name=$3, db_user=$4, db_password=COALESCE($5, db_password), updated_at=NOW() WHERE id=$6`,
        [db_host, db_port, db_name, db_user, db_password, rows[0].id]
      );
    } else {
      // Вставляем новую
      await db.getQuery()(
        `INSERT INTO db_settings (db_host, db_port, db_name, db_user, db_password) VALUES ($1,$2,$3,$4,$5)` ,
        [db_host, db_port, db_name, db_user, db_password]
      );
    }
    // Пересоздаём пул соединений с новыми настройками
    await db.reinitPoolFromDbSettings();
    res.json({ success: true });
  } catch (error) {
    logger.error('Error updating db settings:', error);
    next(error);
  }
});

module.exports = router;
