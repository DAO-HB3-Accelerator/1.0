<template>
  <div class="email-connection">
    <div v-if="!showVerification" class="email-form">
      <input 
        v-model="email"
        type="email"
        placeholder="Введите email"
        class="email-input"
      />
      <button 
        @click="requestCode"
        :disabled="isLoading || !isValidEmail"
        class="email-btn"
      >
        {{ isLoading ? 'Отправка...' : 'Получить код' }}
      </button>
    </div>
    <div v-else class="verification-form">
      <p class="verification-info">Код отправлен на {{ email }}</p>
      <input 
        v-model="code"
        type="text"
        placeholder="Введите код"
        class="code-input"
      />
      <button 
        @click="verifyCode"
        :disabled="isLoading || !code"
        class="verify-btn"
      >
        {{ isLoading ? 'Проверка...' : 'Подтвердить' }}
      </button>
      <button 
        @click="resetForm"
        class="reset-btn"
      >
        Изменить email
      </button>
    </div>
    <div v-if="error" class="error">{{ error }}</div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue';
import axios from '@/api/axios';
import { useAuth } from '@/composables/useAuth';

const emit = defineEmits(['close']);
const { linkIdentity } = useAuth();

const email = ref('');
const code = ref('');
const error = ref('');
const isLoading = ref(false);
const showVerification = ref(false);

const isValidEmail = computed(() => {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value);
});

const requestCode = async () => {
  try {
    isLoading.value = true;
    error.value = '';
    
    const response = await axios.post('/api/auth/email/request-verification', {
      email: email.value
    });
    
    if (response.data.success) {
      showVerification.value = true;
    } else {
      error.value = response.data.error || 'Ошибка отправки кода';
    }
  } catch (err) {
    error.value = err.response?.data?.error || 'Ошибка отправки кода';
  } finally {
    isLoading.value = false;
  }
};

const verifyCode = async () => {
  try {
    isLoading.value = true;
    error.value = '';
    
    const response = await axios.post('/api/auth/email/verify', {
      email: email.value,
      code: code.value
    });
    
    if (response.data.success) {
      // Связываем email с текущим пользователем
      await linkIdentity('email', email.value);
      emit('close');
    } else {
      error.value = response.data.error || 'Неверный код';
    }
  } catch (err) {
    error.value = err.response?.data?.error || 'Ошибка проверки кода';
  } finally {
    isLoading.value = false;
  }
};

const resetForm = () => {
  email.value = '';
  code.value = '';
  error.value = '';
  showVerification.value = false;
};
</script>

<style scoped>
.email-connection {
  padding: 20px;
  max-width: 400px;
}

.email-form,
.verification-form {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.email-input,
.code-input {
  padding: 8px 12px;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 16px;
}

.email-btn,
.verify-btn,
.reset-btn {
  padding: 10px;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
  transition: all 0.2s;
}

.email-btn,
.verify-btn {
  background-color: #48bb78;
  color: white;
}

.reset-btn {
  background-color: #e2e8f0;
  color: #4a5568;
}

.verification-info {
  color: #4a5568;
  font-size: 14px;
}

.error {
  color: #e53e3e;
  margin-top: 5px;
  font-size: 14px;
}

button:disabled {
  opacity: 0.7;
  cursor: not-allowed;
}
</style>
