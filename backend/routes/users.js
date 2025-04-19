const express = require('express');
const router = express.Router();
const db = require('../db');
const logger = require('../utils/logger');
const { requireAuth } = require('../middleware/auth');

// Получение списка пользователей
router.get('/', (req, res) => {
  res.json({ message: 'Users API endpoint' });
});

// Получение информации о пользователе
router.get('/:address', (req, res) => {
  const { address } = req.params;
  res.json({
    address,
    message: 'User details endpoint',
  });
});

// Маршрут для обновления языка пользователя
router.post('/update-language', requireAuth, async (req, res) => {
  try {
    const { language } = req.body;
    const userId = req.session.userId;
    
    // Проверка валидности языка
    const validLanguages = ['ru', 'en'];
    if (!validLanguages.includes(language)) {
      return res.status(400).json({ error: 'Неподдерживаемый язык' });
    }
    
    // Обновление языка в базе данных
    await db.query(
      'UPDATE users SET preferred_language = $1 WHERE id = $2',
      [language, userId]
    );
    
    res.json({ success: true });
  } catch (error) {
    logger.error('Error updating language:', error);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

// Маршрут для обновления имени и фамилии пользователя
router.post('/update-profile', requireAuth, async (req, res) => {
  try {
    const { firstName, lastName } = req.body;
    const userId = req.session.userId;
    
    // Проверка валидности данных
    if (firstName && firstName.length > 255) {
      return res.status(400).json({ error: 'Имя слишком длинное (максимум 255 символов)' });
    }
    
    if (lastName && lastName.length > 255) {
      return res.status(400).json({ error: 'Фамилия слишком длинная (максимум 255 символов)' });
    }
    
    // Обновление имени и фамилии в базе данных
    await db.query(
      'UPDATE users SET first_name = $1, last_name = $2 WHERE id = $3',
      [firstName || null, lastName || null, userId]
    );
    
    res.json({ success: true });
  } catch (error) {
    logger.error('Error updating user profile:', error);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

// Маршрут для получения профиля пользователя
router.get('/profile/current', requireAuth, async (req, res) => {
  try {
    const userId = req.session.userId;
    
    // Получение данных пользователя
    const userResult = await db.query(
      'SELECT id, username, first_name, last_name, role, status, created_at, preferred_language FROM users WHERE id = $1',
      [userId]
    );
    
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'Пользователь не найден' });
    }
    
    // Получение идентификаторов пользователя
    const identitiesResult = await db.query(
      'SELECT provider, provider_id FROM user_identities WHERE user_id = $1',
      [userId]
    );
    
    const user = userResult.rows[0];
    const identities = identitiesResult.rows.reduce((acc, identity) => {
      acc[identity.provider] = identity.provider_id;
      return acc;
    }, {});
    
    res.json({
      id: user.id,
      username: user.username,
      firstName: user.first_name,
      lastName: user.last_name,
      role: user.role,
      status: user.status,
      createdAt: user.created_at,
      preferredLanguage: user.preferred_language,
      identities
    });
  } catch (error) {
    logger.error('Error getting user profile:', error);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

module.exports = router;
