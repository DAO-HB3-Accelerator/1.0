<template>
  <div
    :class="[
      'message',
      message.sender_type === 'assistant' || message.role === 'assistant'
        ? 'ai-message'
        : message.sender_type === 'system' || message.role === 'system'
          ? 'system-message'
          : 'user-message',
      message.isLocal ? 'is-local' : '',
      message.hasError ? 'has-error' : '',
    ]"
  >
    <!-- Текстовый контент, если есть -->
    <!-- eslint-disable-next-line vue/no-v-html -->
    <div v-if="message.content" class="message-content" v-html="formattedContent" />

    <!-- Кнопки для системного сообщения -->
    <div v-if="message.sender_type === 'system' && (message.telegramBotUrl || message.supportEmail)" class="system-actions">
      <button v-if="message.telegramBotUrl" @click="openTelegram(message.telegramBotUrl)" class="system-btn">Перейти в Telegram-бот</button>
      <button v-if="message.supportEmail" @click="copyEmail(message.supportEmail)" class="system-btn">Скопировать email</button>
    </div>

    <!-- Блок для отображения прикрепленного файла (теперь с плеерами/изображением/ссылкой) -->
    <div v-if="attachment" class="message-attachments">
      <div class="attachment-item">
        <!-- Изображение -->
        <img v-if="isImage" :src="objectUrl" :alt="attachment.originalname" class="attachment-preview image-preview"/>

        <!-- Аудио -->
        <audio v-else-if="isAudio" :src="objectUrl" controls class="attachment-preview audio-preview" />

        <!-- Видео -->
        <video v-else-if="isVideo" :src="objectUrl" controls class="attachment-preview video-preview" />

        <!-- Другие типы файлов (ссылка на скачивание) -->
        <div v-else class="attachment-info file-preview">
          <span class="attachment-icon">📄</span>
          <a :href="objectUrl" :download="attachment.originalname" class="attachment-name">
            {{ attachment.originalname }}
          </a>
          <span class="attachment-size">({{ formatFileSize(attachment.size) }})</span>
        </div>
      </div>
    </div>

    <div class="message-meta">
      <div class="message-time">
        {{ formattedTime }}
      </div>
      <div v-if="message.isLocal" class="message-status">
        <span class="sending-indicator">Отправка...</span>
      </div>
      <div v-if="message.hasError" class="message-status">
        <span class="error-indicator">Ошибка отправки</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { defineProps, computed, ref, watch, onUnmounted } from 'vue';
import DOMPurify from 'dompurify';
import { marked } from 'marked';

const props = defineProps({
  message: {
    type: Object,
    required: true,
  },
});

// --- Работа с вложениями --- 
const attachment = computed(() => {
    // Ожидаем массив attachments, даже если там только один элемент
    return props.message.attachments && props.message.attachments.length > 0
      ? props.message.attachments[0]
      : null;
});

const objectUrl = ref(null);
const isImage = ref(false);
const isAudio = ref(false);
const isVideo = ref(false);

// Функция для преобразования Base64 в Blob
const base64ToBlob = (base64, mimetype) => {
  try {
    const byteCharacters = atob(base64);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    return new Blob([byteArray], { type: mimetype });
  } catch (e) {
    console.error("Error decoding base64 string:", e);
    return null;
  }
};

// Наблюдаем за изменением вложения в сообщении
watch(attachment, (newAttachment) => {
  // Очищаем предыдущий URL, если он был
  if (objectUrl.value) {
    URL.revokeObjectURL(objectUrl.value);
    objectUrl.value = null;
  }
  // Сбрасываем типы
  isImage.value = false;
  isAudio.value = false;
  isVideo.value = false;

  if (newAttachment && newAttachment.data_base64 && newAttachment.mimetype) {
    const blob = base64ToBlob(newAttachment.data_base64, newAttachment.mimetype);
    if (blob) {
      objectUrl.value = URL.createObjectURL(blob);

      // Определяем тип для условного рендеринга
      const mimetype = newAttachment.mimetype.toLowerCase();
      if (mimetype.startsWith('image/')) {
        isImage.value = true;
      } else if (mimetype.startsWith('audio/')) {
        isAudio.value = true;
      } else if (mimetype.startsWith('video/')) {
        isVideo.value = true;
      }
    }
  }
}, { immediate: true }); // Выполняем сразу при монтировании

// Очистка при размонтировании
onUnmounted(() => {
  if (objectUrl.value) {
    URL.revokeObjectURL(objectUrl.value);
  }
});

// --- Форматирование контента и времени (остается как было) ---
const formattedContent = computed(() => {
  if (!props.message.content) return '';
  const rawHtml = marked.parse(props.message.content);
  return DOMPurify.sanitize(rawHtml);
});

const formattedTime = computed(() => {
  const timestamp = props.message.timestamp || props.message.created_at;
  if (!timestamp) return '';
  try {
    const date = new Date(timestamp);
    if (isNaN(date.getTime())) {
      console.warn('Invalid timestamp in Message.vue:', timestamp);
      return '';
    }
    return date.toLocaleString([], {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch (error) {
    console.error('Error formatting time in Message.vue:', error, timestamp);
    return '';
  }
});

// Форматирование размера файла
const formatFileSize = (bytes) => {
  if (!bytes || bytes === 0) return '0 Bytes'; // Добавлена проверка на undefined/null
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

function openTelegram(url) {
  window.open(url, '_blank');
}
function copyEmail(email) {
  navigator.clipboard.writeText(email);
  // Можно добавить уведомление "Email скопирован"
}

</script>

<style scoped>
/* Стили сообщений, полностью перенесенные из home.css */
.message {
  margin-bottom: var(--spacing-md);
  padding: var(--spacing-sm) var(--spacing-md);
  border-radius: var(--radius-lg);
  max-width: 75%;
  word-wrap: break-word;
  position: relative;
  box-shadow: var(--shadow-sm);
}

.user-message {
  background-color: var(--color-user-message);
  align-self: flex-end;
  margin-left: auto;
  margin-right: var(--spacing-sm);
  border-bottom-right-radius: 2px;
}

.ai-message {
  background-color: var(--color-ai-message);
  align-self: flex-start;
  margin-right: auto;
  margin-left: var(--spacing-sm);
  word-break: break-word;
  max-width: 70%;
  border-bottom-left-radius: 2px;
}

.system-message {
  background-color: var(--color-system-message);
  align-self: center;
  margin-left: auto;
  margin-right: auto;
  font-style: italic;
  color: var(--color-system-text);
  text-align: center;
  max-width: 90%;
}

.message-content {
  margin-bottom: var(--spacing-xs);
  white-space: pre-wrap;
  word-break: break-word;
  font-size: var(--font-size-md);
  line-height: 1.5;
}

.message-content :deep(p) {
    margin-bottom: 0.5em;
}
.message-content :deep(ul),
.message-content :deep(ol) {
    margin-left: 1.5em;
}
.message-content :deep(pre) {
    background-color: #eee;
    padding: 0.5em;
    border-radius: 4px;
    overflow-x: auto;
}
.message-content :deep(code) {
    font-family: monospace;
}

.message-meta {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: var(--spacing-xs);
}

.message-time {
  font-size: var(--font-size-xs);
  color: var(--color-grey);
  text-align: right;
}

.message-status {
  font-size: var(--font-size-xs);
  color: var(--color-grey);
}

.sending-indicator {
  color: var(--color-secondary);
  font-style: italic;
}

.error-indicator {
  color: var(--color-danger);
  font-weight: bold;
}

.is-local {
  opacity: 0.7;
}

.has-error {
  border: 1px solid var(--color-danger);
}

/* Стили для вложений */
.message-attachments {
  margin-top: var(--spacing-sm);
  border-top: 1px solid rgba(0, 0, 0, 0.1);
  padding-top: var(--spacing-sm);
}

.attachment-item {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
}

.attachment-preview {
  max-width: 100%;
  max-height: 300px;
  margin-bottom: var(--spacing-xs);
  border-radius: var(--radius-md);
}

.image-preview {
  object-fit: cover;
}

.audio-preview {
  width: 100%;
}

.video-preview {
  width: 100%;
}

.file-preview {
  display: flex;
  align-items: center;
  font-size: var(--font-size-sm);
}

.attachment-icon {
  margin-right: var(--spacing-xs);
}

.attachment-name {
  font-weight: 500;
  margin-right: var(--spacing-xs);
  color: var(--color-primary);
  text-decoration: none;
}

.attachment-name:hover {
  text-decoration: underline;
}

.attachment-size {
  color: var(--color-grey);
  font-size: var(--font-size-xs);
}

/* Адаптивные стили для разных экранов */
@media (max-width: 768px) {
  .message {
    max-width: 85%;
    padding: var(--spacing-xs) var(--spacing-sm);
  }
  
  .ai-message {
    max-width: 80%;
  }
}

@media (max-width: 480px) {
  .message {
    max-width: 95%;
    font-size: var(--font-size-sm);
  }
  
  .ai-message {
    max-width: 90%;
  }
  
  .message-time {
    font-size: calc(var(--font-size-xs) - 1px);
  }
  
  .attachment-preview {
    max-height: 200px;
  }
}

.system-actions {
  margin-top: 10px;
  display: flex;
  gap: 10px;
}
.system-btn {
  background: var(--color-primary, #3b82f6);
  color: #fff;
  border: none;
  border-radius: 6px;
  padding: 6px 14px;
  cursor: pointer;
  font-size: 1em;
  transition: background 0.2s;
}
.system-btn:hover {
  background: var(--color-primary-dark, #2563eb);
}
</style> 