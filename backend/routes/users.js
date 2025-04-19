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

module.exports = router;
