import express from 'express';
import cors from 'cors';
import session from 'express-session';
import { generateNonce, SiweMessage } from 'siwe';
import { createPublicClient, http, verifyMessage } from 'viem';
import { sepolia } from 'viem/chains';

const app = express();

// Создаем Viem клиент для Sepolia
const client = createPublicClient({
  chain: sepolia,
  transport: http()
});

// Конфигурация CORS для работы с frontend
app.use(cors({
  origin: ['http://localhost:5174', 'http://127.0.0.1:5173', 'http://localhost:5173'],
  credentials: true,
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type', 'Accept']
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Настройка сессий
app.use(session({
  name: 'siwe-dapp',
  secret: "siwe-dapp-secret",
  resave: true,
  saveUninitialized: true,
  cookie: { 
    secure: false, 
    sameSite: 'lax',
    maxAge: 24 * 60 * 60 * 1000 // 24 часа
  }
}));

// Логирование запросов
app.use((req, res, next) => {
  console.log(`${req.method} ${req.url}`);
  next();
});

// Генерация nonce
app.get('/nonce', (_, res) => {
  try {
    const nonce = generateNonce();
    res.setHeader('Content-Type', 'text/plain');
    res.status(200).send(nonce);
  } catch (error) {
    console.error('Ошибка генерации nonce:', error);
    res.status(500).send('Internal Server Error');
  }
});

// Верификация сообщения
app.post('/verify', async (req, res) => {
  try {
    if (!req.body.message) {
      return res.status(400).json({ error: 'SiweMessage is undefined' });
    }

    const { message, signature } = req.body;
    console.log('Верификация сообщения:', { message, signature });

    // Создаем и парсим SIWE сообщение
    const siweMessage = new SiweMessage(message);
    
    // Проверяем базовые параметры
    if (siweMessage.chainId !== 11155111) { // Sepolia
      throw new Error('Invalid chain ID. Only Sepolia is supported.');
    }

    if (siweMessage.domain !== '127.0.0.1:5173') {
      throw new Error('Invalid domain');
    }

    // Проверяем время
    const currentTime = new Date().getTime();
    const messageTime = new Date(siweMessage.issuedAt).getTime();
    const timeDiff = currentTime - messageTime;
    
    // Временно отключаем проверку времени для разработки
    console.log('Разница во времени:', {
      currentTime: new Date(currentTime).toISOString(),
      messageTime: new Date(messageTime).toISOString(),
      diffMinutes: Math.abs(timeDiff) / (60 * 1000)
    });

    // Верифицируем сообщение
    console.log('Начинаем валидацию SIWE сообщения...');
    const fields = await siweMessage.validate(signature);
    console.log('SIWE валидация успешна:', fields);

    // Проверяем подпись через viem
    console.log('Проверяем подпись через viem...');
    const isValid = await client.verifyMessage({
      address: fields.address,
      message: message,
      signature: signature
    });
    console.log('Результат проверки подписи:', isValid);

    if (!isValid) {
      throw new Error('Invalid signature');
    }

    console.log('Верификация успешна:', {
      address: fields.address,
      chainId: fields.chainId,
      domain: fields.domain
    });

    // Сохраняем сессию
    req.session.siwe = { 
      address: fields.address,
      chainId: fields.chainId,
      domain: fields.domain,
      issuedAt: fields.issuedAt
    };
    
    req.session.save(() => {
      res.status(200).json({ 
        success: true,
        address: fields.address,
        chainId: fields.chainId,
        domain: fields.domain
      });
    });
  } catch (error) {
    console.error('Ошибка верификации:', error);
    req.session.siwe = null;
    req.session.nonce = null;
    req.session.save(() => {
      res.status(400).json({ 
        error: 'Verification failed',
        message: error.message 
      });
    });
  }
});

// Получение сессии
app.get('/session', (req, res) => {
  try {
    res.json(req.session.siwe || null);
  } catch (error) {
    console.error('Ошибка получения сессии:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Выход
app.get('/signout', (req, res) => {
  try {
    req.session.destroy((err) => {
      if (err) {
        console.error('Ошибка при удалении сессии:', err);
        return res.status(500).json({ error: 'Failed to destroy session' });
      }
      res.status(200).json({ success: true });
    });
  } catch (error) {
    console.error('Ошибка выхода:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Базовый маршрут
app.get('/', (req, res) => {
  res.json({
    status: 'ok',
    endpoints: {
      nonce: 'GET /nonce',
      verify: 'POST /verify',
      session: 'GET /session',
      signout: 'GET /signout'
    }
  });
});

// Обработка 404
app.use((req, res) => {
  console.log(`404: ${req.method} ${req.url}`);
  res.status(404).json({
    error: 'Not Found',
    message: `Endpoint ${req.method} ${req.url} не существует`
  });
});

// Обработка ошибок
app.use((err, req, res, next) => {
  console.error('Ошибка сервера:', err);
  res.status(500).json({
    error: 'Internal Server Error',
    message: err.message
  });
});

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`SIWE сервер запущен на порту ${PORT}`);
  console.log('Доступные эндпоинты:');
  console.log('  GET  /          - Информация о сервере');
  console.log('  GET  /nonce     - Получить nonce');
  console.log('  POST /verify    - Верифицировать сообщение');
  console.log('  GET  /session   - Получить текущую сессию');
  console.log('  GET  /signout   - Выйти из системы');
}); 