const express = require('express');
const router = express.Router();
const db = require('../db');

// Маршрут для проверки состояния сервера
router.get('/status', (req, res) => {
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    timestamp: Date.now(),
  });
});

// Маршрут для проверки сессии
router.get('/session', (req, res) => {
  res.json({
    session: req.session,
    authenticated: req.session.authenticated || false,
  });
});

// Маршрут для проверки содержимого таблицы session
router.get('/sessions', async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM session');
    res.json(result.rows);
  } catch (error) {
    console.error('Ошибка при получении данных из таблицы session:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
