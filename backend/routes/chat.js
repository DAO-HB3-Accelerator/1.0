const express = require('express');
const router = express.Router();
const { ChatOllama } = require('@langchain/ollama');
const { getVectorStore } = require('../services/vectorStore');
const db = require('../db');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const logger = require('../utils/logger');

// Обработчик сообщений чата
router.post('/message', requireAuth, async (req, res) => {
  console.log('Сессия в /api/chat/message:', req.session);
  console.log('Аутентифицирован:', req.session.authenticated);
  
  try {
    const { message, language = 'ru' } = req.body;
    
    console.log(`Получено сообщение: ${message}, язык: ${language}`);

    // Определяем язык сообщения, если не указан явно
    let detectedLanguage = language;
    if (!language || language === 'auto') {
      // Простая эвристика для определения языка
      const cyrillicPattern = /[а-яА-ЯёЁ]/;
      detectedLanguage = cyrillicPattern.test(message) ? 'ru' : 'en';
    }

    // Формируем системный промпт в зависимости от языка
    let systemPrompt = '';
    if (detectedLanguage === 'ru') {
      systemPrompt = 'Вы - полезный ассистент. Отвечайте на русском языке.';
    } else {
      systemPrompt = 'You are a helpful assistant. Respond in English.';
    }

    // Отправляем запрос к Ollama с указанием языка
    console.log(`Отправка запроса к Ollama (модель: ${process.env.OLLAMA_MODEL || 'mistral'}, язык: ${detectedLanguage}): ${message}`);
    
    // Проверяем доступность Ollama
    console.log('Проверка доступности Ollama...');
    try {
      const response = await fetch(`${process.env.OLLAMA_BASE_URL || 'http://localhost:11434'}/api/tags`);
      const data = await response.json();
      console.log('Ollama доступен. Доступные модели:');
      data.models.forEach(model => {
        console.log(`- ${model.name}`);
      });
    } catch (error) {
      console.error('Ошибка при проверке доступности Ollama:', error);
      return res.status(500).json({ error: 'Сервис Ollama недоступен' });
    }

    // Создаем экземпляр ChatOllama
    const chat = new ChatOllama({
      baseUrl: process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
      model: process.env.OLLAMA_MODEL || 'mistral',
      system: systemPrompt
    });

    console.log('Отправка запроса к Ollama...');
    
    // Получаем ответ от модели
    let aiResponse;
    try {
      const response = await chat.invoke(message);
      aiResponse = response.content;
      console.log('Ответ AI:', aiResponse);
    } catch (error) {
      console.error('Ошибка при вызове ChatOllama:', error);
      
      // Альтернативный метод запроса через прямой API
      try {
        console.log('Пробуем альтернативный метод запроса...');
        const response = await fetch(`${process.env.OLLAMA_BASE_URL || 'http://localhost:11434'}/api/generate`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: process.env.OLLAMA_MODEL || 'mistral',
            prompt: message,
            system: systemPrompt,
            stream: false
          }),
        });
        
        const data = await response.json();
        aiResponse = data.response;
        console.log('Ответ AI (альтернативный метод):', aiResponse);
      } catch (fallbackError) {
        console.error('Ошибка при использовании альтернативного метода:', fallbackError);
        throw error; // Выбрасываем исходную ошибку
      }
    }

    // Отправляем ответ клиенту
    res.json({
      reply: aiResponse,
      language: detectedLanguage
    });
  } catch (error) {
    logger.error('Error processing message:', error);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

// Добавьте этот маршрут для проверки доступных моделей
router.get('/models', async (req, res) => {
  try {
    const ollama = new Ollama();
    const models = await ollama.list();

    res.json({
      success: true,
      models: models.models.map((model) => model.name),
    });
  } catch (error) {
    console.error('Ошибка при получении списка моделей:', error);
    res.status(500).json({ success: false, message: 'Ошибка сервера' });
  }
});

// Маршрут для получения истории диалогов (доступен пользователю для своих диалогов)
router.get('/history', requireAuth, async (req, res) => {
  try {
    const userId = req.session.userId;
    const { limit = 50, offset = 0 } = req.query;
    
    const result = await db.query(`
      SELECT id, channel, sender_type, content, metadata, created_at
      FROM chat_history
      WHERE user_id = $1
      ORDER BY created_at DESC
      LIMIT $2 OFFSET $3
    `, [userId, limit, offset]);
    
    res.json(result.rows);
  } catch (error) {
    logger.error('Error fetching chat history:', error);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

// Маршрут для получения всех диалогов (только для админов)
router.get('/admin/history', requireAdmin, async (req, res) => {
  try {
    const { limit = 50, offset = 0, userId } = req.query;
    
    let query = `
      SELECT ch.id, ch.user_id, u.username, ch.channel, 
             ch.sender_type, ch.content, ch.metadata, ch.created_at
      FROM chat_history ch
      LEFT JOIN users u ON ch.user_id = u.id
    `;
    
    const params = [];
    let paramIndex = 1;
    
    if (userId) {
      query += ` WHERE ch.user_id = $${paramIndex}`;
      params.push(userId);
      paramIndex++;
    }
    
    query += ` ORDER BY ch.created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(limit, offset);
    
    const result = await db.query(query, params);
    
    res.json(result.rows);
  } catch (error) {
    logger.error('Error fetching admin chat history:', error);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

module.exports = router;
