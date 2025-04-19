const TelegramBot = require('node-telegram-bot-api');
const { pool } = require('../db');
const { processMessage } = require('./ai-assistant');

// Инициализация бота
const token = process.env.TELEGRAM_BOT_TOKEN;
let bot = null;

if (token) {
  bot = new TelegramBot(token, { polling: true });
  console.log('Telegram bot initialized');
} else {
  console.warn('TELEGRAM_BOT_TOKEN not set, Telegram integration disabled');
}

/**
 * Инициализация Telegram бота
 */
function initTelegramBot() {
  if (!bot) return;

  // Обработка команды /start
  bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const username =
      msg.from.username || `${msg.from.first_name} ${msg.from.last_name || ''}`.trim();

    try {
      // Проверка существования пользователя
      const user = await findOrCreateUser(userId, username, chatId);

      // Приветственное сообщение
      bot.sendMessage(chatId, `Привет, ${username}! Я ИИ-ассистент. Чем могу помочь?`);
    } catch (error) {
      console.error('Error handling /start command:', error);
      bot.sendMessage(
        chatId,
        'Произошла ошибка при обработке команды. Пожалуйста, попробуйте позже.'
      );
    }
  });

  // Обработка текстовых сообщений
  bot.on('message', async (msg) => {
    if (!msg.text || msg.text.startsWith('/')) return;

    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const username =
      msg.from.username || `${msg.from.first_name} ${msg.from.last_name || ''}`.trim();

    try {
      // Проверка существования пользователя
      const user = await findOrCreateUser(userId, username, chatId);

      // Получение или создание диалога
      const conversation = await getOrCreateConversation(user.id);

      // Сохранение сообщения пользователя
      await saveMessage(conversation.id, 'user', user.id, msg.text, 'telegram');

      // Обработка сообщения ИИ-ассистентом
      const aiResponse = await processMessage(user.id, msg.text, user.language || 'ru');

      // Сохранение ответа ИИ
      await saveMessage(conversation.id, 'ai', null, aiResponse, 'telegram');

      // Отправка ответа
      bot.sendMessage(chatId, aiResponse);
    } catch (error) {
      console.error('Error processing message:', error);
      bot.sendMessage(
        chatId,
        'Произошла ошибка при обработке сообщения. Пожалуйста, попробуйте позже.'
      );
    }
  });

  console.log('Telegram bot handlers registered');
}

/**
 * Поиск или создание пользователя по Telegram ID
 * @param {number} telegramId - Telegram ID пользователя
 * @param {string} username - Имя пользователя
 * @param {number} chatId - ID чата
 * @returns {Promise<Object>} - Информация о пользователе
 */
async function findOrCreateUser(telegramId, username, chatId) {
  try {
    // Поиск пользователя по Telegram ID
    const userIdResult = await pool.query(
      `SELECT user_id FROM user_identities 
       WHERE identity_type = 'telegram' AND identity_value = $1`,
      [telegramId.toString()]
    );

    if (userIdResult.rows.length > 0) {
      // Пользователь найден
      const userId = userIdResult.rows[0].user_id;

      // Получение информации о пользователе
      const userResult = await pool.query('SELECT * FROM users WHERE id = $1', [userId]);

      return userResult.rows[0];
    } else {
      // Создание нового пользователя
      const userResult = await pool.query(
        `INSERT INTO users (
          username, 
          role_id, 
          is_admin, 
          language, 
          address
        ) VALUES (
          $1, 
          (SELECT id FROM roles WHERE name = 'user'), 
          FALSE, 
          'ru', 
          '0x' || encode(gen_random_bytes(20), 'hex')
        ) RETURNING *`,
        [username]
      );

      const newUser = userResult.rows[0];

      // Добавление идентификатора Telegram
      await pool.query(
        `INSERT INTO user_identities (
          user_id, 
          identity_type, 
          identity_value, 
          verified
        ) VALUES ($1, 'telegram', $2, TRUE)`,
        [newUser.id, telegramId.toString()]
      );

      // Сохранение метаданных Telegram
      await pool.query(
        `INSERT INTO user_preferences (
          user_id, 
          preference_key, 
          preference_value
        ) VALUES ($1, 'telegram_chat_id', $2)`,
        [newUser.id, chatId.toString()]
      );

      return newUser;
    }
  } catch (error) {
    console.error('Error finding or creating user:', error);
    throw error;
  }
}

/**
 * Получение или создание диалога для пользователя
 * @param {number} userId - ID пользователя
 * @returns {Promise<Object>} - Информация о диалоге
 */
async function getOrCreateConversation(userId) {
  try {
    // Поиск активного диалога
    const conversationResult = await pool.query(
      `SELECT * FROM conversations 
       WHERE user_id = $1 
       ORDER BY updated_at DESC 
       LIMIT 1`,
      [userId]
    );

    if (conversationResult.rows.length > 0) {
      // Обновление времени последней активности
      await pool.query('UPDATE conversations SET updated_at = NOW() WHERE id = $1', [
        conversationResult.rows[0].id,
      ]);

      return conversationResult.rows[0];
    } else {
      // Создание нового диалога
      const newConversationResult = await pool.query(
        `INSERT INTO conversations (user_id, title) 
         VALUES ($1, $2) 
         RETURNING *`,
        [userId, 'Диалог в Telegram']
      );

      return newConversationResult.rows[0];
    }
  } catch (error) {
    console.error('Error getting or creating conversation:', error);
    throw error;
  }
}

/**
 * Сохранение сообщения
 * @param {number} conversationId - ID диалога
 * @param {string} senderType - Тип отправителя ('user', 'ai')
 * @param {number|null} senderId - ID отправителя
 * @param {string} content - Текст сообщения
 * @param {string} channel - Канал ('telegram')
 * @returns {Promise<Object>} - Информация о сообщении
 */
async function saveMessage(conversationId, senderType, senderId, content, channel) {
  try {
    const messageResult = await pool.query(
      `INSERT INTO messages (
        conversation_id, 
        sender_type, 
        sender_id, 
        content, 
        channel
      ) VALUES ($1, $2, $3, $4, $5) 
      RETURNING *`,
      [conversationId, senderType, senderId, content, channel]
    );

    return messageResult.rows[0];
  } catch (error) {
    console.error('Error saving message:', error);
    throw error;
  }
}

/**
 * Отправка сообщения пользователю через Telegram
 * @param {number} userId - ID пользователя
 * @param {string} message - Текст сообщения
 * @returns {Promise<boolean>} - Успешность отправки
 */
async function sendMessageToUser(userId, message) {
  if (!bot) return false;

  try {
    // Получение Telegram chat ID пользователя
    const chatIdResult = await pool.query(
      `SELECT preference_value FROM user_preferences 
       WHERE user_id = $1 AND preference_key = 'telegram_chat_id'`,
      [userId]
    );

    if (chatIdResult.rows.length === 0) {
      return false;
    }

    const chatId = chatIdResult.rows[0].preference_value;

    // Отправка сообщения
    await bot.sendMessage(chatId, message);
    return true;
  } catch (error) {
    console.error('Error sending message to user:', error);
    return false;
  }
}

module.exports = {
  initTelegramBot,
  sendMessageToUser,
};
