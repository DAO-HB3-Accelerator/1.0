<template>
  <div class="conversations-view">
    <conversation-list @select-conversation="handleSelectConversation" />

    <div v-if="selectedConversationId" class="conversation-content">
      <message-thread :conversation-id="selectedConversationId" ref="messageThread" />
      <message-input @send-message="handleSendMessage" />
    </div>

    <div v-else class="empty-conversation">
      <div class="empty-state">
        <h3>Выберите диалог</h3>
        <p>
          Выберите существующий диалог или создайте новый, чтобы начать общение с ИИ-ассистентом.
        </p>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue';
import ConversationList from '../components/chat/ConversationList.vue';
import MessageThread from '../components/chat/MessageThread.vue';
import MessageInput from '../components/chat/MessageInput.vue';

const selectedConversationId = ref(null);
const messageThread = ref(null);

function handleSelectConversation(id) {
  selectedConversationId.value = id;
}

function handleSendMessage(message) {
  if (messageThread.value) {
    messageThread.value.sendMessage(message);
  }
}
</script>

<style scoped>
.conversations-view {
  display: flex;
  height: calc(100vh - 64px); /* Высота экрана минус высота навигации */
}

.conversation-content {
  flex-grow: 1;
  display: flex;
  flex-direction: column;
  height: 100%;
}

.empty-conversation {
  flex-grow: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: #f9f9f9;
}

.empty-state {
  text-align: center;
  max-width: 400px;
  padding: 2rem;
}

.empty-state h3 {
  margin-bottom: 1rem;
  color: #333;
}

.empty-state p {
  color: #666;
  line-height: 1.5;
}
</style>
