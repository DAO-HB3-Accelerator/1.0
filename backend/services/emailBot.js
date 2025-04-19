const { pool } = require('../db');
const nodemailer = require('nodemailer');
const Imap = require('imap');
const simpleParser = require('mailparser').simpleParser;
const { processMessage } = require('./ai-assistant');
const { inspect } = require('util');
const logger = require('../utils/logger');

// Конфигурация для отправки писем
const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_SMTP_HOST || 'smtp.hostland.ru',
  port: process.env.EMAIL_SMTP_PORT || 465,
  secure: true,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASSWORD,
  },
  pool: true,
  maxConnections: 3,
  maxMessages: 5,
  tls: {
    rejectUnauthorized: false
  }
});

// Конфигурация для получения писем
const imapConfig = {
  user: process.env.EMAIL_USER,
  password: process.env.EMAIL_PASSWORD,
  host: process.env.EMAIL_IMAP_HOST,
  port: process.env.EMAIL_IMAP_PORT,
  tls: true,
  tlsOptions: { rejectUnauthorized: false },
  keepalive: { 
    interval: 10000,
    idleInterval: 300000,
    forceNoop: true
  }
};

class EmailBotService {
  constructor() {
    this.transporter = transporter;
    this.imap = new Imap(imapConfig);
    this.initialize();
  }

  initialize() {
    this.imap.once('error', (err) => {
      logger.error(`IMAP connection error: ${err.message}`);
      setTimeout(() => {
        try {
          if (this.imap.state !== 'connected') {
            this.imap = new Imap(imapConfig);
            this.initialize();
          }
        } catch (e) {
          logger.error(`Error reconnecting IMAP: ${e.message}`);
        }
      }, 60000);
    });
  }

  // Метод для инициализации email верификации
  async initEmailVerification(email, userId, code) {
    try {
      // Отправляем код на email
      await this.sendVerificationCode(email, code);
      
      return { success: true };
    } catch (error) {
      logger.error('Error initializing email verification:', error);
      throw error;
    }
  }

  // Отправка кода верификации
  async sendVerificationCode(email, code) {
    try {
      const mailOptions = {
        from: process.env.EMAIL_USER,
        to: email,
        subject: 'Код подтверждения',
        text: `Ваш код подтверждения: ${code}\n\nКод действителен в течение 15 минут.`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #333;">Код подтверждения</h2>
            <p style="font-size: 16px; color: #666;">Ваш код подтверждения:</p>
            <div style="background-color: #f5f5f5; padding: 15px; border-radius: 5px; text-align: center; margin: 20px 0;">
              <span style="font-size: 24px; font-weight: bold; color: #333;">${code}</span>
            </div>
            <p style="font-size: 14px; color: #999;">Код действителен в течение 15 минут.</p>
          </div>
        `
      };

      await this.transporter.sendMail(mailOptions);
      logger.info(`Verification code sent to ${email}`);
    } catch (error) {
      logger.error('Error sending verification code:', error);
      throw error;
    }
  }

  checkEmails() {
    try {
      // Добавляем обработчики ошибок
      this.imap.once('error', (err) => {
        logger.error(`IMAP connection error during check: ${err.message}`);
        try {
          this.imap.end();
        } catch (e) {
          // Игнорируем ошибки при закрытии
        }
      });

      this.imap.once('ready', () => {
        this.imap.openBox('INBOX', false, (err, box) => {
          if (err) {
            logger.error(`Error opening inbox: ${err}`);
            this.imap.end();
            return;
          }
          
          // Ищем непрочитанные письма
          this.imap.search(['UNSEEN'], (err, results) => {
            if (err) {
              logger.error(`Error searching messages: ${err}`);
              this.imap.end();
              return;
            }
            
            if (!results || results.length === 0) {
              logger.info('No new messages found');
              this.imap.end();
              return;
            }
            
            try {
              const f = this.imap.fetch(results, { bodies: '' });
              
              f.on('message', (msg, seqno) => {
                msg.on('body', (stream, info) => {
                  simpleParser(stream, async (err, parsed) => {
                    if (err) {
                      logger.error(`Error parsing message: ${err}`);
                      return;
                    }
                  });
                });
              });
              
              f.once('error', (err) => {
                logger.error(`Fetch error: ${err}`);
              });
              
              f.once('end', () => {
                try {
                  this.imap.end();
                } catch (e) {
                  logger.error(`Error ending IMAP connection: ${e.message}`);
                }
              });
            } catch (e) {
              logger.error(`Error fetching messages: ${e.message}`);
              try {
                this.imap.end();
              } catch (e) {
                // Игнорируем ошибки при закрытии
              }
            }
          });
        });
      });
      
      this.imap.connect();
    } catch (error) {
      logger.error(`Global error checking emails: ${error.message}`);
      try {
        this.imap.end();
      } catch (e) {
        // Игнорируем ошибки при закрытии
      }
    }
  }

  // Метод для отправки email
  async sendEmail(to, subject, text) {
    try {
      const mailOptions = {
        from: process.env.EMAIL_USER,
        to,
        subject,
        text
      };

      await this.transporter.sendMail(mailOptions);
      logger.info(`Email sent to ${to}`);
      return true;
    } catch (error) {
      logger.error('Error sending email:', error);
      throw error;
    }
  }
}

// Экспортируем singleton instance
module.exports = new EmailBotService();
