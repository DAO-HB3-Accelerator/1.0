const express = require('express');
const router = express.Router();
const { requireRole } = require('../middleware/auth');

// Получение информации о контрактах
router.get('/', (req, res) => {
  res.json({
    message: 'Contracts API endpoint',
    contracts: [
      {
        name: 'AccessToken',
        address: process.env.ACCESS_TOKEN_ADDRESS,
      },
    ],
  });
});

// Защищенный эндпоинт для получения детальной информации о контрактах
router.get('/details', requireRole('ADMIN'), (req, res) => {
  res.json({
    message: 'Contract details endpoint',
    contracts: [
      {
        name: 'AccessToken',
        address: process.env.ACCESS_TOKEN_ADDRESS,
        network: process.env.ETHEREUM_NETWORK_URL.includes('sepolia') ? 'Sepolia' : 'Unknown',
      },
    ],
  });
});

module.exports = router;
