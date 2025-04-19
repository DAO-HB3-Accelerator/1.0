<template>
  <div class="telegram-connect">
    <div v-if="!showQR" class="intro">
      <p>Подключите свой аккаунт Telegram для быстрой авторизации</p>
      <button @click="startConnection" class="connect-button" :disabled="loading">
        <span class="telegram-icon">📱</span>
        {{ loading ? 'Загрузка...' : 'Подключить Telegram' }}
      </button>
    </div>

    <div v-else class="qr-section">
      <p>Отсканируйте QR-код в приложении Telegram</p>
      <div class="qr-container" v-html="qrCode"></div>
      <p class="or-divider">или</p>
      <a :href="botLink" target="_blank" class="bot-link">
        Открыть бота в Telegram
      </a>
      <button @click="resetConnection" class="reset-button">
        Отмена
      </button>
    </div>

    <div v-if="error" class="error">{{ error }}</div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue';
import axios from '@/api/axios';
import { useAuth } from '@/composables/useAuth';
import QRCode from 'qrcode';

const emit = defineEmits(['close']);
const { linkIdentity } = useAuth();

const loading = ref(false);
const error = ref('');
const showQR = ref(false);
const qrCode = ref('');
const botLink = ref('');
const pollInterval = ref(null);
const connectionToken = ref('');

const startConnection = async () => {
  try {
    loading.value = true;
    error.value = '';
    
    const response = await axios.post('/api/auth/telegram/start-connection');
    
    if (response.data.success) {
      connectionToken.value = response.data.token;
      botLink.value = `https://t.me/${response.data.botUsername}?start=${connectionToken.value}`;
      
      // Генерируем QR-код
      const qr = await QRCode.toDataURL(botLink.value);
      qrCode.value = `<img src="${qr}" alt="Telegram QR Code" />`;
      
      showQR.value = true;
      startPolling();
    } else {
      error.value = response.data.error || 'Не удалось начать процесс подключения';
    }
  } catch (err) {
    error.value = err.response?.data?.error || 'Ошибка при подключении Telegram';
  } finally {
    loading.value = false;
  }
};

const checkConnection = async () => {
  try {
    const response = await axios.post('/api/auth/telegram/check-connection', {
      token: connectionToken.value
    });
    
    if (response.data.success && response.data.telegramId) {
      // Связываем Telegram с текущим пользователем
      await linkIdentity('telegram', response.data.telegramId);
      stopPolling();
      emit('close');
    }
  } catch (error) {
    console.error('Error checking connection:', error);
  }
};

const startPolling = () => {
  pollInterval.value = setInterval(checkConnection, 2000);
};

const stopPolling = () => {
  if (pollInterval.value) {
    clearInterval(pollInterval.value);
    pollInterval.value = null;
  }
};

const resetConnection = () => {
  stopPolling();
  showQR.value = false;
  error.value = '';
  qrCode.value = '';
  botLink.value = '';
  connectionToken.value = '';
};

onUnmounted(() => {
  stopPolling();
});
</script>

<style scoped>
.telegram-connect {
  padding: 20px;
  max-width: 400px;
}

.intro,
.qr-section {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 15px;
  text-align: center;
}

.connect-button {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 10px 20px;
  background-color: #0088cc;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 16px;
  transition: background-color 0.2s;
}

.connect-button:hover:not(:disabled) {
  background-color: #0077b5;
}

.telegram-icon {
  margin-right: 10px;
  font-size: 18px;
}

.qr-container {
  background: white;
  padding: 10px;
  border-radius: 8px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

.qr-container img {
  max-width: 200px;
  height: auto;
}

.or-divider {
  color: #666;
  margin: 10px 0;
}

.bot-link {
  color: #0088cc;
  text-decoration: none;
  padding: 8px 16px;
  border: 1px solid #0088cc;
  border-radius: 4px;
  transition: all 0.2s;
}

.bot-link:hover {
  background-color: #0088cc;
  color: white;
}

.reset-button {
  padding: 8px 16px;
  background-color: #e2e8f0;
  color: #4a5568;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  transition: background-color 0.2s;
}

.reset-button:hover {
  background-color: #cbd5e0;
}

.error {
  color: #e53e3e;
  margin-top: 10px;
  text-align: center;
}

button:disabled {
  opacity: 0.7;
  cursor: not-allowed;
}
</style>

