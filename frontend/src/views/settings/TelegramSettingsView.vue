<template>
  <div class="telegram-settings settings-panel">
    <h2>Настройки Telegram</h2>
    <form v-if="editMode" @submit.prevent="saveTelegramSettings" class="settings-form">
      <div class="form-group">
        <label for="botToken">Bot Token</label>
        <input id="botToken" v-model="form.botToken" type="text" required />
      </div>
      <div class="form-group">
        <label for="botUsername">Bot Username</label>
        <input id="botUsername" v-model="form.botUsername" type="text" required />
      </div>
      <button type="submit" class="save-btn">Сохранить</button>
      <button type="button" class="cancel-btn" @click="cancelEdit">Отмена</button>
    </form>
    <div v-else class="settings-view">
      <div class="view-row"><span>Bot Token:</span> <b>••••••••••••••••••••••••••••••••</b></div>
      <div class="view-row"><span>Bot Username:</span> <b>{{ form.botUsername }}</b></div>
      <button type="button" class="edit-btn" @click="editMode = true">Изменить</button>
      <button type="button" class="cancel-btn" @click="$emit('cancel')">Закрыть</button>
    </div>
  </div>
</template>

<script setup>
import { reactive, ref, onMounted } from 'vue';
import api from '@/api/axios';

const form = reactive({
  botToken: '',
  botUsername: ''
});
const original = reactive({});
const editMode = ref(false);

const loadTelegramSettings = async () => {
  try {
    const res = await api.get('/api/telegram-settings');
    if (res.data.success) {
      const s = res.data.settings;
      form.botToken = '';
      form.botUsername = s.bot_username;
      Object.assign(original, JSON.parse(JSON.stringify(form)));
    }
  } catch (e) {
    // обработка ошибки
  }
};

onMounted(async () => {
  await loadTelegramSettings();
  editMode.value = false;
});

const saveTelegramSettings = async () => {
  try {
    await api.put('/api/telegram-settings', {
      bot_token: form.botToken,
      bot_username: form.botUsername
    });
    alert('Настройки Telegram сохранены');
    form.botToken = '';
    Object.assign(original, JSON.parse(JSON.stringify(form)));
    editMode.value = false;
  } catch (e) {
    alert('Ошибка сохранения telegram-настроек');
  }
};

const cancelEdit = () => {
  Object.assign(form, JSON.parse(JSON.stringify(original)));
  form.botToken = '';
  editMode.value = false;
};
</script>

<style scoped>
.settings-panel {
  padding: var(--block-padding);
  background-color: var(--color-light);
  border-radius: var(--radius-md);
  margin-top: var(--spacing-lg);
  max-width: 500px;
}
.settings-form {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}
.form-group {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
.save-btn {
  background: var(--color-primary);
  color: #fff;
  border: none;
  border-radius: 6px;
  padding: 0.5rem 1.5rem;
  cursor: pointer;
  font-size: 1rem;
  transition: background 0.2s;
}
.save-btn:hover {
  background: var(--color-primary-dark);
}
.cancel-btn {
  background: #eee;
  color: #333;
  border: none;
  border-radius: 6px;
  padding: 0.5rem 1.5rem;
  cursor: pointer;
  font-size: 1rem;
  margin-left: 1rem;
}
.settings-view {
  display: flex;
  flex-direction: column;
  gap: 1.2rem;
}
.view-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 1rem;
  background: #f8f8f8;
  border-radius: 4px;
  padding: 0.5rem 1rem;
}
.edit-btn {
  background: var(--color-primary);
  color: #fff;
  border: none;
  border-radius: 6px;
  padding: 0.5rem 1.5rem;
  cursor: pointer;
  font-size: 1rem;
  align-self: flex-end;
  margin-top: 1.5rem;
  transition: background 0.2s;
}
.edit-btn:hover {
  background: var(--color-primary-dark);
}
</style> 