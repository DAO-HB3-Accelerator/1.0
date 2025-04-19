<template>
  <div class="chat-view">
    <div class="chat-container">
      <h2>Чат с ИИ-ассистентом</h2>
      <div class="chat-messages" ref="chatMessages">
        <div
          v-for="(message, index) in messages"
          :key="index"
          :class="['message', message.sender === 'user' ? 'user-message' : 'ai-message']"
        >
          <div class="message-content" v-html="message.text"></div>
          <div class="message-time">{{ formatTime(message.timestamp) }}</div>
        </div>
      </div>

      <div class="chat-input">
        <textarea
          v-model="userInput"
          placeholder="Введите ваше сообщение..."
          @keydown.enter.prevent="sendMessage"
        ></textarea>
        <button class="send-btn" @click="sendMessage" :disabled="!userInput.trim() || isLoading">
          {{ isLoading ? 'Отправка...' : 'Отправить' }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, watch, nextTick } from 'vue';
import axios from 'axios';
import { useAuthStore } from '../stores/auth';

const userInput = ref('');
const messages = ref([
  {
    sender: 'ai',
    text: 'Привет! Я ИИ-ассистент DApp for Business. Чем я могу помочь вам сегодня?',
    timestamp: new Date(),
  },
]);
const chatMessages = ref(null);
const isLoading = ref(false);
const authStore = useAuthStore();

// Прокрутка чата вниз при добавлении новых сообщений
watch(
  messages,
  () => {
    nextTick(() => {
      if (chatMessages.value) {
        chatMessages.value.scrollTop = chatMessages.value.scrollHeight;
      }
    });
  },
  { deep: true }
);

// Проверка прав администратора
onMounted(async () => {
  if (authStore.isAdmin) {
    messages.value.push({
      sender: 'ai',
      text: 'Вы имеете права администратора.',
      timestamp: new Date(),
    });
  } else {
    messages.value.push({
      sender: 'ai',
      text: 'У вас нет прав администратора.',
      timestamp: new Date(),
    });
  }
});

// Функция для отправки сообщения
async function sendMessage() {
  if (!userInput.value.trim() || isLoading.value) return;

  // Добавляем сообщение пользователя в чат
  const userMessage = userInput.value.trim();
  messages.value.push({
    sender: 'user',
    text: userMessage,
    timestamp: new Date(),
  });

  userInput.value = '';
  isLoading.value = true;

  try {
    console.log('Отправка сообщения:', userMessage);
    
    // Отправляем запрос к API
    const response = await axios.post(
      '/api/chat/message',
      {
        message: userMessage,
        language: 'ru', // Укажите язык, если необходимо
      },
      {
        withCredentials: true, // Важно для передачи куков
      }
    );

    console.log('Ответ от сервера:', response.data);

    // Добавляем ответ от ИИ в чат
    messages.value.push({
      sender: 'ai',
      text: response.data.reply || 'Извините, я не смог обработать ваш запрос.',
      timestamp: new Date(),
    });
  } catch (error) {
    console.error('Error sending message:', error);
    messages.value.push({
      sender: 'ai',
      text: 'Извините, произошла ошибка при обработке вашего запроса. Пожалуйста, попробуйте позже.',
      timestamp: new Date(),
    });
  } finally {
    isLoading.value = false;
  }
}

// Функция для форматирования времени
function formatTime(timestamp) {
  if (!timestamp) return '';

  const date = new Date(timestamp);
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
</script>

<style scoped>
.chat-view {
  height: 100%;
  display: flex;
  flex-direction: column;
  padding: 1rem;
}

.chat-container {
  flex: 1;
  display: flex;
  flex-direction: column;
  background-color: white;
  border-radius: 8px;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
  overflow: hidden;
  max-width: 800px;
  margin: 0 auto;
  width: 100%;
}

h2 {
  padding: 1rem;
  margin: 0;
  border-bottom: 1px solid #eee;
  font-size: 1.5rem;
  color: #333;
}

.chat-messages {
  flex: 1;
  overflow-y: auto;
  padding: 1rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
  min-height: 400px;
}

.message {
  max-width: 80%;
  padding: 0.75rem 1rem;
  border-radius: 8px;
  position: relative;
}

.user-message {
  align-self: flex-end;
  background-color: #e3f2fd;
  color: #0d47a1;
}

.ai-message {
  align-self: flex-start;
  background-color: #f5f5f5;
  color: #333;
}

.message-content {
  word-break: break-word;
}

.message-time {
  font-size: 0.75rem;
  color: #999;
  margin-top: 0.25rem;
  text-align: right;
}

.chat-input {
  display: flex;
  padding: 1rem;
  border-top: 1px solid #eee;
  background-color: white;
}

textarea {
  flex: 1;
  padding: 0.75rem;
  border: 1px solid #ddd;
  border-radius: 4px;
  resize: none;
  height: 60px;
  font-family: inherit;
  font-size: 1rem;
}

.send-btn {
  margin-left: 0.5rem;
  padding: 0 1.5rem;
  background-color: #1976d2;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 1rem;
  transition: background-color 0.2s;
}

.send-btn:hover {
  background-color: #1565c0;
}

.send-btn:disabled {
  background-color: #ccc;
  cursor: not-allowed;
}
</style>
