<template>
  <div id="app">
    <router-view />
  </div>
</template>

<script setup>
import { onMounted, ref, provide, computed } from 'vue';
import { useRouter } from 'vue-router';
import axios from 'axios';

console.log('App.vue: Version with auth check loaded');

const router = useRouter();

// Создаем реактивное состояние с помощью ref
const authState = ref({
  isAuthenticated: false,
  userRole: null,
  address: null
});

// Предоставляем состояние аутентификации всем компонентам
const auth = {
  // Используем computed для реактивности
  isAuthenticated: computed(() => authState.value.isAuthenticated),
  userRole: computed(() => authState.value.userRole),
  address: computed(() => authState.value.address),
  async checkAuth() {
    try {
      const response = await axios.get('/api/auth/check');
      console.log('Auth check response:', response.data);
      authState.value = {
        isAuthenticated: response.data.authenticated,
        userRole: response.data.role,
        address: response.data.address
      };
      console.log('Auth state updated:', authState.value);
    } catch (error) {
      console.error('Auth check failed:', error);
    }
  },
  async disconnect() {
    try {
      await axios.post('/api/auth/logout');
      authState.value = {
        isAuthenticated: false,
        userRole: null,
        address: null
      };
    } catch (error) {
      console.error('Logout failed:', error);
    }
  }
};

provide('auth', auth);

onMounted(async () => {
  await auth.checkAuth();
});
</script>

<style>
body {
  margin: 0;
  font-family: 'Roboto', 'Helvetica Neue', Arial, sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  color: #333;
  background-color: #f5f5f5;
}

#app {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
}

.main-content {
  flex: 1;
  padding: 1rem;
}

button {
  cursor: pointer;
}

.btn {
  padding: 0.5rem 1rem;
  border-radius: 4px;
  font-weight: 500;
  border: none;
}

.btn-primary {
  background-color: #3498db;
  color: white;
}

.btn-secondary {
  background-color: #95a5a6;
  color: white;
}

.btn-danger {
  background-color: #e74c3c;
  color: white;
}

.loading-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-color: rgba(255, 255, 255, 0.8);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 9999;
}

.loading-spinner {
  width: 50px;
  height: 50px;
  border: 5px solid #f3f3f3;
  border-top: 5px solid #3498db;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}
</style>
