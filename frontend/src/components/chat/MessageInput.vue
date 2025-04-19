<template>
  <div class="message-input">
    <textarea
      v-model="message"
      placeholder="Введите сообщение..."
      @keydown.enter.prevent="handleEnter"
      ref="textareaRef"
      :disabled="sending"
    ></textarea>

    <button @click="sendMessage" class="send-button" :disabled="!message.trim() || sending">
      <span v-if="sending">Отправка...</span>
      <span v-else>Отправить</span>
    </button>
  </div>
</template>

<script setup>
import { ref, defineEmits, nextTick } from 'vue';
import axios from 'axios';

const props = defineProps({
  conversationId: {
    type: [Number, String],
    required: true,
  },
});

const emit = defineEmits(['message-sent']);
const message = ref('');
const sending = ref(false);
const textareaRef = ref(null);

// Обработка нажатия Enter
const handleEnter = (event) => {
  // Если нажат Shift+Enter, добавляем перенос строки
  if (event.shiftKey) {
    return;
  }

  // Иначе отправляем сообщение
  sendMessage();
};

// Отправка сообщения
const sendMessage = async () => {
  const messageText = message.value.trim();
  if (!messageText) return;

  const userMessage = {
    id: Date.now(),
    content: messageText,
    role: auth.isAuthenticated ? 'user' : 'guest',
    timestamp: new Date().toISOString()
  };

  messages.value.push(userMessage);

  try {
    // Логируем параметры запроса
    console.log('Sending message to Ollama:', {
      message: messageText,
      language: userLanguage.value
    });

    const response = await axios.post('/api/chat/message', {
      message: messageText,
      language: userLanguage.value
    });

    // Логируем ответ от Ollama
    console.log('Response from Ollama:', response.data);

    // Обработка ответа
    messages.value.push({
      id: Date.now() + 1,
      content: response.data.message,
      role: 'assistant',
      timestamp: new Date().toISOString()
    });

    // Очищаем поле ввода
    message.value = '';

    // Фокусируемся на поле ввода
    nextTick(() => {
      textareaRef.value.focus();
    });

    // Уведомляем родительский компонент о новых сообщениях
    emit('message-sent', [response.data.userMessage, response.data.aiMessage]);
  } catch (error) {
    console.error('Ошибка при отправке сообщения:', error);
  } finally {
    sending.value = false;
  }
};

// Сброс поля ввода
const resetInput = () => {
  message.value = '';
};

// Экспорт методов для использования в родительском компоненте
defineExpose({
  resetInput,
  focus: () => textareaRef.value?.focus(),
});

const sendGuestMessage = async (messageText) => {
  if (!messageText.trim()) return;

  const userMessage = {
    id: Date.now(),
    content: messageText,
    role: 'user',
    timestamp: new Date().toISOString(),
    isGuest: true
  };

  // Добавляем сообщение пользователя в локальную историю
  messages.value.push(userMessage);

  // Сохраняем сообщение в массиве гостевых сообщений
  guestMessages.value.push(userMessage);

  // Сохраняем гостевые сообщения в localStorage
  localStorage.setItem('guestMessages', JSON.stringify(guestMessages.value));

  // Очищаем поле ввода
  newMessage.value = '';

  // Прокрутка вниз
  await nextTick();
  if (messagesContainer.value) {
    messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight;
  }

  // Устанавливаем состояние загрузки
  isLoading.value = true;

  // Вместо отправки запроса к Ollama, отправляем сообщение с кнопками для аутентификации
  const authMessage = {
    id: Date.now() + 1,
    content: 'Чтобы продолжить, пожалуйста, аутентифицируйтесь.',
    role: 'assistant',
    timestamp: new Date().toISOString(),
    isGuest: true,
    showAuthOptions: true // Указываем, что нужно показать кнопки аутентификации
  };

  messages.value.push(authMessage);
  guestMessages.value.push(authMessage);
  localStorage.setItem('guestMessages', JSON.stringify(guestMessages.value));

  // Прокрутка вниз
  await nextTick();
  if (messagesContainer.value) {
    messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight;
  }

  isLoading.value = false;
};
</script>

<style scoped>
.message-input {
  display: flex;
  padding: 1rem;
  border-top: 1px solid #e0e0e0;
  background-color: #fff;
}

textarea {
  flex: 1;
  min-height: 40px;
  max-height: 120px;
  padding: 0.75rem;
  border: 1px solid #e0e0e0;
  border-radius: 4px;
  resize: none;
  font-family: inherit;
  font-size: 0.9rem;
  line-height: 1.4;
}

textarea:focus {
  outline: none;
  border-color: #4caf50;
  box-shadow: 0 0 0 2px rgba(76, 175, 80, 0.2);
}

.send-button {
  margin-left: 0.5rem;
  padding: 0 1rem;
  height: 40px;
  background-color: #4caf50;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-weight: 500;
  transition: background-color 0.2s;
}

.send-button:hover:not(:disabled) {
  background-color: #43a047;
}

.send-button:disabled {
  background-color: #9e9e9e;
  cursor: not-allowed;
}
</style>
