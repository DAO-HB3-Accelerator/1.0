const express = require('express');
const router = express.Router();
const { Pool } = require('pg');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const db = require('../db');
const { ethers } = require('ethers');
const authService = require('../services/auth-service');
const logger = require('../utils/logger');

// Проверка доступа
router.get('/check', async (req, res) => {
  try {
    const { address } = req.query;
    
    if (!address) {
      return res.status(400).json({ error: 'Address is required' });
    }
    
    const isAdmin = await authService.checkAdminToken(address);
    
    res.json({ isAdmin });
  } catch (error) {
    logger.error(`Error checking access: ${error.message}`);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Проверка прав администратора
router.get('/admin-only', async (req, res) => {
  const walletAddress = req.headers['x-wallet-address'];

  if (!walletAddress) {
    return res.status(400).json({ error: 'No wallet address provided' });
  }

  try {
    // Временное решение: разрешаем доступ для всех
    console.log('Admin access requested by:', walletAddress);

    res.json({ success: true });
  } catch (error) {
    console.error('Admin check error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Получение всех токенов доступа
router.get('/tokens', async (req, res) => {
  try {
    const tokens = await authService.getAllTokens();
    res.json(tokens);
  } catch (error) {
    logger.error(`Error getting tokens: ${error.message}`);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Создание токена
router.post('/tokens', async (req, res) => {
  const walletAddress = req.headers['x-wallet-address'];

  if (!walletAddress) {
    return res.status(400).json({ error: 'No wallet address provided' });
  }

  try {
    // Проверяем права администратора
    const isAdmin = await authService.checkAdminToken(walletAddress);

    if (!isAdmin) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const { walletAddress: targetAddress, role, expiresInDays } = req.body;

    if (!targetAddress || !role || !expiresInDays) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Вычисляем дату истечения
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + parseInt(expiresInDays));

    // Создаем токен
    const result = await db.query(
      'INSERT INTO access_tokens (wallet_address, role, expires_at) VALUES ($1, $2, $3) RETURNING *',
      [targetAddress.toLowerCase(), role, expiresAt]
    );

    res.json({
      id: result.rows[0].id,
      walletAddress: result.rows[0].wallet_address,
      role: result.rows[0].role,
      createdAt: result.rows[0].created_at,
      expiresAt: result.rows[0].expires_at,
    });
  } catch (error) {
    console.error('Token creation error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Отзыв токена
router.delete('/tokens/:id', async (req, res) => {
  const walletAddress = req.headers['x-wallet-address'];

  if (!walletAddress) {
    return res.status(400).json({ error: 'No wallet address provided' });
  }

  try {
    // Проверяем права администратора
    const isAdmin = await authService.checkAdminToken(walletAddress);

    if (!isAdmin) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const { id } = req.params;

    // Удаляем токен
    await db.query('DELETE FROM access_tokens WHERE id = $1', [id]);

    res.json({ success: true });
  } catch (error) {
    console.error('Token revocation error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Получение информации о роли текущего пользователя
router.get('/role', requireAuth, async (req, res) => {
  try {
    const role = await authService.getUserRole(req.user.id);
    return res.json({ role });
  } catch (error) {
    logger.error('Ошибка при получении роли:', error);
    return res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

// Получение списка всех пользователей (только для администраторов)
router.get('/users', requireAuth, requireAdmin, async (req, res) => {
  try {
    const result = await db.query(`
      SELECT u.id, ui.identity_value as wallet_address, r.name as role, u.created_at 
      FROM users u 
      JOIN roles r ON u.role_id = r.id
      LEFT JOIN user_identities ui ON u.id = ui.user_id AND ui.identity_type = 'wallet'
    `);

    return res.json(result.rows);
  } catch (error) {
    logger.error('Ошибка при получении списка пользователей:', error);
    return res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

// Обновление роли пользователя
router.post('/update-role', async (req, res) => {
  try {
    const { userId, role } = req.body;
    
    if (!userId || !role) {
      return res.status(400).json({ error: 'User ID and role are required' });
    }
    
    const success = await authService.updateUserRole(userId, role);
    
    if (success) {
      res.json({ success: true });
    } else {
      res.status(400).json({ error: 'Failed to update role' });
    }
  } catch (error) {
    logger.error(`Error updating role: ${error.message}`);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Связывание нового идентификатора с аккаунтом
router.post('/link-identity', requireAuth, async (req, res) => {
  try {
    const { identityType, identityValue } = req.body;
    
    if (!identityType || !identityValue) {
      return res.status(400).json({ error: 'Отсутствуют обязательные поля' });
    }
    
    // Проверяем, не привязан ли уже этот идентификатор к другому пользователю
    const existingUserId = await authService.getUserIdByIdentity(identityType, identityValue);
    
    if (existingUserId && existingUserId !== req.user.id) {
      return res.status(400).json({ error: 'Этот идентификатор уже привязан к другому аккаунту' });
    }
    
    // Добавляем новый идентификатор
    if (!existingUserId) {
      await db.query(
        'INSERT INTO user_identities (user_id, identity_type, identity_value, created_at) VALUES ($1, $2, $3, NOW())',
        [req.user.id, identityType, identityValue]
      );
    }
    
    // Если добавлен кошелек, проверяем токены
    if (identityType === 'wallet') {
      await authService.checkTokensAndUpdateRole(identityValue);
    }
    
    // Получаем все идентификаторы пользователя
    const identities = await authService.getAllUserIdentities(req.user.id);
    
    // Получаем текущую роль
    const isAdmin = await authService.isAdmin(req.user.id);
    
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

module.exports = router;
