const express = require('express');
const cors = require('cors');
const session = require('express-session');
const pgSession = require('connect-pg-simple')(session);
const { pool } = require('./db');
const helmet = require('helmet');
const path = require('path');
const logger = require('./utils/logger');
const authService = require('./services/auth-service');
const { errorHandler, AppError, ErrorTypes } = require('./middleware/errorHandler');
const aiAssistant = require('./services/ai-assistant');
const crypto = require('crypto');

// Импорт маршрутов
const authRoutes = require('./routes/auth');
const usersRoutes = require('./routes/users');
const identitiesRoutes = require('./routes/identities');
const chatRoutes = require('./routes/chat');
const adminRoutes = require('./routes/admin');
const tokensRouter = require('./routes/tokens');

const app = express();

// Указываем хост явно
app.set('host', '0.0.0.0');
app.set('port', process.env.PORT || 8000);

// Настройка CORS
app.use(cors({
  origin: [
    'http://localhost:5173',
    'http://127.0.0.1:5173'  // Добавляем альтернативный origin
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Cookie']
}));

// Настройка сессии
app.use(session({
  store: new pgSession({
    pool,
    tableName: 'session',
  }),
  secret: process.env.SESSION_SECRET || 'hb3atoken',
  name: 'sessionId',
  resave: false,
  saveUninitialized: true,
  cookie: {
    maxAge: 30 * 24 * 60 * 60 * 1000,
    httpOnly: true,
    secure: false,
    sameSite: 'lax',
    path: '/'
  }
}));

// Добавим middleware для проверки сессии
app.use(async (req, res, next) => {
  console.log('Request cookies:', req.headers.cookie);
  console.log('Session ID:', req.sessionID);
  
  // Проверяем сессию в базе данных
  if (req.sessionID) {
    const result = await pool.query(
      'SELECT sess FROM session WHERE sid = $1',
      [req.sessionID]
    );
    console.log('Session from DB:', result.rows[0]?.sess);
  }

  // Если сессия уже есть, используем её
  if (req.session.authenticated) {
    return next();
  }

  // Проверяем заголовок авторизации
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];
    try {
      // Находим пользователя по токену
      const { rows } = await pool.query(`
        SELECT u.id, 
        (u.role = 'admin') as is_admin,
        u.address 
        FROM users u 
        WHERE u.id = $1
      `, [token]);
      
      if (rows.length > 0) {
        const user = rows[0];
        req.session.userId = user.id;
        req.session.address = user.address;
        req.session.isAdmin = user.is_admin;
        req.session.authenticated = true;
        
        await new Promise(resolve => req.session.save(resolve));
      }
    } catch (error) {
      console.error('Error checking auth header:', error);
    }
  }
  
  next();
});

// Настройка парсеров
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Настройка безопасности
app.use(helmet({
  contentSecurityPolicy: false // Отключаем CSP для разработки
}));

// Логирование запросов
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.url}`);
  next();
});

// Маршруты API
app.use('/api/auth', authRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/identities', identitiesRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/tokens', tokensRouter);

const nonceStore = new Map(); // или любая другая реализация хранилища nonce

// Значение для маскирования чувствительных данных
const redactedValue = '***********';

// Логируем переменные окружения для отладки
console.log('NODE_ENV:', process.env.NODE_ENV);
console.log('PORT:', process.env.PORT);
console.log('POSTGRES_HOST:', process.env.POSTGRES_HOST);
console.log('POSTGRES_PORT:', process.env.POSTGRES_PORT);
console.log('POSTGRES_DB:', process.env.POSTGRES_DB);
console.log('POSTGRES_USER:', redactedValue);
console.log('POSTGRES_PASSWORD:', redactedValue);
console.log('TELEGRAM_BOT_TOKEN:', redactedValue);
console.log('TELEGRAM_BOT_USERNAME:', process.env.TELEGRAM_BOT_USERNAME);
console.log('OPENAI_API_KEY:', redactedValue);
// console.log('SESSION_SECRET:', process.env.SESSION_SECRET); // Убираем вывод секретного ключа
console.log('EMAIL_USER:', process.env.EMAIL_USER);
console.log('EMAIL_PASSWORD:', redactedValue);

// Добавляем обработчик ошибок последним
app.use(errorHandler);

// Эндпоинт для проверки состояния
app.get('/api/health', async (req, res) => {
  try {
    // Проверяем подключение к БД
    await pool.query('SELECT NOW()');
    
    // Проверяем AI сервис
    const aiStatus = await aiAssistant.checkHealth();
    
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      database: 'connected',
      ai: aiStatus
    });
  } catch (error) {
    logger.error('Health check failed:', error);
    res.status(500).json({
      status: 'error',
      error: error.message
    });
  }
});

// Очистка старых сессий
setInterval(async () => {
  try {
    await pool.query('DELETE FROM session WHERE expire < NOW()');
  } catch (error) {
    console.error('Error cleaning old sessions:', error);
  }
}, 15 * 60 * 1000); // Каждые 15 минут

module.exports = { app, nonceStore };
