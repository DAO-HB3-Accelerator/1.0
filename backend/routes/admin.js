const express = require('express');
const router = express.Router();
const db = require('../db');
const { requireAdmin } = require('../middleware/auth');

// Маршрут для получения списка пользователей
router.get('/users', async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM users');
    res.json(result.rows);
  } catch (error) {
    console.error('Ошибка при получении списка пользователей:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Маршрут для получения статистики (защищен middleware requireAdmin)
router.get('/stats', requireAdmin, async (req, res) => {
  try {
    // Получаем количество пользователей
    const usersCount = await db.query('SELECT COUNT(*) FROM users');

    // Получаем количество досок
    const boardsCount = await db.query('SELECT COUNT(*) FROM kanban_boards');

    // Получаем количество задач
    const tasksCount = await db.query('SELECT COUNT(*) FROM kanban_tasks');

    res.json({
      userCount: parseInt(usersCount.rows[0].count),
      boardCount: parseInt(boardsCount.rows[0].count),
      taskCount: parseInt(tasksCount.rows[0].count),
    });
  } catch (error) {
    console.error('Ошибка при получении статистики:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Маршрут для получения логов
router.get('/logs', async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM logs ORDER BY created_at DESC LIMIT 100');
    res.json(result.rows);
  } catch (error) {
    console.error('Ошибка при получении логов:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
