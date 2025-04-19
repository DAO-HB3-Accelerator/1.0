const session = require('express-session');
const pgSession = require('connect-pg-simple')(session);
const { pool } = require('../db');

const sessionConfig = {
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
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/'
  }
};

module.exports = {
  sessionMiddleware: session(sessionConfig)
};