const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const authService = require('../services/auth-service');
const logger = require('../utils/logger');
const db = require('../db');

// Получение всех идентификаторов пользователя
router.get('/', requireAuth, async (req, res) => {
  try {
    const userId = req.session.userId;
    const identities = await authService.getUserIdentities(userId);
    res.json({ success: true, identities });
  } catch (error) {
    logger.error('Error getting identities:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Связывание нового идентификатора
router.post('/link', requireAuth, async (req, res) => {
  try {
    const { type, value } = req.body;
    const userId = req.session.userId;

    // Если тип - wallet, сначала проверим, не привязан ли он уже к другому пользователю
    if (type === 'wallet') {
      const normalizedWallet = value.toLowerCase();
      
      // Проверяем, существует ли уже такой кошелек
      const existingCheck = await db.query(
        `SELECT user_id FROM user_identities 
         WHERE provider = 'wallet' AND provider_id = $1`,
        [normalizedWallet]
      );
      
      if (existingCheck.rows.length > 0) {
        const existingUserId = existingCheck.rows[0].user_id;
        if (existingUserId !== userId) {
          return res.status(400).json({
            success: false,
            error: `This wallet (${value}) is already linked to another account`
          });
        }
      }
    }

    const result = await authService.linkIdentity(userId, type, value);

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
      isAdmin: req.session.isAdmin
    });
  } catch (error) {
    logger.error('Error linking identity:', error);
    
    // Делаем более понятные сообщения об ошибках
    if (error.message && error.message.includes('already belongs to another user')) {
      return res.status(400).json({ 
        success: false,
        error: `This identity is already linked to another account` 
      });
    }
    
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

// Получение балансов токенов
router.get('/token-balances', requireAuth, async (req, res) => {
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
      balances
    });
  } catch (error) {
    logger.error('Error getting token balances:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
