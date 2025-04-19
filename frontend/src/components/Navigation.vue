<template>
  <nav class="navbar">
    <div class="navbar-brand">
      <router-link to="/" class="navbar-logo">DApp for Business</router-link>
    </div>
    
    <div class="navbar-menu">
      <div class="navbar-start">
        <router-link to="/" class="navbar-item">Главная</router-link>
        <router-link v-if="isAuthenticated" to="/chat" class="navbar-item">Чат</router-link>
      </div>
      
      <div class="navbar-end">
        <div v-if="isAuthenticated" class="navbar-item user-info">
          <span v-if="userAddress" class="user-address">{{ formatAddress(userAddress) }}</span>
          <button @click="logout" class="logout-btn">Выйти</button>
        </div>
        <div v-else class="navbar-item">
          <WalletConnection />
        </div>
      </div>
    </div>
  </nav>
</template>

<script setup>
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '../stores/auth';
import WalletConnection from './WalletConnection.vue';

const router = useRouter();
const authStore = useAuthStore();

const isAuthenticated = computed(() => authStore.isAuthenticated);
const userAddress = computed(() => authStore.user?.address);

// Форматирование адреса кошелька
function formatAddress(address) {
  if (!address) return '';
  return `${address.substring(0, 6)}...${address.substring(address.length - 4)}`;
}

// Выход из системы
async function logout() {
  await authStore.logout();
  router.push('/');
}
</script>

<style scoped>
.navbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.5rem 1rem;
  background-color: #fff;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

.navbar-brand {
  font-weight: bold;
  font-size: 1.25rem;
}

.navbar-logo {
  color: #1976d2;
  text-decoration: none;
}

.navbar-menu {
  display: flex;
  justify-content: space-between;
  flex: 1;
  margin-left: 1rem;
}

.navbar-start, .navbar-end {
  display: flex;
  align-items: center;
}

.navbar-item {
  padding: 0.5rem 0.75rem;
  color: #333;
  text-decoration: none;
  margin: 0 0.25rem;
}

.navbar-item:hover {
  color: #1976d2;
}

.user-info {
  display: flex;
  align-items: center;
}

.user-address {
  font-family: monospace;
  background-color: #f5f5f5;
  padding: 0.25rem 0.5rem;
  border-radius: 4px;
  margin-right: 0.5rem;
}

.logout-btn {
  background-color: #f44336;
  color: white;
  border: none;
  padding: 0.25rem 0.5rem;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.875rem;
}

.logout-btn:hover {
  background-color: #d32f2f;
}

@media (max-width: 768px) {
  .navbar {
    flex-direction: column;
    padding: 0.5rem;
  }
  
  .navbar-menu {
    flex-direction: column;
    width: 100%;
    margin-left: 0;
    margin-top: 0.5rem;
  }
  
  .navbar-start, .navbar-end {
    flex-direction: column;
    width: 100%;
  }
  
  .navbar-item {
    padding: 0.5rem;
    margin: 0.25rem 0;
    width: 100%;
    text-align: center;
  }
  
  .user-info {
    flex-direction: column;
    align-items: center;
  }
  
  .user-address {
    margin-right: 0;
    margin-bottom: 0.5rem;
  }
}
</style>
