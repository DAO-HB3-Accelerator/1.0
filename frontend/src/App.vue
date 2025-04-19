<template>
  <div id="app">
    <navigation />
    <main class="main-content">
      <router-view />
    </main>
  </div>
</template>

<script setup>
import { onMounted, watch } from 'vue';
import { useAuthStore } from './stores/auth';
import Navigation from './components/Navigation.vue';
import axios from 'axios';

const authStore = useAuthStore();

// Проверка сессии при загрузке приложения
async function checkSession() {
  try {
    // Проверяем, установлены ли куки
    const cookies = document.cookie;
    console.log('Текущие куки:', cookies);

    await authStore.checkAuth();
    console.log('Проверка сессии:', {
      authenticated: authStore.isAuthenticated,
      address: authStore.address,
      isAdmin: authStore.isAdmin,
      authType: authStore.authType,
    });
    console.log('Проверка аутентификации при загрузке:', authStore.isAuthenticated);
    console.log('Статус администратора при загрузке:', authStore.isAdmin);

    // Если пользователь авторизован, но куки не установлены, пробуем обновить сессию
    if (authStore.isAuthenticated && !cookies.includes('connect.sid')) {
      console.log('Куки не установлены, пробуем обновить сессию');
      await refreshSession();
    }
  } catch (error) {
    console.error('Ошибка при проверке сессии:', error);
  }
}

// Функция для обновления сессии
async function refreshSession() {
  try {
    // Проверяем, есть ли адрес пользователя
    if (!authStore.user || !authStore.user.address) {
      console.log('Нет адреса пользователя для обновления сессии');
      return;
    }

    const response = await axios.post('/api/auth/refresh-session', 
      { address: authStore.user.address },
      { withCredentials: true }
    );
    
    if (response.data.success) {
      console.log('Сессия успешно обновлена');
    }
  } catch (error) {
    console.error('Ошибка при обновлении сессии:', error);
  }
}

onMounted(async () => {
  console.log('App mounted');
  
  // Проверяем куки
  const cookies = document.cookie;
  console.log('Куки при загрузке:', cookies);
  
  try {
    // Проверяем текущую сессию
    const response = await axios.get('/api/auth/check', { withCredentials: true });
    console.log('Ответ проверки сессии:', response.data);
    
    if (response.data.authenticated) {
      // Если сессия активна, обновляем состояние аутентификации
      authStore.isAuthenticated = response.data.authenticated;
      authStore.user = { address: response.data.address };
      authStore.isAdmin = response.data.isAdmin;
      authStore.authType = 'wallet';
      
      console.log('Сессия восстановлена:', response.data);
    } else {
      console.log('Нет активной сессии');
    }
  } catch (error) {
    console.error('Ошибка при проверке сессии:', error);
  }
});

// Следим за изменением статуса аутентификации
watch(
  () => authStore.isAuthenticated,
  (isAuthenticated) => {
    if (isAuthenticated) {
      console.log('Пользователь авторизован, проверяем куки');
      const cookies = document.cookie;
      if (!cookies.includes('connect.sid')) {
        console.log('Куки не установлены после авторизации, пробуем обновить сессию');
        refreshSession();
      }
    }
  }
);
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
</style>
