<template>
  <div class="telegram-connect">
    <p>Подключите свой аккаунт Telegram для быстрой авторизации.</p>
    <button @click="connectTelegram" class="connect-button">
      <span class="telegram-icon">📱</span> Подключить Telegram
    </button>
    
    <div v-if="loading" class="loading">Загрузка...</div>
    <div v-if="error" class="error">{{ error }}</div>
    <div v-if="success" class="success">{{ success }}</div>
  </div>
</template>

<script setup>
import { ref } from 'vue';
import axios from 'axios';

const loading = ref(false);
const error = ref('');
const success = ref('');

async function connectTelegram() {
  try {
    loading.value = true;
    error.value = '';
    success.value = '';
    
    // Запрос на получение ссылки для авторизации через Telegram
    const response = await axios.get('/api/auth/telegram', {
      withCredentials: true
    });
    
    if (response.data.error) {
      error.value = `Ошибка при подключении Telegram: ${response.data.error}`;
      return;
    }
    
    if (response.data.authUrl) {
      success.value = 'Перейдите по ссылке для авторизации через Telegram';
      window.open(response.data.authUrl, '_blank');
    } else {
      error.value = 'Не удалось получить ссылку для авторизации';
    }
  } catch (err) {
    console.error('Error connecting Telegram:', err);
    error.value = 'Ошибка при подключении Telegram';
  } finally {
    loading.value = false;
  }
}
</script>

<style scoped>
.telegram-connect {
  display: flex;
  flex-direction: column;
  gap: 15px;
}

.connect-button {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 10px 15px;
  background-color: #0088cc;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 16px;
  transition: background-color 0.2s;
}

.connect-button:hover {
  background-color: #0077b5;
}

.telegram-icon {
  margin-right: 10px;
  font-size: 18px;
}

.loading, .error, .success {
  padding: 10px;
  border-radius: 4px;
}

.loading {
  background-color: #f8f9fa;
}

.error {
  background-color: #f8d7da;
  color: #721c24;
}

.success {
  background-color: #d4edda;
  color: #155724;
}
</style>

