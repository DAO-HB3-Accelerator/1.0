const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const authService = require('../services/auth-service');
const logger = require('../utils/logger');

// Получение балансов токенов
router.get('/balances', requireAuth, async (req, res) => {
  try {
    const { address } = req.session;
    
    if (!address) {
      return res.status(400).json({ 
        error: 'No wallet address in session' 
      });
    }

    logger.info(`Fetching token balances for address: ${address}`);
    const balances = await authService.getTokenBalances(address);
    
    res.json(balances);
  } catch (error) {
    logger.error('Error fetching token balances:', error);
    res.status(500).json({ 
      error: 'Failed to fetch token balances' 
    });
  }
});

module.exports = router; 