require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { SiweMessage, generateNonce } = require('siwe');
const { ethers } = require('ethers');
// const TelegramBotService = require('./services/telegramBot');
const EmailBotService = require('./services/emailBot');
const { initializeVectorStore } = require('./services/vectorStore');
const session = require('express-session');
const { app, nonceStore } = require('./app');
const usersRouter = require('./routes/users');
const authRouter = require('./routes/auth');
const contractsRouter = require('./routes/contracts');
const accessRouter = require('./routes/access');
const path = require('path');
const axios = require('axios');
const { ChatOllama } = require('@langchain/ollama');
const { getVectorStore } = require('./services/vectorStore');
// const debugRoutes = require('./routes/debug');
const identitiesRouter = require('./routes/identities');
const { pool } = require('./db');
const fs = require('fs');
const pgSession = require('connect-pg-simple')(session);
const sessionStore = new pgSession({
  pool: pool,
  tableName: 'sessions',
  createTableIfMissing: true,
});
const helmet = require('helmet');
// const csrf = require('csurf');
// const cookieParser = require('cookie-parser');
const messagesRouter = require('./routes/messages');
const sessionMiddleware = require('./middleware/session');

// Импорт сервисов
const { initTelegramBot } = require('./services/telegram-service');

const PORT = process.env.PORT || 8000;

console.log('Начало выполнения server.js');
console.log('Переменная окружения PORT:', process.env.PORT);
console.log('Используемый порт:', process.env.PORT || 8000);

// Инициализация сервисов
let telegramBot;
let emailBot;

// Получаем ABI из артефактов
const contractArtifact = require('./artifacts/contracts/MyContract.sol/MyContract.json');
const contractABI = contractArtifact.abi;

// Добавим логирование для отладки контракта
const provider = new ethers.JsonRpcProvider(process.env.ETHEREUM_NETWORK_URL);
console.log('Provider URL:', process.env.ETHEREUM_NETWORK_URL);
console.log('Contract address:', process.env.CONTRACT_ADDRESS);

const contract = new ethers.Contract(process.env.CONTRACT_ADDRESS, contractABI, provider);

// Проверяем, что библиотека ethers.js правильно импортирована
console.log('Ethers.js version:', ethers.version);

// Порядок middleware важен!
// 1. CORS должен быть первым
app.use(
  cors({
    origin: ['http://127.0.0.1:5173', 'http://localhost:5173'],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Auth-Nonce'],
  })
);

// Добавьте после настройки CORS
app.use(helmet());

// 2. Затем парсеры
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Добавьте после настройки парсеров
app.use((req, res, next) => {
  // if (req.method === 'POST' && req.headers['content-type'] === 'application/json') {
  //   console.log('POST request body:', {
  //     url: req.url,
  //     body: JSON.stringify(req.body)
  //   });
  // }
  next();
});

const requireAuth = (req, res, next) => {
  if (!req.session.authenticated || !req.session.address) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
};

app.use('/api/protected', requireAuth);

// Добавляем middleware для проверки состояния аутентификации
app.use((req, res, next) => {
  // console.log('Auth check middleware:', {
  //   url: req.url,
  //   method: req.method,
  //   sessionID: req.sessionID,
  //   session: req.session ? {
  //     isAuthenticated: req.session.isAuthenticated,
  //     authenticated: req.session.authenticated,
  //     address: req.session.address,
  //     isAdmin: req.session.isAdmin
  //   } : null
  // });
  next();
});

// Добавьте после настройки парсеров
app.use((req, res, next) => {
  // if (req.method === 'POST' && req.headers['content-type'] === 'application/json') {
  //   console.log('POST request body:', {
  //     url: req.url,
  //     body: JSON.stringify(req.body)
  //   });
  // }
  next();
});

// Добавляем middleware для отладки сессий
app.use((req, res, next) => {
  console.log('Сессия:', req.session);
  console.log('Куки:', req.headers.cookie);
  next();
});

// Добавьте cookie-парсер перед CSRF-защитой
// app.use(cookieParser());

// Затем настройте CSRF-защиту
// const csrfProtection = csrf({
//   cookie: {
//     key: '_csrf',
//     path: '/',
//     httpOnly: true,
//     secure: process.env.NODE_ENV === 'production',
//     sameSite: 'lax'
//   }
// });

// Добавьте маршрут для получения CSRF-токена
// app.get('/api/csrf-token', csrfProtection, (req, res) => {
//   res.json({ csrfToken: req.csrfToken() });
// });

// Применяем CSRF-защиту только к определенным маршрутам
// app.use('/api/protected', csrfProtection);
// app.use('/api/admin', csrfProtection);
// app.use('/api/kanban', csrfProtection);

// Обработчик ошибок CSRF
// app.use((err, req, res, next) => {
//   if (err.code === 'EBADCSRFTOKEN') {
//     console.error('CSRF error:', {
//       url: req.url,
//       method: req.method,
//       headers: req.headers,
//       body: req.body
//     });
//     return res.status(403).json({
//       error: 'CSRF token validation failed',
//       message: 'Your session may have expired. Please refresh the page and try again.'
//     });
//   }
//   next(err);
// });

// Использовать импортированный middleware для сессий
app.use(sessionMiddleware);

async function initServices() {
  try {
    console.log('Инициализация сервисов...');

    // Инициализируем ботов, если они нужны
    if (process.env.TELEGRAM_BOT_TOKEN) {
      telegramBot = new TelegramBotService(process.env.TELEGRAM_BOT_TOKEN);
      console.log('Telegram бот инициализирован');
    }

    if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
      emailBot = new EmailBotService(process.env.EMAIL_USER, process.env.EMAIL_PASS);
      console.log('Email бот инициализирован');
    }

    console.log('Все сервисы успешно инициализированы');
  } catch (error) {
    console.error('Ошибка при инициализации сервисов:', error);
  }
}

app.use('/api/users', usersRouter);
app.use('/api/auth', authRouter);
app.use('/api/contracts', contractsRouter);
app.use('/api/access', accessRouter);
// app.use('/api/chat', chatRouter);
// app.use('/api/debug', debugRoutes);
app.use('/api/identities', identitiesRouter);
app.use('/api/messages', messagesRouter);

// Добавьте простой эндпоинт для проверки состояния сервера
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Добавьте после настройки маршрутов
app.post('/api/verify', async (req, res) => {
  try {
    // Перенаправляем запрос на /api/auth/verify
    const { message, signature } = req.body;
    console.log('Перенаправление запроса на /api/auth/verify:', { message, signature });

    // Проверяем наличие необходимых данных
    if (!message || !message.address || !signature) {
      return res.status(400).json({
        success: false,
        error: 'Отсутствуют необходимые данные для верификации',
      });
    }

    const address = message.address.toLowerCase();
    console.log('Адрес из сообщения:', address);

    // Проверяем, является ли пользователь администратором
    const isAdmin = true; // Для примера всегда true

    try {
      const siweMessage = new SiweMessage(message);
      const fields = await siweMessage.validate(signature);

      if (fields.address.toLowerCase() !== address.toLowerCase()) {
        return res.status(401).json({ success: false, error: 'Invalid signature' });
      }

      // Только после проверки устанавливаем сессию
      req.session.authenticated = true;
      req.session.address = fields.address;
      req.session.lastSignature = signature;

      // Сохраняем сессию
      await new Promise((resolve, reject) => {
        req.session.save((err) => {
          if (err) {
            console.error('Ошибка при сохранении сессии:', err);
            reject(err);
          } else {
            console.log('Сессия успешно сохранена');
            resolve();
          }
        });
      });
    } catch (error) {
      return res.status(401).json({ success: false, error: error.message });
    }

    // Сохраняем данные в сессии
    req.session.isAuthenticated = true;
    req.session.isAdmin = isAdmin;

    // Явно сохраняем сессию
    req.session.save((err) => {
      if (err) {
        console.error('Ошибка сохранения сессии:', err);
        return res.status(500).json({ error: 'Session save error' });
      }

      console.log('Сессия успешно сохранена:', {
        sessionID: req.sessionID,
        session: {
          isAuthenticated: req.session.isAuthenticated,
          authenticated: req.session.authenticated,
          address: req.session.address,
          isAdmin: req.session.isAdmin,
        },
      });

      res.cookie('authToken', 'true', {
        maxAge: 86400000,
        httpOnly: false,
        secure: false,
        sameSite: 'lax',
        path: '/',
      });

      res.json({
        success: true,
        address: address,
        isAdmin: isAdmin,
      });
    });
  } catch (error) {
    console.error('Ошибка верификации:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Внутренняя ошибка сервера',
    });
  }
});

// Добавьте после настройки маршрутов
app.get('/api/session', (req, res) => {
  console.log('Запрос сессии в server.js:', {
    sessionExists: !!req.session,
    sessionID: req.sessionID,
    isAuthenticated: req.session?.isAuthenticated,
    authenticated: req.session?.authenticated,
    address: req.session?.address,
  });

  if (req.session && (req.session.isAuthenticated || req.session.authenticated)) {
    res.json({
      isAuthenticated: true,
      authenticated: true,
      address: req.session.address,
      isAdmin: req.session.isAdmin,
    });
  } else {
    res.json({
      isAuthenticated: false,
      authenticated: false,
      address: null,
      isAdmin: false,
    });
  }
});

app.get('/api/balance', requireAuth, async (req, res) => {
  try {
    const balance = await contract.balanceOf(req.session.address);
    res.json({ balance: balance.toString() });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Добавляем тестовые маршруты API
app.get('/api/public', (req, res) => {
  res.json({ message: 'This is a public API endpoint' });
});

app.get('/api/protected', (req, res) => {
  res.json({
    message: 'This is a protected API endpoint',
    user: {
      address: req.session.address,
      isAdmin: req.session.isAdmin,
    },
  });
});

app.get('/api/admin', (req, res) => {
  res.json({
    message: 'This is an admin API endpoint',
    user: {
      address: req.session.address,
      isAdmin: req.session.isAdmin,
    },
  });
});

// Добавьте обработчик ошибок
app.use((err, req, res, next) => {
  console.error('Глобальная ошибка:', err.stack);
  if (!res.headersSent) {
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

// Перед запуском сервера
console.log('Перед запуском сервера на порту:', PORT);

// Запуск сервера и инициализация сервисов
let server;

checkDatabaseStructure().then(() => {
  // Запускаем сервер
  server = app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
    console.log('Server address:', server.address());
  });
});

// Добавляем graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM signal received: closing HTTP server');
  server.close(() => {
    console.log('HTTP server closed');
    process.exit(0);
  });
});

// Проверяем доступность Ollama сервера
async function checkOllamaServer() {
  try {
    const response = await axios.get('http://localhost:11434/api/tags');
    if (response.status === 200) {
      console.log('Ollama сервер доступен');

      // Тестируем прямой запрос к Ollama
      try {
        console.log('Тестируем прямой запрос к Ollama...');
        const model = new ChatOllama({
          baseUrl: 'http://localhost:11434',
          model: 'llama3',
          temperature: 0.2,
        });

        const result = await model.invoke('Привет, как дела?');
        console.log('Ответ от Ollama:', result);
      } catch (testError) {
        console.error('Ошибка при тестировании Ollama:', testError);
      }

      // Инициализируем векторное хранилище
      try {
        console.log('Инициализируем векторное хранилище...');
        const vectorStore = await getVectorStore();
        console.log('Векторное хранилище инициализировано');
      } catch (vectorError) {
        console.error('Ошибка при инициализации векторного хранилища:', vectorError);
      }

      return true;
    }
    return false;
  } catch (error) {
    console.error('Ollama сервер недоступен:', error.message);
    return false;
  }
}

// Настройка периодической очистки устаревших сессий
const pgSessionCleanup = setInterval(function () {
  console.log('Cleaning up expired sessions...');
  pool
    .query('DELETE FROM session WHERE expire < NOW()')
    .then((result) => {
      if (result.rowCount > 0) {
        console.log(`Removed ${result.rowCount} expired sessions`);
      }
    })
    .catch((err) => console.error('Error cleaning up sessions:', err));
}, 3600000); // Очистка каждый час

// Очистка интервала при завершении работы
process.on('SIGTERM', () => {
  clearInterval(pgSessionCleanup);
  console.log('SIGTERM signal received: closing HTTP server');
  server.close(() => {
    console.log('HTTP server closed');
    process.exit(0);
  });
});

// Функция для создания таблиц
async function ensureTablesExist() {
  try {
    // Проверяем существование таблицы users
    const result = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'users'
      );
    `);

    // Если таблица не существует, создаем все таблицы
    if (!result.rows[0].exists) {
      console.log('Таблицы не найдены, создаем...');

      // SQL-запросы для создания таблиц
      const createTablesSql = `
        -- Таблица пользователей
        CREATE TABLE IF NOT EXISTS users (
          id SERIAL PRIMARY KEY,
          address VARCHAR(255) UNIQUE,
          email VARCHAR(255) UNIQUE,
          telegram_id VARCHAR(255) UNIQUE,
          username VARCHAR(255),
          is_admin BOOLEAN DEFAULT FALSE,
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW()
        );
        
        -- Индексы для таблицы пользователей
        CREATE INDEX IF NOT EXISTS idx_users_address ON users(address);
        CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
        CREATE INDEX IF NOT EXISTS idx_users_telegram_id ON users(telegram_id);
        
        -- Таблица сессий
        CREATE TABLE IF NOT EXISTS session (
          sid VARCHAR NOT NULL,
          sess JSON NOT NULL,
          expire TIMESTAMP(6) NOT NULL,
          CONSTRAINT session_pkey PRIMARY KEY (sid)
        );
        
        -- Индекс для таблицы сессий
        CREATE INDEX IF NOT EXISTS idx_session_expire ON session(expire);
        
        -- Таблица канбан-досок
        CREATE TABLE IF NOT EXISTS kanban_boards (
          id SERIAL PRIMARY KEY,
          title VARCHAR(255) NOT NULL,
          description TEXT,
          owner_id INTEGER REFERENCES users(id),
          is_public BOOLEAN DEFAULT FALSE,
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW()
        );
        
        -- Таблица колонок канбан-доски
        CREATE TABLE IF NOT EXISTS kanban_columns (
          id SERIAL PRIMARY KEY,
          board_id INTEGER REFERENCES kanban_boards(id) ON DELETE CASCADE,
          title VARCHAR(255) NOT NULL,
          position INTEGER NOT NULL,
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW()
        );
        
        -- Таблица карточек канбан-доски
        CREATE TABLE IF NOT EXISTS kanban_cards (
          id SERIAL PRIMARY KEY,
          column_id INTEGER REFERENCES kanban_columns(id) ON DELETE CASCADE,
          title VARCHAR(255) NOT NULL,
          description TEXT,
          position INTEGER NOT NULL,
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW()
        );
        
        -- Индексы для таблиц канбан
        CREATE INDEX IF NOT EXISTS idx_kanban_boards_owner ON kanban_boards(owner_id);
        CREATE INDEX IF NOT EXISTS idx_kanban_columns_board ON kanban_columns(board_id);
        CREATE INDEX IF NOT EXISTS idx_kanban_cards_column ON kanban_cards(column_id);
        
        -- Таблица сообщений чата
        CREATE TABLE IF NOT EXISTS chat_messages (
          id SERIAL PRIMARY KEY,
          user_id INTEGER REFERENCES users(id),
          sender VARCHAR(50) NOT NULL,
          message TEXT NOT NULL,
          created_at TIMESTAMP DEFAULT NOW()
        );
        
        -- Индекс для таблицы сообщений
        CREATE INDEX IF NOT EXISTS idx_chat_messages_user ON chat_messages(user_id);
      `;

      await pool.query(createTablesSql);
      console.log('Таблицы успешно созданы');
    } else {
      console.log('Таблицы уже существуют');
    }
  } catch (error) {
    console.error('Ошибка при проверке/создании таблиц:', error);
  }
}

// Вызываем функцию при запуске сервера
ensureTablesExist();

// Добавляем middleware для проверки аутентификации
app.use('/api/protected', (req, res, next) => {
  // console.log('Protected route middleware:', {
  //   session: req.session,
  //   authenticated: req.session.authenticated,
  //   address: req.session.address
  // });

  if (!req.session.authenticated) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  next();
});

// Добавляем middleware для проверки прав администратора
app.use('/api/admin', (req, res, next) => {
  // console.log('Admin route middleware:', {
  //   session: req.session,
  //   authenticated: req.session.authenticated,
  //   isAdmin: req.session.isAdmin
  // });

  if (!req.session.authenticated || !req.session.isAdmin) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  next();
});

// Проверка структуры базы данных
async function checkDatabaseStructure() {
  try {
    const db = require('./db');

    // Проверяем наличие таблицы roles
    const rolesTable = await db.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'roles'
      );
    `);

    if (!rolesTable.rows[0].exists) {
      console.error('Таблица roles не существует. Выполните миграцию.');
      process.exit(1);
    }

    // Проверяем наличие колонки role_id в таблице users
    const roleIdColumn = await db.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.columns 
        WHERE table_name = 'users' AND column_name = 'role_id'
      );
    `);

    if (!roleIdColumn.rows[0].exists) {
      console.error('Колонка role_id не существует в таблице users. Выполните миграцию.');
      process.exit(1);
    }

    console.log('Структура базы данных проверена успешно.');
  } catch (error) {
    console.error('Ошибка при проверке структуры базы данных:', error);
    process.exit(1);
  }
}

// Обработка сигналов завершения
process.on('SIGINT', () => {
  console.log('Получен сигнал SIGINT, завершаем работу...');
  server.close(() => {
    console.log('Сервер остановлен');
    process.exit(0);
  });
});

process.on('SIGTERM', () => {
  console.log('Получен сигнал SIGTERM, завершаем работу...');
  server.close(() => {
    console.log('Сервер остановлен');
    process.exit(0);
  });
});

// Обработка необработанных исключений
process.on('uncaughtException', (error) => {
  console.error('Необработанное исключение:', error);
  // Не завершаем процесс, чтобы nodemon мог перезапустить сервер
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Необработанное отклонение промиса:', reason);
  // Не завершаем процесс, чтобы nodemon мог перезапустить сервер
});

// Инициализация Telegram бота
initTelegramBot();

// Добавьте после других маршрутов
const chatRouter = require('./routes/chat');
app.use('/api/chat', chatRouter);

const cron = require('node-cron');
const { checkAllUsersTokens } = require('./utils/access-check');
const logger = require('./utils/logger');

// Настройка cron-задачи для проверки токенов каждые 30 минут
cron.schedule('*/30 * * * *', async () => {
  logger.info('Running scheduled token balance check');
  await checkAllUsersTokens();
});

// Периодическая очистка устаревших сессий
const cleanupInterval = 24 * 60 * 60 * 1000; // 24 часа

setInterval(async () => {
  try {
    const { pool } = require('./db');
    const result = await pool.query('DELETE FROM sessions WHERE expire < NOW()');
    console.log(`Очищено ${result.rowCount} устаревших сессий`);
  } catch (err) {
    console.error('Ошибка при очистке сессий:', err);
  }
}, cleanupInterval);

// Запускаем первую очистку через 5 минут после старта сервера
setTimeout(async () => {
  try {
    const { pool } = require('./db');
    const result = await pool.query('DELETE FROM sessions WHERE expire < NOW()');
    console.log(`Первоначальная очистка: удалено ${result.rowCount} устаревших сессий`);
  } catch (err) {
    console.error('Ошибка при первоначальной очистке сессий:', err);
  }
}, 5 * 60 * 1000);

app.get('/session-debug', (req, res) => {
  // Implementation of the endpoint
});

app.get('/check-sessions', async (req, res) => {
  // Implementation of the endpoint
});
