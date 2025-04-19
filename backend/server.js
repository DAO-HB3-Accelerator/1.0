require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { ethers } = require('ethers');
const emailBot = require('./services/emailBot');
const session = require('express-session');
const { app, nonceStore } = require('./app');
const usersRouter = require('./routes/users');
const authRouter = require('./routes/auth');
const identitiesRouter = require('./routes/identities');
const chatRouter = require('./routes/chat');
const { pool } = require('./db');
const helmet = require('helmet');
const { getBot, stopBot } = require('./services/telegramBot');
const pgSession = require('connect-pg-simple')(session);
const authService = require('./services/auth-service');
const logger = require('./utils/logger');

const PORT = process.env.PORT || 8000;

console.log('Начало выполнения server.js');
console.log('Переменная окружения PORT:', process.env.PORT);
console.log('Используемый порт:', process.env.PORT || 8000);

// Инициализация сервисов
async function initServices() {
  try {
    console.log('Инициализация сервисов...');
    
    // Останавливаем предыдущий экземпляр бота
    await stopBot();
    
    // Добавляем обработку ошибок при запуске бота
    try {
      await getBot(); // getBot теперь асинхронный и сам запускает бота
      console.log('Telegram bot started');
      
      // Добавляем graceful shutdown
      process.once('SIGINT', async () => {
        await stopBot();
        process.exit(0);
      });
      process.once('SIGTERM', async () => {
        await stopBot();
        process.exit(0);
      });
    } catch (error) {
      if (error.code === 409) {
        logger.warn('Another instance of Telegram bot is running. This is normal during development with nodemon');
        // Просто логируем ошибку и продолжаем работу
        // Бот будет запущен при следующем перезапуске
      } else {
        logger.error('Error launching Telegram bot:', error);
      }
    }
    
    console.log('Все сервисы успешно инициализированы');
  } catch (error) {
    console.error('Ошибка при инициализации сервисов:', error);
  }
}

// Настройка сессий
app.use(session({
  store: new pgSession({
    pool: pool,
    tableName: 'session'
  }),
  secret: process.env.SESSION_SECRET || 'hb3atoken',
  resave: false,
  saveUninitialized: true,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 30 * 24 * 60 * 60 * 1000 // 30 дней
  }
}));

// Маршруты API
app.use('/api/users', usersRouter);
app.use('/api/auth', authRouter);
app.use('/api/identities', identitiesRouter);
app.use('/api/chat', chatRouter);

// Эндпоинт для проверки состояния сервера
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Запуск сервера
const host = app.get('host');
app.listen(PORT, host, async () => {
  try {
    await initServices();
    console.log(`Server is running on http://${host}:${PORT}`);
  } catch (error) {
    console.error('Error starting server:', error);
    process.exit(1);
  }
});

// Обработка ошибок
process.on('unhandledRejection', (err) => {
  logger.error('Unhandled Rejection:', err);
});

process.on('uncaughtException', (err) => {
  logger.error('Uncaught Exception:', err);
});

module.exports = app;
