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
  if (!message.value.trim() || sending.value) return;

  try {
    sending.value = true;

    const response = await axios.post(
      `/api/messages/conversations/${props.conversationId}/messages`,
      { content: message.value }
    );

    // Очищаем поле ввода
    message.value = '';

    // Фокусируемся на поле ввода
    nextTick(() => {
      textareaRef.value.focus();
    });

    // Уведомляем родительский компонент о новых сообщениях
    emit('message-sent', [response.data.userMessage, response.data.aiMessage]);
  } catch (error) {
    console.error('Error sending message:', error);
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
