<template>
  <div class="linked-accounts">
    <h2>Связанные аккаунты</h2>

    <div v-if="loading" class="loading">Загрузка...</div>

    <div v-else-if="error" class="error">
      {{ error }}
    </div>

    <div v-else>
      <div v-if="identities.length === 0" class="no-accounts">У вас нет связанных аккаунтов.</div>

      <div v-else class="accounts-list">
        <div
          v-for="identity in identities"
          :key="`${identity.identity_type}-${identity.identity_value}`"
          class="account-item"
        >
          <div class="account-type">
            {{ getIdentityTypeLabel(identity.identity_type) }}
          </div>
          <div class="account-value">
            {{ formatIdentityValue(identity) }}
          </div>
          <button @click="unlinkAccount(identity)" class="unlink-button">Отвязать</button>
        </div>
      </div>

      <div class="link-instructions">
        <h3>Как связать аккаунты</h3>

        <div class="instruction">
          <h4>Telegram</h4>
          <p>Отправьте боту команду:</p>
          <code>/link {{ userAddress }}</code>
        </div>

        <div class="instruction">
          <h4>Email</h4>
          <p>Отправьте письмо на адрес бота с темой:</p>
          <code>link {{ userAddress }}</code>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, computed } from 'vue';
import { useAuthStore } from '../stores/auth';
import axios from 'axios';

const authStore = useAuthStore();
const identities = ref([]);
const loading = ref(true);
const error = ref(null);

const userAddress = computed(() => authStore.address);

// Получение связанных аккаунтов
async function fetchLinkedAccounts() {
  try {
    loading.value = true;
    error.value = null;

    const response = await axios.get(`${import.meta.env.VITE_API_URL}/api/identities/linked`, {
      withCredentials: true,
    });
    identities.value = response.data;
  } catch (err) {
    console.error('Ошибка при получении связанных аккаунтов:', err);
    error.value = 'Не удалось загрузить связанные аккаунты. Попробуйте позже.';
  } finally {
    loading.value = false;
  }
}

// Отвязывание аккаунта
async function unlinkAccount(identity) {
  try {
    await axios.post(
      `${import.meta.env.VITE_API_URL}/api/identities/unlink`,
      {
        type: identity.identity_type,
        value: identity.identity_value,
      },
      {
        withCredentials: true,
      }
    );

    // Обновляем список после отвязки
    await fetchLinkedAccounts();
  } catch (err) {
    console.error('Ошибка при отвязке аккаунта:', err);
    error.value = 'Не удалось отвязать аккаунт. Попробуйте позже.';
  }
}

// Форматирование типа идентификатора
function getIdentityTypeLabel(type) {
  const labels = {
    ethereum: 'Ethereum',
    telegram: 'Telegram',
    email: 'Email',
  };

  return labels[type] || type;
}

// Форматирование значения идентификатора
function formatIdentityValue(identity) {
  if (identity.identity_type === 'ethereum') {
    // Сокращаем Ethereum-адрес
    const value = identity.identity_value;
    return `${value.substring(0, 6)}...${value.substring(value.length - 4)}`;
  }

  return identity.identity_value;
}

onMounted(() => {
  if (authStore.isAuthenticated) {
    fetchLinkedAccounts();
  }
});
</script>

<style scoped>
.linked-accounts {
  max-width: 600px;
  margin: 0 auto;
  padding: 20px;
}

.loading,
.error,
.no-accounts {
  margin: 20px 0;
  padding: 10px;
  text-align: center;
}

.error {
  color: #e74c3c;
  border: 1px solid #e74c3c;
  border-radius: 4px;
}

.accounts-list {
  margin: 20px 0;
}

.account-item {
  display: flex;
  align-items: center;
  padding: 10px;
  border-bottom: 1px solid #eee;
}

.account-type {
  font-weight: bold;
  width: 100px;
}

.account-value {
  flex: 1;
}

.unlink-button {
  background-color: #e74c3c;
  color: white;
  border: none;
  padding: 5px 10px;
  border-radius: 4px;
  cursor: pointer;
}

.link-instructions {
  margin-top: 30px;
  padding: 15px;
  background-color: #f8f9fa;
  border-radius: 4px;
}

.instruction {
  margin-bottom: 15px;
}

code {
  display: block;
  padding: 10px;
  background-color: #eee;
  border-radius: 4px;
  margin-top: 5px;
}
</style>
