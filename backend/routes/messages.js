const express = require('express');
const router = express.Router();
const { pool } = require('../db');
const { requireAuth } = require('../middleware/auth');
const { processMessage, getUserInfo } = require('../services/ai-assistant');

// Получение списка диалогов пользователя
router.get('/conversations', requireAuth, async (req, res) => {
  try {
    const userId = req.session.userId;

    const result = await pool.query(
      `SELECT * FROM conversation_view 
       WHERE user_id = $1 
       ORDER BY updated_at DESC`,
      [userId]
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching conversations:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Получение сообщений диалога
router.get('/conversations/:id/messages', requireAuth, async (req, res) => {
  try {
    const userId = req.session.userId;
    const conversationId = req.params.id;

    // Проверка доступа к диалогу
    const conversationCheck = await pool.query(
      'SELECT id FROM conversations WHERE id = $1 AND user_id = $2',
      [conversationId, userId]
    );

    if (conversationCheck.rows.length === 0) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const result = await pool.query(
      `SELECT * FROM message_view 
       WHERE conversation_id = $1 
       ORDER BY created_at ASC`,
      [conversationId]
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching messages:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Отправка сообщения
router.post('/conversations/:id/messages', requireAuth, async (req, res) => {
  try {
    const userId = req.session.userId;
    const conversationId = req.params.id;
    const { content } = req.body;

    if (!content || content.trim() === '') {
      return res.status(400).json({ error: 'Message content is required' });
    }

    // Проверка доступа к диалогу
    const conversationCheck = await pool.query(
      'SELECT id FROM conversations WHERE id = $1 AND user_id = $2',
      [conversationId, userId]
    );

    if (conversationCheck.rows.length === 0) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Обновление времени последней активности диалога
    await pool.query('UPDATE conversations SET updated_at = NOW() WHERE id = $1', [conversationId]);

    // Сохранение сообщения пользователя
    const userMessageResult = await pool.query(
      `INSERT INTO messages 
       (conversation_id, sender_type, sender_id, content, channel) 
       VALUES ($1, 'user', $2, $3, 'web') 
       RETURNING *`,
      [conversationId, userId, content]
    );

    // Получение информации о пользователе для ИИ
    const userInfo = await getUserInfo(userId);

    // Обработка сообщения ИИ-ассистентом
    const aiResponse = await processMessage(userId, content, userInfo.language || 'ru');

    // Сохранение ответа ИИ
    const aiMessageResult = await pool.query(
      `INSERT INTO messages 
       (conversation_id, sender_type, content, channel) 
       VALUES ($1, 'ai', $2, 'web') 
       RETURNING *`,
      [conversationId, aiResponse]
    );

    res.json({
      userMessage: userMessageResult.rows[0],
      aiMessage: aiMessageResult.rows[0],
    });
  } catch (error) {
    console.error('Error sending message:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Создание нового диалога
router.post('/conversations', requireAuth, async (req, res) => {
  try {
    const userId = req.session.userId;
    const { title } = req.body;

    // Создание нового диалога
    const result = await pool.query(
      `INSERT INTO conversations (user_id, title) 
       VALUES ($1, $2) 
       RETURNING *`,
      [userId, title || 'Новый диалог']
    );

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error creating conversation:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Обновление заголовка диалога
router.put('/conversations/:id', requireAuth, async (req, res) => {
  try {
    const userId = req.session.userId;
    const conversationId = req.params.id;
    const { title } = req.body;

    if (!title || title.trim() === '') {
      return res.status(400).json({ error: 'Title is required' });
    }

    // Проверка доступа к диалогу
    const conversationCheck = await pool.query(
      'SELECT id FROM conversations WHERE id = $1 AND user_id = $2',
      [conversationId, userId]
    );

    if (conversationCheck.rows.length === 0) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Обновление заголовка
    const result = await pool.query(
      'UPDATE conversations SET title = $1 WHERE id = $2 RETURNING *',
      [title, conversationId]
    );

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating conversation:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Удаление диалога
router.delete('/conversations/:id', requireAuth, async (req, res) => {
  try {
    const userId = req.session.userId;
    const conversationId = req.params.id;

    // Проверка доступа к диалогу
    const conversationCheck = await pool.query(
      'SELECT id FROM conversations WHERE id = $1 AND user_id = $2',
      [conversationId, userId]
    );

    if (conversationCheck.rows.length === 0) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Удаление диалога (каскадно удалит все сообщения)
    await pool.query('DELETE FROM conversations WHERE id = $1', [conversationId]);

    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting conversation:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Маршруты для администраторов

// Получение всех диалогов (только для администраторов)
router.get('/admin/conversations', requireAuth, async (req, res) => {
  try {
    // Проверка прав администратора
    if (!req.session.isAdmin) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const result = await pool.query(
      `SELECT * FROM conversation_view 
       ORDER BY updated_at DESC`
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching all conversations:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Получение статистики по каналам (только для администраторов)
router.get('/admin/stats/channels', requireAuth, async (req, res) => {
  try {
    // Проверка прав администратора
    if (!req.session.isAdmin) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const result = await pool.query(
      `SELECT 
         channel,
         COUNT(*) AS message_count,
         COUNT(DISTINCT conversation_id) AS conversation_count,
         COUNT(DISTINCT sender_id) AS user_count,
         MIN(created_at) AS first_message,
         MAX(created_at) AS last_message
       FROM 
         messages
       GROUP BY 
         channel`
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching channel stats:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
