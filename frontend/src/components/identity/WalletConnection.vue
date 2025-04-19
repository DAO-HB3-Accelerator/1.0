<template>
  <div class="wallet-connection">
    <div v-if="!isConnected" class="connect-section">
      <p>Подключите свой кошелек для доступа к расширенным функциям</p>
      <button 
        @click="connectWallet" 
        :disabled="isLoading"
        class="wallet-btn"
      >
        <span class="wallet-icon">💳</span>
        {{ isLoading ? 'Подключение...' : 'Подключить кошелек' }}
      </button>
    </div>
    <div v-else class="status-section">
      <p>Кошелек подключен</p>
      <p class="address">{{ formatAddress(address) }}</p>
    </div>
    <div v-if="error" class="error">{{ error }}</div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue';
import { useAuth } from '@/composables/useAuth';
import { connectWithWallet } from '@/services/wallet';

const emit = defineEmits(['close']);
const { linkIdentity } = useAuth();

const isLoading = ref(false);
const error = ref('');
const address = ref('');

const isConnected = computed(() => !!address.value);

const formatAddress = (addr) => {
  if (!addr) return '';
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
};

const connectWallet = async () => {
  if (isLoading.value) return;
  
  try {
    isLoading.value = true;
    error.value = '';
    
    // Подключаем кошелек
    const result = await connectWithWallet();
    
    if (result.success) {
      address.value = result.address;
      
      // Связываем кошелек с текущим пользователем
      await linkIdentity('wallet', result.address);
      emit('close');
    } else {
      error.value = result.error || 'Не удалось подключить кошелек';
    }
  } catch (err) {
    console.error('Error connecting wallet:', err);
    error.value = err.message || 'Произошла ошибка при подключении кошелька';
  } finally {
    isLoading.value = false;
  }
};
</script>

<style scoped>
.wallet-connection {
  padding: 20px;
  max-width: 400px;
}

.connect-section,
.status-section {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 15px;
  text-align: center;
}

.wallet-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 10px 20px;
  background-color: #4a5568;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 16px;
  transition: all 0.2s;
}

.wallet-btn:hover:not(:disabled) {
  background-color: #2d3748;
}

.wallet-icon {
  margin-right: 10px;
  font-size: 18px;
}

.address {
  font-family: monospace;
  background-color: #f7fafc;
  padding: 8px 12px;
  border-radius: 4px;
  font-size: 14px;
}

.error {
  color: #e53e3e;
  margin-top: 10px;
  text-align: center;
}

button:disabled {
  opacity: 0.7;
  cursor: not-allowed;
}
</style> 