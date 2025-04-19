const { pool } = require('../db');
const nodemailer = require('nodemailer');
const Imap = require('imap');
const simpleParser = require('mailparser').simpleParser;
const { processMessage } = require('./ai-assistant');

// Конфигурация для отправки писем
const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_SMTP_HOST,
  port: process.env.EMAIL_SMTP_PORT,
  secure: process.env.EMAIL_SMTP_PORT === '465', // true для 465, false для других портов
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASSWORD,
  },
});

// Конфигурация для получения писем
const imapConfig = {
  user: process.env.EMAIL_USER,
  password: process.env.EMAIL_PASSWORD,
  host: process.env.EMAIL_IMAP_HOST,
  port: process.env.EMAIL_IMAP_PORT,
  tls: true,
  tlsOptions: { rejectUnauthorized: false },
};

/**
 * Инициализация сервиса электронной почты
 */
function initEmailBot() {
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASSWORD) {
    console.warn('EMAIL_USER or EMAIL_PASSWORD not set, Email integration disabled');
    return null;
  }

  console.log('Email bot initialized');

  // Запуск проверки почты каждые 5 минут
  const checkInterval = 5 * 60 * 1000; // 5 минут
  setInterval(checkEmails, checkInterval);

  // Первая проверка при запуске
  checkEmails();

  return {
    sendEmail,
    checkEmails,
  };
}

/**
 * Проверка новых писем
 */
function checkEmails() {
  const imap = new Imap(imapConfig);

  imap.once('ready', () => {
    imap.openBox('INBOX', false, (err, box) => {
      if (err) {
        console.error('Error opening inbox:', err);
        return;
      }

      // Поиск непрочитанных писем
      imap.search(['UNSEEN'], (err, results) => {
        if (err) {
          console.error('Error searching emails:', err);
          return;
        }

        if (results.length === 0) {
          console.log('No new emails');
          imap.end();
          return;
        }

        console.log(`Found ${results.length} new emails`);

        const f = imap.fetch(results, { bodies: '' });

        f.on('message', (msg, seqno) => {
          msg.on('body', (stream, info) => {
            simpleParser(stream, async (err, parsed) => {
              if (err) {
                console.error('Error parsing email:', err);
                return;
              }

              try {
                // Обработка письма
                await processEmail(parsed);

                // Пометить как прочитанное
                imap.setFlags(results, ['\\Seen'], (err) => {
                  if (err) {
                    console.error('Error marking email as read:', err);
                  }
                });
              } catch (error) {
                console.error('Error processing email:', error);
              }
            });
          });
        });

        f.once('error', (err) => {
          console.error('Fetch error:', err);
        });

        f.once('end', () => {
          imap.end();
        });
      });
    });
  });

  imap.once('error', (err) => {
    console.error('IMAP error:', err);
  });

  imap.connect();
}

/**
 * Обработка полученного письма
 * @param {Object} email - Распарсенное письмо
 */
async function processEmail(email) {
  try {
    const from = email.from.value[0].address;
    const subject = email.subject;
    const text = email.text || '';

    console.log(`Processing email from ${from}, subject: ${subject}`);

    // Поиск пользователя по email
    const userResult = await pool.query(
      `SELECT u.* FROM users u
       JOIN user_identities ui ON u.id = ui.user_id
       WHERE ui.identity_type = 'email' AND ui.identity_value = $1 AND ui.verified = TRUE`,
      [from]
    );

    if (userResult.rows.length === 0) {
      console.log(`No verified user found for email ${from}`);
      // Отправка ответа о необходимости регистрации
      await sendEmail(
        from,
        'Регистрация в системе',
        'Для использования ИИ-ассистента через email, пожалуйста, зарегистрируйтесь на нашем сайте и подтвердите свой email.'
      );
      return;
    }

    const user = userResult.rows[0];

    // Получение или создание диалога
    const conversationResult = await pool.query(
      `SELECT * FROM conversations
       WHERE user_id = $1
       ORDER BY updated_at DESC
       LIMIT 1`,
      [user.id]
    );

    let conversationId;

    if (conversationResult.rows.length === 0) {
      // Создание нового диалога
      const newConversationResult = await pool.query(
        `INSERT INTO conversations (user_id, title)
         VALUES ($1, $2)
         RETURNING id`,
        [user.id, subject || 'Email диалог']
      );

      conversationId = newConversationResult.rows[0].id;
    } else {
      conversationId = conversationResult.rows[0].id;
    }

    // Сохранение сообщения пользователя
    await pool.query(
      `INSERT INTO messages (conversation_id, sender_type, sender_id, content, channel)
       VALUES ($1, $2, $3, $4, $5)`,
      [conversationId, 'user', user.id, text, 'email']
    );

    // Обработка сообщения ИИ-ассистентом
    const aiResponse = await processMessage(user.id, text, user.language || 'ru');

    // Сохранение ответа ИИ
    await pool.query(
      `INSERT INTO messages (conversation_id, sender_type, sender_id, content, channel)
       VALUES ($1, $2, $3, $4, $5)`,
      [conversationId, 'ai', null, aiResponse, 'email']
    );

    // Обновление времени последнего обновления диалога
    await pool.query(
      `UPDATE conversations
       SET updated_at = NOW()
       WHERE id = $1`,
      [conversationId]
    );

    // Отправка ответа пользователю
    await sendEmail(from, `Re: ${subject}`, aiResponse);

    console.log(`Sent response to ${from}`);
  } catch (error) {
    console.error('Error processing email:', error);
    throw error;
  }
}

/**
 * Отправка email
 * @param {string} to - Адрес получателя
 * @param {string} subject - Тема письма
 * @param {string} text - Текст письма
 * @returns {Promise<Object>} - Результат отправки
 */
async function sendEmail(to, subject, text) {
  try {
    const info = await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to,
      subject,
      text,
    });

    console.log('Email sent:', info.messageId);
    return info;
  } catch (error) {
    console.error('Error sending email:', error);
    throw error;
  }
}

module.exports = {
  initEmailBot,
  sendEmail,
  checkEmails,
};
