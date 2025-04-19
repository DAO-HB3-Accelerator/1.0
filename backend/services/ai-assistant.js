const { ChatOllama } = require('@langchain/ollama');
const { pool } = require('../db');

// Инициализация модели Ollama
const model = new ChatOllama({
  baseUrl: process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
  model: process.env.OLLAMA_MODEL || 'llama2',
});

/**
 * Обработка сообщения пользователя и получение ответа от ИИ
 * @param {number} userId - ID пользователя
 * @param {string} message - Текст сообщения
 * @param {string} language - Язык пользователя
 * @returns {Promise<string>} - Ответ ИИ
 */
async function processMessage(userId, message, language = 'ru') {
  try {
    // Получение информации о пользователе
    const userInfo = await getUserInfo(userId);

    // Получение истории диалога (последние 10 сообщений)
    const history = await getConversationHistory(userId);

    // Формирование контекста для ИИ
    const context = `
Пользователь: ${userInfo.username || 'Пользователь'} (ID: ${userId})
Язык: ${language}
Роль: ${userInfo.is_admin ? 'Администратор' : 'Пользователь'}
История диалога:
${history}

Текущее сообщение: ${message}
`;

    // Временная заглушка для ответа ИИ
    // В будущем здесь будет интеграция с реальной моделью ИИ
    const responses = {
      ru: [
        'Спасибо за ваше сообщение! Чем я могу помочь?',
        'Я понимаю ваш запрос. Давайте разберемся с этим вопросом.',
        'Интересный вопрос! Вот что я могу предложить...',
        'Я обработал вашу информацию. Есть ли у вас дополнительные вопросы?',
        'Я готов помочь вам с этим запросом. Нужны ли дополнительные детали?',
      ],
      en: [
        'Thank you for your message! How can I help you?',
        "I understand your request. Let's figure this out.",
        "Interesting question! Here's what I can suggest...",
        "I've processed your information. Do you have any additional questions?",
        "I'm ready to help you with this request. Do you need any additional details?",
      ],
    };

    const langResponses = responses[language] || responses['ru'];
    const randomIndex = Math.floor(Math.random() * langResponses.length);

    // Имитация задержки ответа ИИ
    await new Promise((resolve) => setTimeout(resolve, 500));

    return langResponses[randomIndex];
  } catch (error) {
    console.error('Error processing message:', error);
    return 'Извините, произошла ошибка при обработке вашего сообщения. Пожалуйста, попробуйте еще раз позже.';
  }
}

/**
 * Получение информации о пользователе
 * @param {number} userId - ID пользователя
 * @returns {Promise<Object>} - Информация о пользователе
 */
async function getUserInfo(userId) {
  try {
    const userResult = await pool.query(
      `SELECT u.id, u.username, u.address, u.is_admin, u.language, r.name as role
       FROM users u
       JOIN roles r ON u.role_id = r.id
       WHERE u.id = $1`,
      [userId]
    );

    if (userResult.rows.length === 0) {
      return { id: userId };
    }

    // Получение идентификаторов пользователя
    const identitiesResult = await pool.query(
      `SELECT identity_type, identity_value, verified
       FROM user_identities
       WHERE user_id = $1`,
      [userId]
    );

    const user = userResult.rows[0];
    user.identities = identitiesResult.rows;

    return user;
  } catch (error) {
    console.error('Error getting user info:', error);
    return { id: userId };
  }
}

/**
 * Получение истории диалога
 * @param {number} userId - ID пользователя
 * @param {number} limit - Максимальное количество сообщений
 * @returns {Promise<string>} - История диалога в текстовом формате
 */
async function getConversationHistory(userId, limit = 10) {
  try {
    // Получение последнего активного диалога пользователя
    const conversationResult = await pool.query(
      `SELECT id FROM conversations
       WHERE user_id = $1
       ORDER BY updated_at DESC
       LIMIT 1`,
      [userId]
    );

    if (conversationResult.rows.length === 0) {
      return '';
    }

    const conversationId = conversationResult.rows[0].id;

    // Получение последних сообщений из диалога
    const messagesResult = await pool.query(
      `SELECT sender_type, content, created_at
       FROM messages
       WHERE conversation_id = $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [conversationId, limit]
    );

    // Формирование истории в текстовом формате
    const history = messagesResult.rows
      .reverse()
      .map((msg) => {
        const sender = msg.sender_type === 'user' ? 'Пользователь' : 'ИИ';
        return `${sender}: ${msg.content}`;
      })
      .join('\n\n');

    return history;
  } catch (error) {
    console.error('Error getting conversation history:', error);
    return '';
  }
}

module.exports = {
  processMessage,
  getUserInfo,
  getConversationHistory,
};
