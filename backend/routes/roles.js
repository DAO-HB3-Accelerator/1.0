const express = require('express');
const router = express.Router();
const db = require('../db');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const authService = require('../services/auth-service');
const logger = require('../utils/logger');
const { USER_ROLES } = require('../utils/constants');

// Получение всех ролей
router.get('/', async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM roles ORDER BY id');
    res.json(result.rows);
  } catch (error) {
    logger.error(`Error getting roles: ${error.message}`);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Получение роли текущего пользователя
router.get('/me', requireAuth, async (req, res) => {
  try {
    const userId = req.session.userId;
    
    const result = await db.query(`
      SELECT r.name as role
      FROM users u
      JOIN roles r ON u.role_id = r.id
      WHERE u.id = $1
    `, [userId]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    res.json({ role: result.rows[0].role });
  } catch (error) {
    logger.error(`Error getting user role: ${error.message}`);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Создание новой роли (только для администраторов)
router.post('/', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { name, description } = req.body;
    
    if (!name) {
      return res.status(400).json({ error: 'Role name is required' });
    }
    
    // Проверяем, существует ли уже такая роль
    const existingRole = await db.query('SELECT * FROM roles WHERE name = $1', [name]);
    
    if (existingRole.rows.length > 0) {
      return res.status(400).json({ error: 'Role already exists' });
    }
    
    // Создаем новую роль
    const result = await db.query(
      'INSERT INTO roles (name, description) VALUES ($1, $2) RETURNING *',
      [name, description || '']
    );
    
    res.status(201).json(result.rows[0]);
  } catch (error) {
    logger.error(`Error creating role: ${error.message}`);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Обновление роли (только для администраторов)
router.put('/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description } = req.body;
    
    if (!name) {
      return res.status(400).json({ error: 'Role name is required' });
    }
    
    // Проверяем, существует ли роль
    const existingRole = await db.query('SELECT * FROM roles WHERE id = $1', [id]);
    
    if (existingRole.rows.length === 0) {
      return res.status(404).json({ error: 'Role not found' });
    }
    
    // Обновляем роль
    const result = await db.query(
      'UPDATE roles SET name = $1, description = $2 WHERE id = $3 RETURNING *',
      [name, description || '', id]
    );
    
    res.json(result.rows[0]);
  } catch (error) {
    logger.error(`Error updating role: ${error.message}`);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Удаление роли (только для администраторов)
router.delete('/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    
    // Проверяем, существует ли роль
    const existingRole = await db.query('SELECT * FROM roles WHERE id = $1', [id]);
    
    if (existingRole.rows.length === 0) {
      return res.status(404).json({ error: 'Role not found' });
    }
    
    // Проверяем, не используется ли роль
    const usersWithRole = await db.query('SELECT COUNT(*) FROM users WHERE role_id = $1', [id]);
    
    if (parseInt(usersWithRole.rows[0].count) > 0) {
      return res.status(400).json({ error: 'Cannot delete role that is assigned to users' });
    }
    
    // Удаляем роль
    await db.query('DELETE FROM roles WHERE id = $1', [id]);
    
    res.json({ success: true });
  } catch (error) {
    logger.error(`Error deleting role: ${error.message}`);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Назначение роли пользователю (только для администраторов)
router.post('/assign', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { userId, roleName } = req.body;
    
    if (!userId || !roleName) {
      return res.status(400).json({ error: 'User ID and role name are required' });
    }
    
    // Проверяем, существует ли роль
    const roleResult = await db.query('SELECT id FROM roles WHERE name = $1', [roleName]);
    
    if (roleResult.rows.length === 0) {
      return res.status(404).json({ error: 'Role not found' });
    }
    
    const roleId = roleResult.rows[0].id;
    
    // Проверяем, существует ли пользователь
    const userResult = await db.query('SELECT * FROM users WHERE id = $1', [userId]);
    
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Назначаем роль
    await db.query('UPDATE users SET role_id = $1 WHERE id = $2', [roleId, userId]);
    
    res.json({ success: true });
  } catch (error) {
    logger.error(`Error assigning role: ${error.message}`);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router; 