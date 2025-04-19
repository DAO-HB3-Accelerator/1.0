const { initTelegramBot } = require('./telegram-service');
const emailBot = require('./emailBot');
const telegramBot = require('./telegramBot');
const aiAssistant = require('./ai-assistant');
const {
  initializeVectorStore,
  getVectorStore,
  similaritySearch,
  addDocument,
} = require('./vectorStore');
// ... другие импорты

module.exports = {
  // Telegram
  initTelegramBot,

  // Email
  emailBot,
  sendEmail: emailBot.sendEmail,
  checkEmails: emailBot.checkEmails,

  // Vector Store
  initializeVectorStore,
  getVectorStore,
  similaritySearch,
  addDocument,

  // AI Assistant
  processMessage: aiAssistant.processMessage,
  getUserInfo: aiAssistant.getUserInfo,
  getConversationHistory: aiAssistant.getConversationHistory,

  telegramBot,
  aiAssistant
};
