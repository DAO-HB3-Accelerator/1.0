const express = require('express');
const router = express.Router();
const aiAssistant = require('../services/ai-assistant');
const db = require('../db');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const logger = require('../utils/logger');
const crypto = require('crypto');
const { saveGuestMessageToDatabase } = require('../db');
const { v4: uuidv4 } = require('uuid');

// Функция для обработки гостевых сообщений после аутентификации
async function processGuestMessages(userId, guestId) {
  try {
    console.log(`Processing guest messages for user ${userId} with guest ID ${guestId}`);
    
    // Проверяем, обрабатывались ли уже эти сообщения
    const mappingCheck = await db.query(
      'SELECT processed FROM guest_user_mapping WHERE guest_id = $1',
      [guestId]
    );
    
    // Если сообщения уже обработаны, пропускаем
    if (mappingCheck.rows.length > 0 && mappingCheck.rows[0].processed) {
      console.log(`Guest messages for guest ID ${guestId} were already processed.`);
      return { success: true, message: 'Guest messages already processed' };
    }
    
    // Проверяем наличие mapping записи и создаем если нет
    if (mappingCheck.rows.length === 0) {
      await db.query(
        'INSERT INTO guest_user_mapping (user_id, guest_id) VALUES ($1, $2) ON CONFLICT (guest_id) DO UPDATE SET user_id = $1',
        [userId, guestId]
      );
      console.log(`Created mapping for guest ID ${guestId} to user ${userId}`);
    }
    
    // Получаем все гостевые сообщения
    const guestMessagesResult = await db.query(
      'SELECT * FROM guest_messages WHERE guest_id = $1 ORDER BY created_at ASC',
      [guestId]
    );
    
    if (guestMessagesResult.rows.length === 0) {
      console.log('No guest messages found');
      
      // Помечаем как обработанные, даже если сообщений нет
      await db.query(
        'UPDATE guest_user_mapping SET processed = true WHERE guest_id = $1',
        [guestId]
      );
      
      return { success: true, message: 'No guest messages found' };
    }
    
    const guestMessages = guestMessagesResult.rows;
    console.log(`Found ${guestMessages.length} guest messages`);
    
    // Создаем новый диалог для этих сообщений
    const firstMessage = guestMessages[0];
    const title = firstMessage.content.length > 30 
      ? `${firstMessage.content.substring(0, 30)}...` 
      : firstMessage.content;
    
    const newConversationResult = await db.query(
      'INSERT INTO conversations (user_id, title) VALUES ($1, $2) RETURNING *',
      [userId, title]
    );
    
    const conversation = newConversationResult.rows[0];
    console.log('Created new conversation for guest messages:', conversation);
    
    // Отслеживаем успешные сохранения сообщений
    const savedMessageIds = [];
    
    // Обрабатываем каждое гостевое сообщение
    for (const guestMessage of guestMessages) {
      console.log(`Processing guest message ID ${guestMessage.id}: ${guestMessage.content}`);
      
      try {
        // Сохраняем сообщение пользователя
        const userMessageResult = await db.query(
          `INSERT INTO messages 
            (conversation_id, content, sender_type, role, channel, created_at, user_id) 
           VALUES 
            ($1, $2, $3, $4, $5, $6, $7) 
           RETURNING *`,
          [
            conversation.id, 
            guestMessage.content, 
            'user', 
            'user', 
            'web',
            guestMessage.created_at,
            userId // Добавляем userId в сообщение для прямой связи
          ]
        );
        
        console.log(`Saved user message with ID ${userMessageResult.rows[0].id}`);
        savedMessageIds.push(guestMessage.id);
        
        // Получаем ответ от ИИ только для сообщений пользователя (не AI)
        if (!guestMessage.is_ai) {
          console.log('Getting AI response for:', guestMessage.content);
          const language = guestMessage.language || 'auto';
          const aiResponse = await aiAssistant.getResponse(guestMessage.content, language);
          console.log('AI response received:', aiResponse);
          
          // Сохраняем ответ от ИИ
          const aiMessageResult = await db.query(
            `INSERT INTO messages 
              (conversation_id, content, sender_type, role, channel, created_at, user_id) 
             VALUES 
              ($1, $2, $3, $4, $5, $6, $7) 
             RETURNING *`,
            [
              conversation.id, 
              aiResponse, 
              'assistant', 
              'assistant', 
              'web',
              new Date(),
              userId // Добавляем userId в сообщение для прямой связи
            ]
          );
          
          console.log(`Saved AI response with ID ${aiMessageResult.rows[0].id}`);
        }
      } catch (error) {
        console.error(`Error processing guest message ${guestMessage.id}:`, error);
        // Продолжаем с другими сообщениями в случае ошибки
      }
    }
    
    // Удаляем только успешно обработанные гостевые сообщения
    if (savedMessageIds.length > 0) {
      await db.query('DELETE FROM guest_messages WHERE id = ANY($1)', [savedMessageIds]);
      console.log(`Deleted ${savedMessageIds.length} processed guest messages for guest ID ${guestId}`);
      
      // Помечаем гостевой ID как обработанный
      await db.query(
        'UPDATE guest_user_mapping SET processed = true WHERE guest_id = $1',
        [guestId]
      );
    } else {
      console.log('No guest messages were successfully processed, skipping deletion');
    }
    
    return { 
      success: true, 
      message: `Processed ${savedMessageIds.length} of ${guestMessages.length} guest messages`,
      conversationId: conversation.id
    };
  } catch (error) {
    console.error('Error processing guest messages:', error);
    throw error;
  }
}

// Обработчик для гостевых сообщений
router.post('/guest-message', async (req, res) => {
  try {
    const { content, language, guestId: requestGuestId } = req.body;
    
    if (!content) {
      return res.status(400).json({ success: false, error: 'Content is required' });
    }
    
    // Используем гостевой ID из запроса или из сессии, или генерируем новый
    const guestId = requestGuestId || req.session.guestId || crypto.randomBytes(16).toString('hex');

    // Сохраняем ID гостя в сессии
    req.session.guestId = guestId;
    await req.session.save();

    console.log('Saving guest message:', { guestId, content });

    // Сохраняем сообщение пользователя
    const result = await db.query(
      'INSERT INTO guest_messages (guest_id, content, language, is_ai) VALUES ($1, $2, $3, false) RETURNING id',
      [guestId, content, language || 'auto']
    );

    console.log('Guest message saved:', result.rows[0]);

    res.json({ 
      success: true, 
      messageId: result.rows[0].id
    });
  } catch (error) {
    console.error('Error saving guest message:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// Маршрут для обычных сообщений (для аутентифицированных пользователей)
router.post('/message', requireAuth, async (req, res) => {
  const { message, conversationId, language = 'auto' } = req.body;
  
  if (!message) {
    return res.status(400).json({ error: 'Message is required' });
  }

  try {
    console.log('Processing message:', { message, conversationId, language, userId: req.session.userId });
    const userId = req.session.userId;
    
    let conversation;
    
    // Если указан ID диалога, проверяем его существование и принадлежность пользователю
    if (conversationId) {
      const conversationResult = await db.query(
        'SELECT * FROM conversations WHERE id = $1 AND user_id = $2',
        [conversationId, userId]
      );
      
      if (conversationResult.rows.length === 0) {
        return res.status(404).json({ error: 'Conversation not found or access denied' });
      }
      
      conversation = conversationResult.rows[0];
      console.log('Using existing conversation:', conversation);
    } else {
      // Создаем новый диалог
      const title = message.length > 30 ? `${message.substring(0, 30)}...` : message;
      
      const newConversationResult = await db.query(
        'INSERT INTO conversations (user_id, title) VALUES ($1, $2) RETURNING *',
        [userId, title]
      );
      
      conversation = newConversationResult.rows[0];
      console.log('Created new conversation:', conversation);
    }
    
    // Сохраняем сообщение пользователя
    console.log('Saving user message');
    const userMessageResult = await db.query(
      `INSERT INTO messages 
        (conversation_id, content, sender_type, role, tokens_used, channel, created_at) 
       VALUES 
        ($1, $2, $3, $4, $5, $6, $7) 
       RETURNING *`,
      [conversation.id, message, 'user', 'user', 0, 'web', new Date()]
    );
    
    // Получаем ответ от ИИ
    console.log('Getting AI response');
    const aiResponse = await aiAssistant.getResponse(message, language);
    console.log('AI response received:', aiResponse);
    
    // Сохраняем ответ от ИИ
    console.log('Saving AI response');
    const aiMessageResult = await db.query(
      `INSERT INTO messages 
        (conversation_id, content, sender_type, role, tokens_used, channel, created_at) 
       VALUES 
        ($1, $2, $3, $4, $5, $6, $7) 
       RETURNING *`,
      [conversation.id, aiResponse, 'assistant', 'assistant', 0, 'web', new Date()]
    );
    
    const response = {
      success: true,
      userMessage: userMessageResult.rows[0],
      aiMessage: aiMessageResult.rows[0],
      conversation
    };
    
    res.json(response);
  } catch (error) {
    console.error('Error processing message:', error);
    res.status(500).json({ error: 'Error processing message' });
  }
});

// Добавьте этот маршрут для проверки доступных моделей
router.get('/models', async (req, res) => {
  try {
    const models = await aiAssistant.getAvailableModels();

    res.json({
      success: true,
      models: models,
    });
  } catch (error) {
    console.error('Ошибка при получении списка моделей:', error);
    res.status(500).json({ success: false, message: 'Ошибка сервера' });
  }
});

// Получение истории сообщений
router.get('/history', async (req, res) => {
  try {
    console.log('Session in history route:', {
      id: req.sessionID,
      userId: req.session.userId,
      address: req.session.address,
      authenticated: req.session.authenticated,
      guestId: req.session.guestId
    });
    
    const limit = parseInt(req.query.limit) || 50;
    const offset = parseInt(req.query.offset) || 0;

    // Если пользователь аутентифицирован и у него есть гостевые сообщения,
    // автоматически связываем их перед получением истории
    if (req.session.authenticated && req.session.userId && req.session.guestId) {
      try {
        console.log('Automatically linking guest messages before fetching history');
        await processGuestMessages(req.session.userId, req.session.guestId);
        
        // Очищаем guestId из сессии после связывания
        req.session.guestId = null;
        await req.session.save();
        
        console.log('Guest messages automatically linked');
      } catch (linkError) {
        console.error('Error auto-linking guest messages:', linkError);
        // Продолжаем выполнение, даже если связывание не удалось
      }
    }

    let messages = [];
    let total = 0;

    // Если пользователь аутентифицирован, получаем его сообщения
    if (req.session.authenticated && req.session.userId) {
      const countResult = await db.query(
        `SELECT COUNT(*) as total FROM messages m
         JOIN conversations c ON m.conversation_id = c.id
         WHERE c.user_id = $1`,
        [req.session.userId]
      );
      total = parseInt(countResult.rows[0].total) || 0;

      const result = await db.query(
        `SELECT 
           m.id, 
           m.content, 
           m.sender_type,
           m.role,
           m.created_at,
           c.user_id,
           c.id as conversation_id
         FROM messages m
         JOIN conversations c ON m.conversation_id = c.id
         WHERE c.user_id = $1
         ORDER BY m.created_at ASC
         LIMIT $2 OFFSET $3`,
        [req.session.userId, limit, offset]
      );
      
      messages = result.rows;
      console.log(`Found ${messages.length} messages for authenticated user`);
    }
    
    return res.json({
      success: true,
      messages: messages,
      total: total
    });
    
  } catch (error) {
    logger.error('Error getting chat history:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// Экспортируем маршрутизатор и функцию processGuestMessages отдельно
module.exports = router;
module.exports.processGuestMessages = processGuestMessages;