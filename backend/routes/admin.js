const express = require('express');
const router = express.Router();
const { requireAdmin } = require('../middleware/auth');
const authService = require('../services/auth-service');
const logger = require('../utils/logger');

// Роли
router.get('/roles', requireAdmin, async (req, res) => {
  try {
    const roles = await authService.getAllRoles();
    res.json({ success: true, roles });
  } catch (error) {
    logger.error('Error getting roles:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/roles', requireAdmin, async (req, res) => {
  try {
    const { name, permissions } = req.body;
    const role = await authService.createRole(name, permissions);
    res.json({ success: true, role });
  } catch (error) {
    logger.error('Error creating role:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Админ функции
router.get('/users', requireAdmin, async (req, res) => {
  try {
    const users = await authService.getAllUsers();
    res.json({ success: true, users });
  } catch (error) {
    logger.error('Error getting users:', error);
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
