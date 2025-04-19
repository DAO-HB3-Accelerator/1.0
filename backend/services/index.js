const { initTelegramBot } = require('./telegram-service');
const { initEmailBot, sendEmail, checkEmails } = require('./emailBot');
const {
  initializeVectorStore,
  getVectorStore,
  similaritySearch,
  addDocument,
} = require('./vectorStore');
const { processMessage, getUserInfo, getConversationHistory } = require('./ai-assistant');
// ... другие импорты

module.exports = {
  // Telegram
  initTelegramBot,

  // Email
  initEmailBot,
  sendEmail,
  checkEmails,

  // Vector Store
  initializeVectorStore,
  getVectorStore,
  similaritySearch,
  addDocument,

  // AI Assistant
  processMessage,
  getUserInfo,
  getConversationHistory,
  // ... другие экспорты
};
