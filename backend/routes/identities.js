const express = require('express');
const router = express.Router();
const { linkIdentity, getUserIdentities } = require('../utils/identity-linker');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

// Получение связанных идентификаторов пользователя
router.get('/', requireAuth, async (req, res) => {
  try {
    // Получаем ID пользователя по Ethereum-адресу
    const result = await db.query('SELECT id FROM users WHERE address = $1', [
      req.session.address,
    ]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const userId = result.rows[0].id;

    // Получаем все идентификаторы пользователя
    const identities = await getUserIdentities(userId);

    res.json({ identities });
  } catch (error) {
    console.error('Error getting user identities:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Удаление связанного идентификатора
router.delete('/:type/:value', requireAuth, async (req, res) => {
  try {
    const { type, value } = req.params;

    // Получаем ID пользователя по Ethereum-адресу
    const result = await db.query('SELECT id FROM users WHERE address = $1', [
      req.session.address,
    ]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const userId = result.rows[0].id;

    // Удаляем идентификатор
    await db.query(
      'DELETE FROM user_identities WHERE user_id = $1 AND identity_type = $2 AND identity_value = $3',
      [userId, type, value]
    );

    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting user identity:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
