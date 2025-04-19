<template>
  <div class="wallet-connection">
    <div v-if="error" class="error-message">
      {{ error }}
    </div>

    <button @click="connectWallet" class="connect-button" :disabled="loading">
      <div v-if="loading" class="spinner"></div>
      {{ loading ? 'Подключение...' : 'Подключить кошелек' }}
    </button>
  </div>
</template>

<script>
import { ref } from 'vue';
import { connectWallet } from '../utils/wallet';
import { useAuthStore } from '../stores/auth';
import { useRouter } from 'vue-router';

export default {
  setup() {
    const authStore = useAuthStore();
    const router = useRouter();
    const loading = ref(false);
    const error = ref('');

    return {
      authStore,
      router,
      loading,
      error
    }
  },
  methods: {
    async connectWallet() {
      console.log('Нажата кнопка "Подключить кошелек"');

      if (this.loading) return;

      this.loading = true;
      this.error = '';

      try {
        const authResult = await connectWallet();
        console.log('Результат подключения:', authResult);
        
        if (authResult && authResult.authenticated) {
          this.authStore.isAuthenticated = authResult.authenticated;
          this.authStore.user = { address: authResult.address };
          this.authStore.isAdmin = authResult.isAdmin;
          this.authStore.authType = authResult.authType;
          this.router.push({ name: 'home' });
        } else {
          this.error = 'Не удалось подключить кошелек';
        }
      } catch (error) {
        console.error('Ошибка при подключении кошелька:', error);
        this.error = error.message || 'Ошибка при подключении кошелька';
      } finally {
        this.loading = false;
      }
    }
  }
}
</script>

<style scoped>
.wallet-connection {
  margin: 20px 0;
}

.connect-button {
  background-color: #1976d2;
  color: white;
  border: none;
  padding: 10px 20px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.connect-button:disabled {
  background-color: #ccc;
  cursor: not-allowed;
}

.error-message {
  color: #d32f2f;
  margin-bottom: 10px;
  padding: 10px;
  background-color: #ffebee;
  border-radius: 4px;
}

.spinner {
  width: 16px;
  height: 16px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-radius: 50%;
  border-top-color: white;
  animation: spin 1s linear infinite;
  margin-right: 8px;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
