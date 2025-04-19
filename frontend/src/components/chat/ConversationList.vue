<template>
  <div v-if="isAuthenticated">
    <div class="conversation-list">
      <div class="list-header">
        <h3>Диалоги</h3>
        <button @click="createNewConversation" class="new-conversation-btn">
          <span>+</span> Новый диалог
        </button>
      </div>

      <div v-if="loading" class="loading">Загрузка диалогов...</div>

      <div v-else-if="conversations.length === 0" class="empty-list">
        <p>У вас пока нет диалогов.</p>
        <p>Создайте новый диалог, чтобы начать общение с ИИ-ассистентом.</p>
      </div>

      <div v-else class="conversations">
        <div
          v-for="conversation in conversations"
          :key="conversation.conversation_id"
          :class="[
            'conversation-item',
            { active: selectedConversationId === conversation.conversation_id },
          ]"
          @click="selectConversation(conversation.conversation_id)"
        >
          <div class="conversation-title">{{ conversation.title }}</div>
          <div class="conversation-meta">
            <span class="message-count">{{ conversation.message_count }} сообщений</span>
            <span class="time">{{ formatTime(conversation.last_activity) }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
  <div v-else class="connect-wallet-prompt">
    <p>Подключите кошелек для просмотра бесед</p>
  </div>
</template>

<script setup>
import { ref, onMounted, computed, defineEmits, watch, inject } from 'vue';
import axios from 'axios';

const emit = defineEmits(['select-conversation']);
const auth = inject('auth');
const isAuthenticated = computed(() => auth.isAuthenticated.value);

const conversations = ref([]);
const loading = ref(true);
const selectedConversationId = ref(null);

// Следим за изменением статуса аутентификации
watch(() => isAuthenticated.value, (authenticated) => {
  if (!authenticated) {
    conversations.value = []; // Очищаем список бесед при отключении
    selectedConversationId.value = null;
  }
});

// Загрузка списка диалогов
const fetchConversations = async () => {
  try {
    loading.value = true;
    const response = await axios.get('/api/messages/conversations');
    conversations.value = response.data;

    // Если есть диалоги и не выбран ни один, выбираем первый
    if (conversations.value.length > 0 && !selectedConversationId.value) {
      selectConversation(conversations.value[0].conversation_id);
    }
  } catch (error) {
    console.error('Error fetching conversations:', error);
  } finally {
    loading.value = false;
  }
};

// Выбор диалога
const selectConversation = (conversationId) => {
  selectedConversationId.value = conversationId;
  emit('select-conversation', conversationId);
};

// Создание нового диалога
const createNewConversation = async () => {
  try {
    const response = await axios.post('/api/messages/conversations', {
      title: 'Новый диалог',
    });

    // Добавляем новый диалог в список
    const newConversation = {
      conversation_id: response.data.id,
      title: response.data.title,
      username: authStore.username,
      address: authStore.address,
      message_count: 0,
      last_activity: response.data.created_at,
      created_at: response.data.created_at,
    };

    conversations.value.unshift(newConversation);

    // Выбираем новый диалог
    selectConversation(newConversation.conversation_id);
  } catch (error) {
    console.error('Error creating conversation:', error);
  }
};

// Форматирование времени
const formatTime = (timestamp) => {
  if (!timestamp) return '';

  const date = new Date(timestamp);
  const now = new Date();
  const diffDays = Math.floor((now - date) / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    // Сегодня - показываем только время
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } else if (diffDays === 1) {
    // Вчера
    return 'Вчера';
  } else if (diffDays < 7) {
    // В течение недели - показываем день недели
    const days = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
    return days[date.getDay()];
  } else {
    // Более недели назад - показываем дату
    return date.toLocaleDateString();
  }
};

// Загрузка диалогов при монтировании компонента
onMounted(() => {
  fetchConversations();
});

// Экспорт методов для использования в родительском компоненте
defineExpose({
  fetchConversations,
});
</script>

<style scoped>
.conversation-list {
  display: flex;
  flex-direction: column;
  width: 300px;
  border-right: 1px solid #e0e0e0;
  background-color: #f9f9f9;
  height: 100%;
}

.list-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1rem;
  border-bottom: 1px solid #e0e0e0;
}

.list-header h3 {
  margin: 0;
  font-size: 1.2rem;
}

.new-conversation-btn {
  display: flex;
  align-items: center;
  background-color: #4caf50;
  color: white;
  border: none;
  border-radius: 4px;
  padding: 0.5rem 0.75rem;
  cursor: pointer;
  font-size: 0.9rem;
}

.new-conversation-btn span {
  font-size: 1.2rem;
  margin-right: 0.25rem;
}

.loading,
.empty-list {
  padding: 2rem;
  text-align: center;
  color: #666;
}

.empty-list p {
  margin: 0.5rem 0;
}

.conversations {
  flex: 1;
  overflow-y: auto;
}

.conversation-item {
  padding: 1rem;
  border-bottom: 1px solid #e0e0e0;
  cursor: pointer;
  transition: background-color 0.2s;
}

.conversation-item:hover {
  background-color: #f0f0f0;
}

.conversation-item.active {
  background-color: #e8f5e9;
  color: #4caf50;
}

.conversation-title {
  font-weight: 500;
  margin-bottom: 0.5rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.conversation-meta {
  display: flex;
  justify-content: space-between;
  font-size: 0.8rem;
  color: #888;
}

.time {
  font-size: 0.8rem;
}

.connect-wallet-prompt {
  text-align: center;
  padding: 2rem;
  color: #666;
}
</style>
