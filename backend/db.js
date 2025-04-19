const { Pool } = require('pg');
require('dotenv').config();

// Выводим настройки подключения (без пароля)
console.log('Настройки подключения к базе данных:');
console.log('DATABASE_URL:', process.env.DATABASE_URL?.replace(/:([^:@]+)@/, ':***@'));
console.log('DB_HOST:', process.env.DB_HOST);
console.log('DB_PORT:', process.env.DB_PORT);
console.log('DB_NAME:', process.env.DB_NAME);
console.log('DB_USER:', process.env.DB_USER);

// Создаем пул соединений с базой данных
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

// Проверяем подключение к базе данных
pool.query('SELECT NOW()', (err, res) => {
  if (err) {
    console.error('Ошибка подключения к базе данных:', err);
    
    // Пробуем альтернативное подключение
    console.log('Попытка альтернативного подключения через прямые параметры...');
    
    const altPool = new Pool({
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432'),
      database: process.env.DB_NAME || 'dapp_db',
      user: process.env.DB_USER || 'dapp_user',
      password: process.env.DB_PASSWORD,
    });
    
    altPool.query('SELECT NOW()', (altErr, altRes) => {
      if (altErr) {
        console.error('Альтернативное подключение тоже не удалось:', altErr);
        console.log('Переключение на временное хранилище данных в памяти...');
        module.exports = createInMemoryStorage();
      } else {
        console.log('Альтернативное подключение успешно:', altRes.rows[0]);
        // Заменяем основной пул на альтернативный
        module.exports.pool = altPool;
        module.exports.query = (text, params) => altPool.query(text, params);
      }
    });
  } else {
    console.log('Успешное подключение к базе данных:', res.rows[0]);
  }
});

// Функция для выполнения SQL-запросов
const query = (text, params) => {
  return pool.query(text, params);
};

// Функция для сохранения гостевого сообщения в базе данных
async function saveGuestMessageToDatabase(message, language, guestId) {
  try {
    await query(`
      INSERT INTO guest_messages (guest_id, content, language, created_at)
      VALUES ($1, $2, $3, NOW())
    `, [guestId, message, language]);
    console.log('Гостевое сообщение успешно сохранено:', message);
  } catch (error) {
    console.error('Ошибка при сохранении гостевого сообщения:', error);
    throw error; // Пробрасываем ошибку дальше
  }
}

// Экспортируем функции для работы с базой данных
module.exports = {
  query,
  pool,
  saveGuestMessageToDatabase,
};

// Функция для создания временного хранилища данных в памяти
function createInMemoryStorage() {
  console.log('Используется временное хранилище данных в памяти');

  const users = [];
  let userId = 1;

  // Эмуляция функции query для работы с пользователями
  const inMemoryQuery = async (text, params) => {
    console.log('SQL query (in-memory):', text, 'Params:', params);

    // Эмуляция запроса SELECT * FROM users WHERE address = $1
    if (text.includes('SELECT * FROM users WHERE address = $1')) {
      const address = params[0];
      const user = users.find((u) => u.address === address);
      return { rows: user ? [user] : [] };
    }

    // Эмуляция запроса SELECT * FROM users WHERE email = $1
    if (text.includes('SELECT * FROM users WHERE email = $1')) {
      const email = params[0];
      const user = users.find((u) => u.email === email);
      return { rows: user ? [user] : [] };
    }

    // Эмуляция запроса INSERT INTO users
    if (text.includes('INSERT INTO users')) {
      let newUser;

      if (text.includes('address')) {
        newUser = { id: userId++, address: params[0], created_at: new Date(), is_admin: false };
      } else if (text.includes('email')) {
        newUser = { id: userId++, email: params[0], created_at: new Date(), is_admin: false };
      }

      if (newUser) {
        users.push(newUser);
        return { rows: [newUser] };
      }
    }

    return { rows: [] };
  };

  return {
    query: inMemoryQuery,
    pool: {
      query: (text, params, callback) => {
        if (callback) {
          try {
            const result = inMemoryQuery(text, params);
            callback(null, result);
          } catch (err) {
            callback(err);
          }
        } else {
          return inMemoryQuery(text, params);
        }
      },
    },
  };
}

// Проверка и создание таблицы session, если она не существует
async function checkSessionTable() {
  try {
    const result = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'session'
      );
    `);

    const tableExists = result.rows[0].exists;

    if (!tableExists) {
      console.log('Таблица session не существует, создаем...');

      await pool.query(`
        CREATE TABLE "session" (
          "sid" varchar NOT NULL COLLATE "default",
          "sess" json NOT NULL,
          "expire" timestamp(6) NOT NULL,
          CONSTRAINT "session_pkey" PRIMARY KEY ("sid")
        );
        CREATE INDEX "IDX_session_expire" ON "session" ("expire");
      `);

      console.log('Таблица session успешно создана');
    } else {
      console.log('Таблица session уже существует');
    }
  } catch (error) {
    console.error('Ошибка при проверке/создании таблицы session:', error);
  }
}
