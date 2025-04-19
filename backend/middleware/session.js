const session = require('express-session');
const pgSession = require('connect-pg-simple')(session);
const { pool } = require('../db');

const sessionMiddleware = session({
  store: new pgSession({
    pool,
    tableName: 'session',
    createTableIfMissing: true,
  }),
  secret: process.env.SESSION_SECRET || 'your-secret-key',
  resave: false,
  saveUninitialized: true,
  cookie: {
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 дней
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production', // В production должно быть true
    sameSite: 'lax', // Попробуйте изменить на 'none' если используете разные домены
  },
});

module.exports = sessionMiddleware;
