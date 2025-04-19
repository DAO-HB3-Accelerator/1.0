<template>
  <div class="email-connect">
    <p>Подключите свой email для быстрой авторизации.</p>
    
    <div class="email-form">
      <input 
        type="email" 
        v-model="email" 
        placeholder="Введите ваш email" 
        :disabled="loading || verificationSent"
      />
      <button 
        @click="sendVerification" 
        class="connect-button"
        :disabled="!isValidEmail || loading || verificationSent"
      >
        <span class="email-icon">✉️</span> {{ verificationSent ? 'Код отправлен' : 'Отправить код' }}
      </button>
    </div>
    
    <div v-if="verificationSent" class="verification-form">
      <input 
        type="text" 
        v-model="verificationCode" 
        placeholder="Введите код подтверждения" 
        :disabled="loading"
      />
      <button 
        @click="verifyEmail" 
        class="verify-button"
        :disabled="!verificationCode || loading"
      >
        Подтвердить
      </button>
    </div>
    
    <div v-if="loading" class="loading">Загрузка...</div>
    <div v-if="error" class="error">{{ error }}</div>
    <div v-if="success" class="success">{{ success }}</div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue';
import axios from 'axios';

const email = ref('');
const verificationCode = ref('');
const loading = ref(false);
const error = ref('');
const success = ref('');
const verificationSent = ref(false);

const isValidEmail = computed(() => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email.value);
});

async function sendVerification() {
  if (!isValidEmail.value) return;
  
  try {
    loading.value = true;
    error.value = '';
    success.value = '';
    
    // Запрос на отправку кода подтверждения
    const response = await axios.post('/api/auth/email', {
      email: email.value
    }, {
      withCredentials: true
    });
    
    if (response.data.error) {
      error.value = `Ошибка: ${response.data.error}`;
      return;
    }
    
    verificationSent.value = true;
    success.value = `Код подтверждения отправлен на ${email.value}`;
  } catch (err) {
    console.error('Error sending verification code:', err);
    error.value = 'Ошибка при отправке кода подтверждения';
  } finally {
    loading.value = false;
  }
}

async function verifyEmail() {
  if (!verificationCode.value) return;
  
  try {
    loading.value = true;
    error.value = '';
    success.value = '';
    
    // Запрос на проверку кода
    const response = await axios.post('/api/auth/email/verify', {
      email: email.value,
      code: verificationCode.value
    }, {
      withCredentials: true
    });
    
    if (response.data.error) {
      error.value = `Ошибка: ${response.data.error}`;
      return;
    }
    
    success.value = 'Email успешно подтвержден';
    
    // Сбрасываем форму
    setTimeout(() => {
      email.value = '';
      verificationCode.value = '';
      verificationSent.value = false;
      success.value = '';
    }, 3000);
  } catch (err) {
    console.error('Error verifying email:', err);
    error.value = 'Ошибка при проверке кода подтверждения';
  } finally {
    loading.value = false;
  }
}
</script>

<style scoped>
.email-connect {
  display: flex;
  flex-direction: column;
  gap: 15px;
}

.email-form, .verification-form {
  display: flex;
  gap: 10px;
}

input {
  flex: 1;
  padding: 10px;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 16px;
}

.connect-button, .verify-button {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 10px 15px;
  background-color: #4caf50;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 16px;
  transition: background-color 0.2s;
  white-space: nowrap;
}

.connect-button:hover, .verify-button:hover {
  background-color: #45a049;
}

.connect-button:disabled, .verify-button:disabled {
  background-color: #cccccc;
  cursor: not-allowed;
}

.email-icon {
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
