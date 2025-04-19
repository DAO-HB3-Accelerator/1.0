<template>
  <div class="app-container">
    <!-- Основной контент -->
    <div class="main-content" :class="{ 'no-right-sidebar': !showWalletSidebar }">
      <div class="header">
        <div class="header-content">
          <div class="header-text">
            <h1 class="title">✌️HB3 - Accelerator DLE</h1>
            <p class="subtitle">Венчурный фонд и поставщик программного обеспечения</p>
          </div>
          <button class="nav-btn header-wallet-btn" @click="toggleWalletSidebar" :class="{ active: showWalletSidebar }">
            <div class="hamburger-line"></div>
            <div class="nav-btn-number">7</div>
            <div class="nav-btn-text">{{ showWalletSidebar ? 'Скрыть панель' : 'Подключиться' }}</div>
          </button>
        </div>
      </div>
      
      <div class="chat-container">
        <div class="chat-messages" ref="messagesContainer">
          <div v-for="message in messages" :key="message.id" 
               :class="['message', 
                       message.sender_type === 'assistant' || message.role === 'assistant' ? 'ai-message' : 
                       message.sender_type === 'system' || message.role === 'system' ? 'system-message' : 'user-message',
                       message.isLocal ? 'is-local' : '',
                       message.hasError ? 'has-error' : '']">
            <div class="message-content" v-html="formatMessage(message.content)"></div>
            <div class="message-meta">
              <div class="message-time">{{ formatTime(message.timestamp || message.created_at) }}</div>
              <div v-if="message.isLocal" class="message-status">
                <span class="sending-indicator">Отправка...</span>
              </div>
              <div v-if="message.hasError" class="message-status">
                <span class="error-indicator">Ошибка отправки</span>
              </div>
            </div>
          </div>
        </div>
        
        <div class="chat-input">
          <textarea 
            v-model="newMessage" 
            placeholder="Введите сообщение..." 
            @keydown.enter.prevent="handleMessage(newMessage)"
            @focus="handleFocus"
            @blur="handleBlur"
            :disabled="isLoading"
            ref="messageInput"
            rows="3"
            autofocus
          ></textarea>
          <div class="chat-buttons">
            <button @click="handleMessage(newMessage)" :disabled="isLoading || !newMessage.trim()">
              {{ isLoading ? 'Отправка...' : 'Отправить' }}
            </button>
            <button @click="clearGuestMessages" class="clear-btn" :disabled="isLoading">
              Очистить
            </button>
          </div>
        </div>
        </div>
          </div>
          
    <!-- Правая панель с информацией о кошельке -->
    <div class="wallet-sidebar" v-if="showWalletSidebar">
      <div class="wallet-header">
        <button v-if="!isAuthenticated" @click="handleWalletAuth" class="wallet-connect-btn-header">
              Подключить кошелек
            </button>
        <button v-if="isAuthenticated" @click="disconnectWallet" class="wallet-disconnect-btn-header">
          Отключить
        </button>
        <button class="close-wallet-sidebar" @click="toggleWalletSidebar">×</button>
      </div>
      
      <!-- Добавляем дополнительные кнопки авторизации -->
      <div v-if="!isAuthenticated" class="auth-buttons">
        <h3>Авторизация через:</h3>
        <div v-if="!telegramAuth.showVerification" class="auth-btn-container">
          <button @click="handleTelegramAuth" class="auth-btn telegram-btn">
            Подключить Telegram
          </button>
        </div>
        <div v-if="telegramAuth.showVerification" class="verification-block">
          <div class="verification-code">
            <span>Код верификации:</span>
            <code @click="copyCode(telegramAuth.verificationCode)">{{ telegramAuth.verificationCode }}</code>
            <span v-if="codeCopied" class="copied-message">Скопировано!</span>
          </div>
          <a :href="telegramAuth.botLink" target="_blank" class="bot-link">Открыть бота Telegram</a>
          <button @click="cancelTelegramAuth" class="cancel-btn">Отмена</button>
        </div>
        
        <!-- Сообщение об ошибке в Telegram -->
        <div v-if="telegramAuth.error" class="error-message">
          {{ telegramAuth.error }}
          <button class="close-error" @click="telegramAuth.error = ''">×</button>
        </div>
        
        <div v-if="!emailAuth.showForm && !emailAuth.showVerification" class="auth-btn-container">
          <button @click="handleEmailAuth" class="auth-btn email-btn">
            Подключить Email
          </button>
        </div>
              
        <!-- Форма для Email верификации -->
        <div v-if="emailAuth.showForm" class="email-form">
          <p>Введите ваш email для получения кода подтверждения:</p>
          <div class="email-form-container">
            <input 
              v-model="emailAuth.email" 
              type="email" 
              placeholder="Ваш email" 
              class="email-input"
              :class="{ 'email-input-error': emailAuth.formatError }"
            />
            <button @click="sendEmailVerification" class="send-email-btn" :disabled="emailAuth.isLoading">
              {{ emailAuth.isLoading ? 'Отправка...' : 'Отправить код' }}
            </button>
          </div>
          <div class="form-actions">
            <button @click="cancelEmailAuth" class="cancel-btn">Отмена</button>
            <p v-if="emailAuth.formatError" class="email-format-error">Пожалуйста, введите корректный email</p>
          </div>
        </div>
        
        <!-- Форма для ввода кода верификации Email -->
        <div v-if="emailAuth.showVerification" class="email-verification-form">
          <p>На ваш email <strong>{{ emailAuth.verificationEmail }}</strong> отправлен код подтверждения.</p>
          <div class="email-form-container">
            <input 
              v-model="emailAuth.verificationCode" 
              type="text" 
              placeholder="Введите код верификации" 
              maxlength="6"
              class="email-input"
            />
            <button @click="verifyEmailCode" class="send-email-btn" :disabled="emailAuth.isVerifying">
              {{ emailAuth.isVerifying ? 'Проверка...' : 'Подтвердить' }}
            </button>
          </div>
          <button @click="cancelEmailAuth" class="cancel-btn">Отмена</button>
        </div>
      </div>
            
      <!-- Сообщение об ошибке в Email -->
      <div v-if="emailAuth.error" class="error-message">
        {{ emailAuth.error }}
        <button class="close-error" @click="emailAuth.error = ''">×</button>
      </div>
          
      <!-- Блок информации о пользователе -->
      <div v-if="isAuthenticated" class="user-info">
        <h3>Идентификаторы:</h3>
        <div class="user-info-item">
          <span class="user-info-label">Кошелек:</span>
          <span v-if="hasIdentityType('wallet')" class="user-info-value">
            {{ truncateAddress(getIdentityValue('wallet')) }}
          </span>
          <button v-else @click="handleWalletAuth" class="connect-btn">
            Подключить кошелек
          </button>
        </div>
        <div class="user-info-item">
          <span class="user-info-label">Telegram:</span>
          <span v-if="hasIdentityType('telegram')" class="user-info-value">
            {{ getIdentityValue('telegram') }}
          </span>
          <button v-else @click="handleTelegramAuth" class="connect-btn">
            Подключить Telegram
          </button>
        </div>
        <div class="user-info-item">
          <span class="user-info-label">Email:</span>
          <span v-if="hasIdentityType('email')" class="user-info-value">
            {{ getIdentityValue('email') }}
          </span>
          <button v-else @click="handleEmailAuth" class="connect-btn">
            Подключить Email
          </button>
        </div>
      </div>
      
      <!-- Блок форм подключения для аутентифицированных пользователей -->
      <div v-if="isAuthenticated && (emailAuth.showForm || telegramAuth.showVerification || emailAuth.showVerification)" class="connect-forms">
        <!-- Форма для Email верификации -->
        <div v-if="emailAuth.showForm" class="email-form">
          <p>Введите ваш email для получения кода подтверждения:</p>
          <div class="email-form-container">
            <input 
              v-model="emailAuth.email" 
              type="email" 
              placeholder="Ваш email" 
              class="email-input"
              :class="{ 'email-input-error': emailAuth.formatError }"
            />
            <button @click="sendEmailVerification" class="send-email-btn" :disabled="emailAuth.isLoading">
              {{ emailAuth.isLoading ? 'Отправка...' : 'Отправить код' }}
            </button>
          </div>
          <div class="form-actions">
            <button @click="cancelEmailAuth" class="cancel-btn">Отмена</button>
            <p v-if="emailAuth.formatError" class="email-format-error">Пожалуйста, введите корректный email</p>
          </div>
        </div>

        <!-- Форма для ввода кода верификации Email -->
        <div v-if="emailAuth.showVerification" class="email-verification-form">
          <p>На ваш email <strong>{{ emailAuth.verificationEmail }}</strong> отправлен код подтверждения.</p>
          <div class="email-form-container">
            <input 
              v-model="emailAuth.verificationCode" 
              type="text" 
              placeholder="Введите код верификации" 
              maxlength="6"
              class="email-input"
            />
            <button @click="verifyEmailCode" class="send-email-btn" :disabled="emailAuth.isVerifying">
              {{ emailAuth.isVerifying ? 'Проверка...' : 'Подтвердить' }}
            </button>
          </div>
          <button @click="cancelEmailAuth" class="cancel-btn">Отмена</button>
        </div>

        <!-- Форма для Telegram верификации -->
        <div v-if="telegramAuth.showVerification" class="verification-block">
          <div class="verification-code">
            <span>Код верификации:</span>
            <code @click="copyCode(telegramAuth.verificationCode)">{{ telegramAuth.verificationCode }}</code>
            <span v-if="codeCopied" class="copied-message">Скопировано!</span>
          </div>
          <a :href="telegramAuth.botLink" target="_blank" class="bot-link">Открыть бота Telegram</a>
          <button @click="cancelTelegramAuth" class="cancel-btn">Отмена</button>
        </div>
      </div>
      
      <!-- Блок баланса токенов -->
      <div v-if="isAuthenticated && auth.address?.value" class="token-balances">
        <h3>Баланс токенов:</h3>
        <div class="token-balance">
          <span class="token-name">ETH:</span>
          <span class="token-amount">{{ Number(tokenBalances.eth).toLocaleString() }}</span>
          <span class="token-symbol">{{ TOKEN_CONTRACTS.eth.symbol }}</span>
        </div>
        <div class="token-balance">
          <span class="token-name">BSC:</span>
          <span class="token-amount">{{ Number(tokenBalances.bsc).toLocaleString() }}</span>
          <span class="token-symbol">{{ TOKEN_CONTRACTS.bsc.symbol }}</span>
        </div>
        <div class="token-balance">
          <span class="token-name">ARB:</span>
          <span class="token-amount">{{ Number(tokenBalances.arbitrum).toLocaleString() }}</span>
          <span class="token-symbol">{{ TOKEN_CONTRACTS.arbitrum.symbol }}</span>
        </div>
        <div class="token-balance">
          <span class="token-name">POL:</span>
          <span class="token-amount">{{ Number(tokenBalances.polygon).toLocaleString() }}</span>
          <span class="token-symbol">{{ TOKEN_CONTRACTS.polygon.symbol }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch, nextTick, onBeforeUnmount } from 'vue';
import { useAuth } from '../composables/useAuth';
import { connectWithWallet } from '../services/wallet';
import axios from 'axios';
import api from '../api/axios';
import DOMPurify from 'dompurify';
import { marked } from 'marked';
import '../assets/styles/home.css';
import { fetchTokenBalances, TOKEN_CONTRACTS } from '../services/tokens';

console.log('HomeView.vue: Оптимизированная версия с чатом');

// =====================================================================
// 1. ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
// =====================================================================

/**
 * Проверяет доступность localStorage
 * @returns {boolean} - Доступен ли localStorage
 */
const isLocalStorageAvailable = () => {
  try {
    const test = 'test';
    window.localStorage.setItem(test, test);
    window.localStorage.removeItem(test);
    return true;
  } catch (e) {
    console.error('localStorage is not available:', e);
    return false;
  }
};

/**
 * Получает данные из localStorage
 * @param {string} key - Ключ для получения
 * @param {any} defaultValue - Значение по умолчанию
 * @returns {any} - Полученное значение или значение по умолчанию
 */
const getFromStorage = (key, defaultValue = null) => {
  if (!isLocalStorageAvailable()) return defaultValue;
  try {
    return window.localStorage.getItem(key) || defaultValue;
  } catch (e) {
    console.error(`Error getting ${key} from localStorage:`, e);
    return defaultValue;
  }
};

/**
 * Сохраняет данные в localStorage
 * @param {string} key - Ключ для сохранения
 * @param {any} value - Значение для сохранения
 * @returns {boolean} - Успешно ли сохранено
 */
const setToStorage = (key, value) => {
  if (!isLocalStorageAvailable()) return false;
  try {
    window.localStorage.setItem(key, value);
    return true;
  } catch (e) {
    console.error(`Error setting ${key} in localStorage:`, e);
    return false;
  }
};

/**
 * Удаляет данные из localStorage
 * @param {string} key - Ключ для удаления
 * @returns {boolean} - Успешно ли удалено
 */
const removeFromStorage = (key) => {
  if (!isLocalStorageAvailable()) return false;
  try {
    window.localStorage.removeItem(key);
    return true;
  } catch (e) {
    console.error(`Error removing ${key} from localStorage:`, e);
    return false;
  }
};

/**
 * Генерирует уникальный ID
 * @returns {string} - Уникальный ID
 */
const generateUniqueId = () => {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
};

/**
 * Форматирует сообщение с поддержкой markdown
 * @param {string} text - Текст для форматирования
 * @returns {string} - Форматированный HTML
 */
const formatMessage = (text) => {
  if (!text) return '';
  const rawHtml = marked.parse(text);
  return DOMPurify.sanitize(rawHtml);
};

/**
 * Форматирует время в человекочитаемый вид
 * @param {string} timestamp - Метка времени
 * @returns {string} - Форматированное время
 */
const formatTime = (timestamp) => {
  if (!timestamp) return '';
  
  try {
    const date = new Date(timestamp);
    
    if (isNaN(date.getTime())) {
      console.warn('Invalid timestamp:', timestamp);
      return '';
    }
    
    return date.toLocaleString([], { 
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  } catch (error) {
    console.error('Error formatting time:', error, timestamp);
    return '';
  }
};

/**
 * Сокращает адрес кошелька
 * @param {string} address - Адрес кошелька
 * @returns {string} - Сокращенный адрес
 */
const truncateAddress = (address) => {
  if (!address) return '';
  return `${address.substring(0, 6)}...${address.substring(address.length - 4)}`;
};

// =====================================================================
// 2. СОСТОЯНИЯ (REFS)
// =====================================================================

// Основные состояния
const auth = useAuth();
const messages = ref([]);
const newMessage = ref('');
const messagesContainer = ref(null);
const userLanguage = ref('ru');
const isLoading = ref(false);
const isConnecting = ref(false);
const hasUserSentMessage = ref(getFromStorage('hasUserSentMessage') === 'true');
const codeCopied = ref(false);
const showWalletSidebar = ref(false);

// Объединяем состояния для Telegram аутентификации
const telegramAuth = ref({
  showVerification: false,
  verificationCode: '',
  botLink: '',
  checkInterval: null,
  error: ''
});

// Объединяем состояния для Email аутентификации
const emailAuth = ref({
  showForm: false,
  showVerification: false,
  email: '',
  verificationEmail: '',
  verificationCode: '',
  formatError: false,
  isLoading: false,
  isVerifying: false,
  error: ''
});

// Состояния для уведомлений
const notifications = ref({
  successMessage: '',
  showSuccess: false
});

// Состояния для пагинации и загрузки сообщений
const messageLoading = ref({
  isLoadingMore: false,
  hasMoreMessages: false,
  offset: 0,
  limit: 30,
  isInProgress: false,
  isLinkingGuest: false
});

// Состояние для балансов токенов
const tokenBalances = ref({
  eth: '0',
  bsc: '0',
  arbitrum: '0',
  polygon: '0'
});

// Переменная для хранения интервала обновления балансов
let balanceUpdateInterval = null;

// =====================================================================
// 3. ВЫЧИСЛЯЕМЫЕ СВОЙСТВА (COMPUTED)
// =====================================================================

/**
 * Вычисляет, аутентифицирован ли пользователь
 */
const isAuthenticated = computed(() => auth.isAuthenticated.value);

/**
 * Получает ID гостевой сессии из localStorage
 */
const guestIdValue = computed(() => {
  return getFromStorage('guestId', '');
});

/**
 * Фильтрует идентификаторы, чтобы не показывать дубликаты
 */
const filteredIdentities = computed(() => {
  if (!auth.identities || !auth.identities.value) return [];
  
  return auth.identities.value.filter(identity => {
    if (identity.provider === 'wallet' && auth.address?.value === identity.provider_id) {
      return false;
    }
    if (identity.provider === 'telegram' && auth.telegramId?.value === identity.provider_id) {
      return false;
    }
    if (identity.provider === 'email' && auth.email?.value === identity.provider_id) {
      return false;
    }
    return true;
  });
});

/**
 * Определяет, нужно ли загружать историю сообщений
 */
const shouldLoadHistory = computed(() => {
  return isAuthenticated.value || 
    (getFromStorage('guestId') && getFromStorage('guestId').length > 0);
});

/**
 * Форматирует названия провайдеров идентификации
 * @param {string} provider - Тип провайдера
 * @returns {string} - Форматированное название
 */
const formatIdentityProvider = (provider) => {
  const providers = {
    'wallet': 'Кошелек',
    'email': 'Email',
    'telegram': 'Telegram',
    'guest': 'Гость'
  };
  return providers[provider] || provider;
};

// =====================================================================
// 4. ФУНКЦИИ РАБОТЫ С СООБЩЕНИЯМИ
// =====================================================================

/**
 * Загружает сообщения пользователя из истории
 * @param {Object} options - Опции загрузки
 */
const loadMessages = async (options = {}) => {
  const { silent = false, initial = false, authType = null } = options;
  
  if (messageLoading.value.isLoadingMore && !initial) return;
  
  try {
    messageLoading.value.isLoadingMore = true;
    messageLoading.value.isInProgress = true;
    if (!silent) isLoading.value = true;
    
    console.log(`Загрузка истории сообщений${authType ? ` после ${authType} аутентификации` : ''}...`);
    
    // Если это загрузка после аутентификации, немного ждем для завершения привязки сообщений
    if (authType) {
      console.log(`Ожидание завершения привязки гостевых сообщений после ${authType} аутентификации...`);
      
      // Задержка для гарантии, что сервер успеет обработать сессию
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Дополнительно проверяем, что процесс связывания сообщений завершился
      if (messageLoading.value.isLinkingGuest) {
        await new Promise(resolve => {
          const checkInterval = setInterval(() => {
            if (!messageLoading.value.isLinkingGuest) {
              clearInterval(checkInterval);
              resolve();
            }
          }, 100);
          
          // Таймаут на всякий случай
          setTimeout(() => {
            clearInterval(checkInterval);
            resolve();
          }, 5000);
        });
      }
      
      console.log('Привязка сообщений завершена, загружаем историю...');
    }
    
    // Проверяем сессию перед загрузкой
    if (!initial) {
      try {
        const sessionCheck = await axios.get('/api/auth/check');
        if (!sessionCheck.data.authenticated && !shouldLoadHistory.value) {
          console.warn('Пользователь не аутентифицирован, пропускаем загрузку истории');
          messageLoading.value.isLoadingMore = false;
          messageLoading.value.isInProgress = false;
          isLoading.value = false;
          return;
        }
      } catch (error) {
        console.error('Ошибка при проверке сессии:', error);
        messageLoading.value.isLoadingMore = false;
        messageLoading.value.isInProgress = false;
        isLoading.value = false;
        return;
      }
    }
    
    // Запрашиваем общее количество сообщений
    const countResponse = await axios.get('/api/chat/history', {
      params: { count_only: true }
    });
    
    if (!countResponse.data.success) {
      throw new Error('Не удалось получить количество сообщений');
    }
    
    const totalMessages = countResponse.data.total || countResponse.data.count || 0;
    console.log(`Всего сообщений в истории: ${totalMessages}`);
    
    // Рассчитываем смещение для получения последних сообщений
    let effectiveOffset = messageLoading.value.offset;
    if (messageLoading.value.offset === 0 && totalMessages > messageLoading.value.limit) {
      effectiveOffset = Math.max(0, totalMessages - messageLoading.value.limit);
    }
    
    // Получаем историю сообщений
    const response = await axios.get('/api/chat/history', {
      params: {
        offset: effectiveOffset,
        limit: messageLoading.value.limit
      }
    });
    
    if (response.data.success) {
      // Если это первая загрузка или после аутентификации, заменяем сообщения
      if (messageLoading.value.offset === 0 || authType) {
        messages.value = response.data.messages || [];
        
        // Очищаем локальное хранилище гостевых сообщений после аутентификации
        if (authType) {
  removeFromStorage('guestMessages');
          removeFromStorage('guestId');
        }
      } else if (response.data.messages && response.data.messages.length) {
        // Иначе добавляем к существующим
        messages.value = [...messages.value, ...response.data.messages];
      }
      
      console.log(`Загружено ${messages.value.length} сообщений из истории`);
      
      // Обновляем смещение для следующей загрузки
      messageLoading.value.offset = effectiveOffset + (response.data.messages?.length || 0);
      
      // Проверяем, есть ли еще сообщения для загрузки
      messageLoading.value.hasMoreMessages = messageLoading.value.offset < totalMessages;
      
      // После загрузки сообщений считаем, что пользователь уже отправлял сообщения
      if (messages.value.length > 0) {
        hasUserSentMessage.value = true;
        setToStorage('hasUserSentMessage', 'true');
      }
      
      // Уведомляем о загрузке сообщений
      if (authType) {
        window.dispatchEvent(new CustomEvent('messages-updated', { 
          detail: { count: messages.value.length } 
        }));
      }
        
      // Прокручиваем к последнему сообщению
        await nextTick();
        scrollToBottom();
    }
  } catch (error) {
    console.error('Ошибка загрузки истории сообщений:', error);
  } finally {
    messageLoading.value.isLoadingMore = false;
    messageLoading.value.isInProgress = false;
    isLoading.value = false;
  }
};

/**
 * Обрабатывает отправку сообщения
 * @param {string} text - Текст сообщения
 */
const handleMessage = async (text) => {
  if (!text.trim()) return;
  
  try {
    // Создаем сообщение пользователя
    const userMessageContent = text.trim();
    const tempId = generateUniqueId();
    
    const userMessage = {
      id: tempId,
      content: userMessageContent,
      sender_type: 'user',
      role: 'user',
      isLocal: true,
      isGuest: !auth.isAuthenticated.value,
      timestamp: new Date().toISOString()
    };
    
    // Добавляем сообщение в чат
    messages.value.push(userMessage);
    
    // Очищаем поле ввода
    newMessage.value = '';
    
    // Прокручиваем к последнему сообщению
    scrollToBottom();
    
    // Устанавливаем состояние загрузки
    isLoading.value = true;
    
    try {
      if (auth.isAuthenticated.value) {
        // Отправляем сообщение как авторизованный пользователь
        const response = await axios.post('/api/chat/message', {
          message: userMessageContent,
          language: userLanguage.value
        });
        
        if (response.data.success) {
          // Обновляем ID сообщения пользователя
          const userMsgIndex = messages.value.findIndex(m => m.id === tempId);
          if (userMsgIndex !== -1) {
            messages.value[userMsgIndex].id = response.data.userMessage.id;
            messages.value[userMsgIndex].isLocal = false;
          }
          
          // Добавляем ответ ИИ
          messages.value.push({
            id: response.data.aiMessage.id,
            content: response.data.aiMessage.content,
            sender_type: 'assistant',
            role: 'assistant',
            timestamp: response.data.aiMessage.created_at
          });
          
          // Прокручиваем к последнему сообщению
          scrollToBottom();
        }
      } else {
        // Отправляем сообщение как гость
        console.log('Отправка гостевого сообщения:', userMessageContent);
        
        // Получаем или создаем идентификатор гостя
        let guestId = getFromStorage('guestId');
        if (!guestId) {
          guestId = generateUniqueId();
          setToStorage('guestId', guestId);
        }
        
        const response = await axios.post('/api/chat/guest-message', {
          content: userMessageContent,
          guestId,
          language: userLanguage.value
        });
        
        if (response.data.success) {
          console.log('Гостевое сообщение отправлено:', response.data);
          
          // Обновляем ID сообщения пользователя
          const userMsgIndex = messages.value.findIndex(m => m.id === tempId);
          if (userMsgIndex !== -1) {
            messages.value[userMsgIndex].id = response.data.messageId;
            messages.value[userMsgIndex].isLocal = false;
          }
          
          // Сохраняем сообщение в localStorage
          try {
            const storedMessages = JSON.parse(getFromStorage('guestMessages', '[]'));
            storedMessages.push({
              id: response.data.messageId,
              content: userMessageContent,
              sender_type: 'user',
              role: 'user',
              isGuest: true,
              timestamp: new Date().toISOString()
            });
            setToStorage('guestMessages', JSON.stringify(storedMessages));
            setToStorage('hasUserSentMessage', 'true');
            hasUserSentMessage.value = true;
          } catch (storageError) {
            console.error('Ошибка сохранения сообщения в localStorage:', storageError);
          }
          
          // Показываем правую панель, если она скрыта
          if (!showWalletSidebar.value) {
            showWalletSidebar.value = true;
              setToStorage('showWalletSidebar', 'true');
          }
        }
      }
    } catch (error) {
      console.error('Ошибка отправки сообщения:', error);
      
      // Помечаем сообщение как ошибочное
      const userMsgIndex = messages.value.findIndex(m => m.id === tempId);
      if (userMsgIndex !== -1) {
        messages.value[userMsgIndex].hasError = true;
      }
      
      // Добавляем сообщение об ошибке в чат
      messages.value.push({
        id: `error-${Date.now()}`,
        content: 'Произошла ошибка при отправке сообщения. Пожалуйста, попробуйте еще раз.',
        sender_type: 'system',
        role: 'system',
        timestamp: new Date().toISOString()
      });
      scrollToBottom();
    } finally {
      isLoading.value = false;
    }

    // После отправки сообщения возвращаем нормальный размер
    setTimeout(() => {
      const chatInput = document.querySelector('.chat-input');
      const chatMessages = document.querySelector('.chat-messages');
      if (chatInput) {
        chatInput.classList.remove('focused');
        if (!CSS.supports('selector(:has(div))') && chatMessages) {
          chatMessages.style.bottom = '135px';
        }
      }
    }, 100);
  } catch (error) {
    console.error('Непредвиденная ошибка в handleMessage:', error);
    isLoading.value = false;
  }
};

/**
 * Прокручивает контейнер с сообщениями к последнему сообщению
 */
const scrollToBottom = () => {
  if (messagesContainer.value) {
    setTimeout(() => {
      messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight;
    }, 100);
  }
};

/**
 * Очищает гостевые сообщения
 */
const clearGuestMessages = () => {
  removeFromStorage('guestMessages');
  console.log('Гостевые сообщения очищены');
  messages.value = messages.value.filter(m => !m.isGuest);
};

/**
 * Обрабатывает прокрутку контейнера с сообщениями
 */
const handleScroll = async () => {
  const element = messagesContainer.value;
  if (
    !messageLoading.value.isLoadingMore &&
    messageLoading.value.hasMoreMessages &&
    element.scrollTop === 0
  ) {
    await loadMessages();
  }
};

/**
 * Настраивает периодическую проверку новых сообщений
 * @param {number} initialCount - Начальное количество сообщений
 * @returns {Function} - Функция для очистки интервала
 */
const setupMessagePolling = (initialCount) => {
  console.log(`Настройка отслеживания сообщений с начальным количеством: ${initialCount}`);
  let messageCheckInterval;
  
  const clearMessagePolling = () => {
    if (messageCheckInterval) {
      clearInterval(messageCheckInterval);
      messageCheckInterval = null;
      console.log('Отслеживание сообщений остановлено');
    }
  };
  
  // Очищаем предыдущий интервал, если он существует
  clearMessagePolling();
  
  // Создаем новый интервал для проверки сообщений
  messageCheckInterval = setInterval(async () => {
    try {
      // Проверяем, есть ли новые сообщения
      const newCountResponse = await axios.get('/api/chat/history?count_only=true');
      
      if (newCountResponse.data.success) {
        const newCount = newCountResponse.data.count;
        console.log(`Проверка новых сообщений: ${newCount} / ${initialCount}`);
        
        if (newCount > initialCount) {
          console.log(`Обнаружены новые сообщения: ${newCount} > ${initialCount}`);
          
          // Загружаем обновленные сообщения
          await loadMessages({ silent: true });
            
            // Останавливаем интервал после получения ответа
            clearMessagePolling();
        }
      }
    } catch (error) {
      console.error('Ошибка при проверке новых сообщений:', error);
      clearMessagePolling();
    }
  }, 2000); // Проверяем каждые 2 секунды
  
  // Останавливаем интервал после 30 секунд в любом случае
  setTimeout(() => {
    clearMessagePolling();
  }, 30000);
  
  return clearMessagePolling;
};

// =====================================================================
// 5. ФУНКЦИИ АУТЕНТИФИКАЦИИ
// =====================================================================

/**
 * Обрабатывает аутентификацию через кошелек
 */
const handleWalletAuth = async () => {
  if (isConnecting.value) return;
  
  isConnecting.value = true;
  try {
    const result = await connectWithWallet();
    console.log('Результат подключения кошелька:', result);
    
    if (result.success) {
      if (auth.isAuthenticated.value) {
        // Если пользователь уже авторизован, связываем кошелек с существующим аккаунтом
        console.log('Связывание кошелька с существующим аккаунтом:', result.address);
        const linkResult = await auth.linkIdentity('wallet', result.address);
        
        if (linkResult.success) {
          notifications.value.successMessage = 'Кошелек успешно подключен к вашему аккаунту!';
          notifications.value.showSuccess = true;
          
          // Скрываем сообщение через 3 секунды
          setTimeout(() => {
            notifications.value.showSuccess = false;
          }, 3000);
          
          // Обновляем данные авторизации и балансы
          await auth.checkAuth();
          startBalanceUpdates();
        } else {
          notifications.value.errorMessage = linkResult.error || 'Не удалось подключить кошелек';
          notifications.value.showError = true;
          
          // Скрываем сообщение через 3 секунды
          setTimeout(() => {
            notifications.value.showError = false;
          }, 3000);
        }
      } else {
        // Если пользователь не авторизован, выполняем обычную авторизацию через кошелек
        const authResponse = await auth.checkAuth();
        
        if (authResponse.authenticated && authResponse.authType === 'wallet') {
          console.log('Кошелёк успешно подключен и аутентифицирован');
          
          // Загружаем сообщения после аутентификации
          await loadMessages({ authType: 'wallet' });
          
          // Запускаем обновление балансов
          startBalanceUpdates();
        }
      }
      
      // Небольшая задержка перед сбросом состояния
      setTimeout(() => {
        isConnecting.value = false;
      }, 500);
      return;
    } else {
      console.error('Не удалось подключить кошелёк:', result.error);
    }
  } catch (error) {
    console.error('Ошибка при подключении кошелька:', error);
  }
  
  isConnecting.value = false;
};

/**
 * Обрабатывает аутентификацию через Telegram
 */
const handleTelegramAuth = async () => {
  try {
    // Показываем окно верификации
    telegramAuth.value.showVerification = true;
    telegramAuth.value.error = '';
    
    // Инициализируем процесс аутентификации через Telegram
    const response = await axios.post('/api/auth/telegram/init');
    
    if (response.data.success) {
      telegramAuth.value.verificationCode = response.data.verificationCode;
      telegramAuth.value.botLink = response.data.botLink;
      
      // Создаем интервал для проверки состояния авторизации
      telegramAuth.value.checkInterval = setInterval(async () => {
        try {
          const checkResponse = await auth.checkAuth();
          
          // Получаем Telegram ID из проверки аутентификации
          const telegramId = checkResponse.telegramId;
          
          if (auth.isAuthenticated.value && telegramId) {
            if (auth.authType.value !== 'telegram') {
              // Если пользователь авторизован не через Telegram, связываем идентификаторы
              console.log('Связывание Telegram с существующим аккаунтом:', telegramId);
              const linkResult = await auth.linkIdentity('telegram', telegramId);
              
              if (linkResult.success) {
                notifications.value.successMessage = 'Telegram успешно подключен к вашему аккаунту!';
                notifications.value.showSuccess = true;
                
                setTimeout(() => {
                  notifications.value.showSuccess = false;
                }, 3000);
              } else {
                notifications.value.errorMessage = linkResult.error || 'Не удалось подключить Telegram';
                notifications.value.showError = true;
                
                setTimeout(() => {
                  notifications.value.showError = false;
                }, 3000);
              }
            } else {
              // Если новая аутентификация через Telegram
              console.log('Telegram аутентификация успешна');
              
              // Загружаем сообщения после аутентификации
              await loadMessages({ authType: 'telegram' });
            }
            
            // Очищаем интервал и скрываем окно верификации
            clearTelegramInterval();
            telegramAuth.value.showVerification = false;
            telegramAuth.value.verificationCode = '';
          }
        } catch (error) {
          console.error('Ошибка при проверке аутентификации:', error);
        }
      }, 2000); // Проверяем каждые 2 секунды
    } else {
      telegramAuth.value.error = response.data.error || 'Ошибка при инициализации авторизации Telegram';
      telegramAuth.value.showVerification = false;
    }
  } catch (error) {
    console.error('Ошибка инициализации Telegram аутентификации:', error);
    telegramAuth.value.error = 'Произошла ошибка при инициализации аутентификации через Telegram';
    telegramAuth.value.showVerification = false;
  }
};

/**
 * Очищает интервал проверки Telegram аутентификации
 */
const clearTelegramInterval = () => {
  if (telegramAuth.value.checkInterval) {
    clearInterval(telegramAuth.value.checkInterval);
    telegramAuth.value.checkInterval = null;
    console.log('Интервал проверки Telegram авторизации очищен');
  }
};

/**
 * Отменяет процесс аутентификации через Telegram
 */
const cancelTelegramAuth = () => {
  clearTelegramInterval();
  telegramAuth.value.showVerification = false;
  telegramAuth.value.verificationCode = '';
  telegramAuth.value.error = '';
  
  console.log('Аутентификация Telegram отменена пользователем');
};

/**
 * Инициирует процесс аутентификации через Email
 */
const handleEmailAuth = async () => {
  try {
    console.log('Начало процесса аутентификации через Email');
    
    // Показываем форму для ввода email
    emailAuth.value.showForm = true;
    emailAuth.value.showVerification = false;
    
    // Очищаем поля и ошибки
    emailAuth.value.email = '';
    emailAuth.value.formatError = false;
    emailAuth.value.error = '';
    
    console.log('Форма Email отображена');
  } catch (error) {
    console.error('Ошибка инициализации Email аутентификации:', error);
  }
};

/**
 * Отправляет запрос на верификацию Email
 */
const sendEmailVerification = async () => {
  try {
    emailAuth.value.formatError = false;
    emailAuth.value.error = '';
    
    // Проверяем формат email
    if (!emailAuth.value.email || !emailAuth.value.email.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) {
      emailAuth.value.formatError = true;
      return;
    }
    
    emailAuth.value.isLoading = true;
    
    // Отправляем запрос для инициализации email аутентификации
    const response = await axios.post('/api/auth/email/init', { email: emailAuth.value.email });
    
    console.log('Ответ инициализации Email:', response.data);
    
    if (response.data.success) {
      // Переключаем отображение формы
      emailAuth.value.showForm = false;
      emailAuth.value.showVerification = true;
      emailAuth.value.verificationEmail = emailAuth.value.email;
      emailAuth.value.verificationCode = '';
      
      console.log('Отображаем форму ввода кода верификации для email:', emailAuth.value.verificationEmail);
    } else {
      emailAuth.value.error = response.data.error || 'Ошибка инициализации аутентификации по email';
      emailAuth.value.showForm = true;
      emailAuth.value.showVerification = false;
    }
  } catch (error) {
    console.error('Ошибка при запросе инициализации Email:', error);
    if (error.response && error.response.data && error.response.data.error) {
      emailAuth.value.error = error.response.data.error;
    } else {
      emailAuth.value.error = 'Ошибка при запросе кода подтверждения';
    }
    emailAuth.value.showForm = true;
    emailAuth.value.showVerification = false;
  } finally {
    emailAuth.value.isLoading = false;
  }
};

/**
 * Проверяет введенный код верификации Email
 */
const verifyEmailCode = async () => {
  try {
    emailAuth.value.error = '';
    
    if (!emailAuth.value.verificationCode) {
      emailAuth.value.error = 'Пожалуйста, введите код верификации';
      return;
    }
    
    emailAuth.value.isVerifying = true;
    
    const response = await axios.post('/api/auth/email/verify-code', {
      email: emailAuth.value.verificationEmail,
      code: emailAuth.value.verificationCode
    });
    
    if (response.data.success) {
      // Сбрасываем состояния форм email
      emailAuth.value.showForm = false;
      emailAuth.value.showVerification = false;
      
      // Получаем текущее состояние аутентификации
      const authResponse = await auth.checkAuth();
      
      if (auth.isAuthenticated.value && emailAuth.value.verificationEmail) {
        // Если пользователь уже авторизован, связываем email
        if (auth.authType.value !== 'email') {
          console.log('Связывание Email с существующим аккаунтом:', emailAuth.value.verificationEmail);
          const linkResult = await auth.linkIdentity('email', emailAuth.value.verificationEmail);
          
          if (linkResult.success) {
            // Показываем сообщение об успехе
            notifications.value.successMessage = `Email ${emailAuth.value.verificationEmail} успешно подключен к вашему аккаунту!`;
            notifications.value.showSuccess = true;
            
            // Скрываем сообщение через 3 секунды
            setTimeout(() => {
              notifications.value.showSuccess = false;
            }, 3000);
          } else {
            notifications.value.errorMessage = linkResult.error || 'Не удалось подключить Email';
            notifications.value.showError = true;
            
            setTimeout(() => {
              notifications.value.showError = false;
            }, 3000);
          }
        } else {
          // Показываем сообщение об успехе
          notifications.value.successMessage = `Email ${emailAuth.value.verificationEmail} успешно подтвержден!`;
          notifications.value.showSuccess = true;
          
          // Скрываем сообщение через 3 секунды
          setTimeout(() => {
            notifications.value.showSuccess = false;
          }, 3000);
          
          // Загружаем сообщения после аутентификации
          await loadMessages({ authType: 'email' });
        }
      } else {
        // Если пользователь не был авторизован до этого
        // Показываем сообщение об успехе
        notifications.value.successMessage = `Email ${emailAuth.value.verificationEmail} успешно подтвержден!`;
        notifications.value.showSuccess = true;
        
        // Скрываем сообщение через 3 секунды
        setTimeout(() => {
          notifications.value.showSuccess = false;
        }, 3000);
        
        // Загружаем сообщения после аутентификации
        await loadMessages({ authType: 'email' });
      }
    } else {
      emailAuth.value.error = response.data.message || 'Неверный код верификации';
    }
  } catch (error) {
    if (error.response && error.response.status === 400) {
      emailAuth.value.error = error.response.data.error || 'Неверный код верификации';
    } else {
      emailAuth.value.error = 'Ошибка при проверке кода';
      console.error('Ошибка проверки кода Email:', error);
    }
  } finally {
    emailAuth.value.isVerifying = false;
  }
};

/**
 * Отменяет процесс аутентификации через Email
 */
const cancelEmailAuth = () => {
  emailAuth.value.showForm = false;
  emailAuth.value.showVerification = false;
  emailAuth.value.email = '';
  emailAuth.value.verificationCode = '';
  emailAuth.value.error = '';
  emailAuth.value.formatError = false;
};

/**
 * Выполняет выход из аккаунта
 */
const disconnectWallet = async () => {
  try {
    console.log('Выполняется выход из системы...');
    
    // Останавливаем обновление балансов
    stopBalanceUpdates();
    
    // Отправляем запрос на выход
    await axios.post('/api/auth/logout');
    
    // Обновляем состояние аутентификации локально
    auth.isAuthenticated.value = false;
    auth.address.value = null;
    auth.authType.value = null;
    auth.telegramId.value = null;
    auth.email.value = null;
    
    // Обновляем отображение UI
    document.body.classList.remove('wallet-connected');
    
    // Очищаем сообщения и состояния
    messages.value = [];
    messageLoading.value.offset = 0;
    messageLoading.value.hasMoreMessages = true;
    
    // Очищаем localStorage
    removeFromStorage('guestMessages');
    removeFromStorage('hasUserSentMessage');
    
    console.log('Выход из системы выполнен успешно');
  } catch (error) {
    console.error('Ошибка при выходе из системы:', error);
  }
};

/**
 * Проверяет наличие идентификатора определенного типа
 * @param {string} type - Тип идентификатора
 * @returns {boolean} - Имеется ли идентификатор
 */
const hasIdentityType = (type) => {
  if (!auth.identities?.value) return false;
  return auth.identities.value.some(identity => identity.provider === type);
};

/**
 * Получает значение идентификатора определенного типа
 * @param {string} type - Тип идентификатора
 * @returns {string|null} - Значение идентификатора
 */
const getIdentityValue = (type) => {
  if (!auth.identities?.value) return null;
  const identity = auth.identities.value.find(identity => identity.provider === type);
  return identity ? identity.provider_id : null;
};

/**
 * Отслеживает изменения в аутентификации
 */
const watchAuthChanges = () => {
  watch(() => auth.isAuthenticated.value, async (newValue, oldValue) => {
    console.log('Изменение аутентификации:', { 
      from: oldValue, 
      to: newValue, 
      userId: auth.userId.value, 
      authType: auth.authType.value 
    });
    
    // Обновляем отображение аутентификации
    updateAuthDisplay({
      isAuthenticated: auth.isAuthenticated.value,
      authType: auth.authType.value,
      address: auth.address.value,
      email: auth.email.value,
      telegramId: auth.telegramId.value,
      telegramUsername: auth.telegramUsername
    });
    
    if (newValue && !oldValue) {
      // Пользователь только что аутентифицировался
      console.log(`Пользователь аутентифицирован через ${auth.authType.value}`);
      await loadMessages({ authType: auth.authType.value });
    } else if (!newValue && oldValue) {
      // Пользователь вышел из системы
      console.log('Пользователь вышел, сбрасываем сообщения');
      messages.value = [];
      messageLoading.value.offset = 0;
      messageLoading.value.hasMoreMessages = true;
    }
  }, { immediate: true });
};

/**
 * Обновляет отображение аутентификации в интерфейсе
 * @param {Object} state - Состояние аутентификации
 */
const updateAuthDisplay = (state) => {
  console.log('Обновление отображения аутентификации:', state);
  
  if (state.isAuthenticated) {
    const authTypeLabels = {
      'wallet': 'Кошелек',
      'email': 'Email',
      'telegram': 'Telegram'
    };
    
    let authLabel = authTypeLabels[state.authType] || 'Аккаунт';
    let authValue = '';
    
    if (state.authType === 'wallet' && state.address) {
      authValue = truncateAddress(state.address);
      document.body.classList.add('wallet-connected');
    } else if (state.authType === 'email' && state.email) {
      authValue = state.email;
    } else if (state.authType === 'telegram' && state.telegramUsername) {
      authValue = state.telegramUsername;
    } else if (state.authType === 'telegram' && state.telegramId) {
      authValue = `ID: ${state.telegramId}`;
    }
    
    // Обновляем элементы интерфейса
    const authDisplayEl = document.getElementById('auth-display');
    if (authDisplayEl) {
      authDisplayEl.innerHTML = `${authLabel}: <strong>${authValue}</strong>`;
      authDisplayEl.style.display = 'inline-block';
    }
    
    const authButtonsEl = document.getElementById('auth-buttons');
    if (authButtonsEl) {
      authButtonsEl.style.display = 'none';
    }
    
    const logoutButtonEl = document.getElementById('logout-button');
    if (logoutButtonEl) {
      logoutButtonEl.style.display = 'inline-block';
    }
  } else {
    document.body.classList.remove('wallet-connected');
    
    const authDisplayEl = document.getElementById('auth-display');
    if (authDisplayEl) {
      authDisplayEl.style.display = 'none';
    }
    
    const authButtonsEl = document.getElementById('auth-buttons');
    if (authButtonsEl) {
      authButtonsEl.style.display = 'inline-block';
    }
    
    const logoutButtonEl = document.getElementById('logout-button');
    if (logoutButtonEl) {
      logoutButtonEl.style.display = 'none';
    }
  }
};

// =====================================================================
// 6. ФУНКЦИИ УПРАВЛЕНИЯ БАЛАНСАМИ
// =====================================================================

/**
 * Обновляет балансы токенов
 */
const updateBalances = async () => {
  if (auth.isAuthenticated.value && auth.address?.value) {
    try {
      console.log('Запрос балансов для адреса:', auth.address.value);
      const balances = await fetchTokenBalances();
      console.log('Полученные балансы:', balances);
      
      // Обновляем каждый баланс отдельно для реактивности
      tokenBalances.value = {
        eth: balances.eth || '0',
        bsc: balances.bsc || '0',
        arbitrum: balances.arbitrum || '0',
        polygon: balances.polygon || '0'
      };
      
      console.log('Обновленные балансы в интерфейсе:', tokenBalances.value);
  } catch (error) {
      console.error('Ошибка при обновлении балансов:', error);
    }
  } else {
    console.log('Пользователь не аутентифицирован или адрес не доступен');
  }
};

/**
 * Запускает периодическое обновление балансов
 */
const startBalanceUpdates = () => {
  // Обновляем балансы сразу
  updateBalances();
  
  // Обновляем балансы каждые 5 минут
  balanceUpdateInterval = setInterval(updateBalances, 300000);
};

/**
 * Останавливает периодическое обновление балансов
 */
const stopBalanceUpdates = () => {
  if (balanceUpdateInterval) {
    clearInterval(balanceUpdateInterval);
    balanceUpdateInterval = null;
  }
};

/**
 * Копирует код верификации в буфер обмена
 * @param {string} code - Код для копирования
 */
const copyCode = (code) => {
  navigator.clipboard.writeText(code).then(() => {
    codeCopied.value = true;
    setTimeout(() => {
      codeCopied.value = false;
    }, 2000);
  });
};

/**
 * Переключает отображение боковой панели
 */
const toggleWalletSidebar = () => {
  showWalletSidebar.value = !showWalletSidebar.value;
  setToStorage('showWalletSidebar', showWalletSidebar.value.toString());
};

/**
 * Обрабатывает получение фокуса полем ввода
 */
const handleFocus = () => {
  const chatInput = document.querySelector('.chat-input');
  const chatMessages = document.querySelector('.chat-messages');
  if (chatInput) {
    chatInput.classList.add('focused');
    if (!CSS.supports('selector(:has(div))') && chatMessages) {
      chatMessages.style.bottom = '235px';
    }
  }
};

/**
 * Обрабатывает потерю фокуса полем ввода
 */
const handleBlur = () => {
  // Если сообщение непустое, оставляем расширенный вид
  if (!newMessage.value.trim()) {
    const chatInput = document.querySelector('.chat-input');
    const chatMessages = document.querySelector('.chat-messages');
    if (chatInput) {
      chatInput.classList.remove('focused');
      if (!CSS.supports('selector(:has(div))') && chatMessages) {
        chatMessages.style.bottom = '135px';
      }
    }
  }
};

// =====================================================================
// 7. НАБЛЮДАТЕЛИ (WATCHERS)
// =====================================================================

// Наблюдаем за изменением адреса кошелька для обновления балансов
watch(() => auth.address?.value, (newAddress) => {
  if (newAddress) {
    console.log('Адрес кошелька изменился, обновляем балансы');
    updateBalances();
  }
});

// Наблюдаем за изменениями в сообщениях для сортировки и прокрутки
watch(() => messages.value.length, (newLength) => {
  if (newLength > 0) {
    // Сортируем сообщения по дате/времени
    messages.value.sort((a, b) => {
      const dateA = new Date(a.timestamp || a.created_at);
      const dateB = new Date(b.timestamp || b.created_at);
      return dateA - dateB;
    });
    
    // Прокручиваем к последнему сообщению
    nextTick(() => {
      scrollToBottom();
    });
  }
});

// =====================================================================
// 8. ЖИЗНЕННЫЙ ЦИКЛ КОМПОНЕНТА
// =====================================================================

// При монтировании компонента
onMounted(async () => {
  console.log('HomeView.vue: компонент загружен');
  
  // Проверяем состояние аутентификации
  console.log('Состояние аутентификации при загрузке:', {
    isAuthenticated: auth.isAuthenticated.value,
    authType: auth.authType.value,
    telegramId: auth.telegramId.value
  });

  // Загружаем сохраненное состояние боковой панели
  const savedSidebarState = getFromStorage('showWalletSidebar');
  if (savedSidebarState !== null) {
    showWalletSidebar.value = savedSidebarState === 'true';
  } else {
    // По умолчанию показываем панель
    showWalletSidebar.value = true;
    setToStorage('showWalletSidebar', 'true');
  }
  
  // Запускаем отслеживание изменений аутентификации
  watchAuthChanges();
  
  // Устанавливаем обработчик скролла
  if (messagesContainer.value) {
    messagesContainer.value.addEventListener('scroll', handleScroll);
  }
  
  // Загружаем историю сообщений
  if (shouldLoadHistory.value) {
    // Проверяем сессию пользователя
    const { data: sessionData } = await api.get('/api/auth/check');
    console.log('Проверка сессии:', sessionData);
    
    if (!isAuthenticated.value && !sessionData.authenticated) {
      // Загружаем гостевые сообщения из localStorage
      try {
        const storedMessages = getFromStorage('guestMessages');
        if (storedMessages) {
          const parsedMessages = JSON.parse(storedMessages);
          if (parsedMessages.length > 0) {
            console.log(`Найдено ${parsedMessages.length} сохраненных гостевых сообщений`);
            
            // Если пользователь не аутентифицирован, добавляем гостевые сообщения
            if (!isAuthenticated.value) {
              messages.value = [...messages.value, ...parsedMessages];
              hasUserSentMessage.value = true;
              setToStorage('hasUserSentMessage', 'true');
            } else {
              // Если пользователь аутентифицирован, удаляем гостевые сообщения
              removeFromStorage('guestMessages');
            }
          }
        }
      } catch (e) {
        console.error('Ошибка загрузки сообщений из localStorage:', e);
      }
    }
    
    // Загружаем историю сообщений, если пользователь аутентифицирован
    if (isAuthenticated.value) {
      await loadMessages({ initial: true });
    }
  }
  
  // Добавляем слушатель события для загрузки истории чата
  window.addEventListener('load-chat-history', () => loadMessages({ initial: true }));
  
  // Установка статуса отправленных сообщений
  if (messages.value.length > 0) {
    hasUserSentMessage.value = true;
    setToStorage('hasUserSentMessage', 'true');
  }
  
  // Проверяем аутентификацию для запуска обновления балансов
  const cachedAuth = localStorage.getItem('authData');
  if (!cachedAuth) {
    const { data: sessionData } = await api.get('/api/auth/check');
    
    if (sessionData.authenticated && sessionData.authType === 'wallet') {
      // Запускаем обновление балансов
      startBalanceUpdates();
    }
  } else {
    // Используем кэшированные данные
    const authData = JSON.parse(cachedAuth);
    if (authData.authenticated && authData.authType === 'wallet') {
      startBalanceUpdates();
    }
  }
  
  // Прокручиваем к последнему сообщению
  scrollToBottom();
});

// При размонтировании компонента
onBeforeUnmount(() => {
  // Очищаем обработчик скролла
  if (messagesContainer.value) {
    messagesContainer.value.removeEventListener('scroll', handleScroll);
  }
  
  // Удаляем слушатель события загрузки истории чата
  window.removeEventListener('load-chat-history', () => loadMessages({ initial: true }));
  
  // Останавливаем обновление балансов
  stopBalanceUpdates();

  // Очищаем интервал проверки Telegram
  clearTelegramInterval();
});
</script>