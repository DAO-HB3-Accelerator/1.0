// Роли пользователей
const USER_ROLES = {
  USER: 1,
  ADMIN: 2
};

// Типы идентификаторов
const IDENTITY_TYPES = {
  WALLET: 'wallet',
  EMAIL: 'email',
  TELEGRAM: 'telegram'
};

// Каналы сообщений
const MESSAGE_CHANNELS = {
  WEB: 'web',
  TELEGRAM: 'telegram',
  EMAIL: 'email'
};

// Типы отправителей сообщений
const SENDER_TYPES = {
  USER: 'user',
  AI: 'ai',
  ADMIN: 'admin'
};

// Коды ошибок
const ERROR_CODES = {
  UNAUTHORIZED: 'unauthorized',
  FORBIDDEN: 'forbidden',
  NOT_FOUND: 'not_found',
  INTERNAL_ERROR: 'internal_error',
  BAD_REQUEST: 'bad_request'
};

// Настройки сессии
const SESSION_CONFIG = {
  COOKIE_MAX_AGE: 24 * 60 * 60 * 1000, // 24 часа
  COOKIE_SECURE: process.env.NODE_ENV === 'production',
  COOKIE_SAME_SITE: 'lax'
};

// Настройки API
const API_CONFIG = {
  RATE_LIMIT: 100, // запросов в минуту
  TIMEOUT: 30000 // 30 секунд
};

module.exports = {
  USER_ROLES,
  IDENTITY_TYPES,
  MESSAGE_CHANNELS,
  SENDER_TYPES,
  ERROR_CODES,
  SESSION_CONFIG,
  API_CONFIG
}; 