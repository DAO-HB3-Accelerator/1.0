<template>
  <div class="contract-interaction">
    <h2>Управление контрактом</h2>
    
    <div v-if="!isConnected" class="warning">
      Пожалуйста, подключите кошелек для управления контрактом
      <button @click="handleConnect" class="connect-button">
        Подключить кошелек
      </button>
    </div>
    
    <div v-else>
      <div class="owner-info">
        <p>Текущий владелец: 
          <span v-if="loading">Загрузка...</span>
          <span v-else-if="owner">{{ formatAddress(owner) }}</span>
          <span v-else>Не удалось загрузить</span>
        </p>
      </div>

      <div class="owner-controls">
        <input 
          v-model="newOwner" 
          placeholder="Адрес нового владельца (0x...)" 
          :disabled="!isConnected"
        />
        <button 
          @click="setNewOwner" 
          :disabled="!isConnected || !isValidAddress(newOwner)"
        >
          Установить нового владельца
        </button>
      </div>
    </div>
  </div>
</template>

<script>
import { ref, onMounted, watch } from 'vue';
import { ethers } from 'ethers';
import { useAppKitAccount, useAppKitProvider, useAppKit } from '@reown/appkit/vue';

export default {
  name: 'ContractInteraction',
  setup() {
    const owner = ref('');
    const newOwner = ref('');
    const loading = ref(false);
    const { address, isConnected } = useAppKitAccount();
    const { walletProvider } = useAppKitProvider('eip155');
    const appKit = useAppKit();

    const contractAddress = '0x6199Ba629C85Da887dBd8Ffd8d2C75Ea24EaDe2a';
    const contractABI = [
      'function owner() view returns (address)',
      'function setOwner(address newOwner)',
    ];

    const formatAddress = (addr) => {
      return addr.slice(0, 6) + '...' + addr.slice(-4);
    };

    const isValidAddress = (addr) => {
      try {
        return ethers.isAddress(addr);
      } catch {
        return false;
      }
    };

    // Добавим логирование для отладки
    watch(() => isConnected, (newValue) => {
      console.log('Состояние подключения изменилось:', newValue);
      console.log('Адрес кошелька:', address);
    }, { immediate: true });

    const fetchOwner = async () => {
      if (!isConnected) return;
      loading.value = true;
      try {
        console.log('Получаем владельца контракта...');
        const ethersProvider = new ethers.BrowserProvider(walletProvider);
        const contract = new ethers.Contract(contractAddress, contractABI, ethersProvider);
        owner.value = await contract.owner();
        console.log('Владелец контракта:', owner.value);
      } catch (error) {
        console.error('Ошибка при получении владельца:', error);
        owner.value = '';
      } finally {
        loading.value = false;
      }
    };

    const setNewOwner = async () => {
      try {
        if (!isConnected) {
          console.log('Пожалуйста, подключите кошелек');
          return;
        }
        if (!isValidAddress(newOwner.value)) {
          console.log('Неверный адрес');
          return;
        }
        
        const ethersProvider = new ethers.BrowserProvider(walletProvider);
        const signer = await ethersProvider.getSigner();
        const contract = new ethers.Contract(contractAddress, contractABI, signer);
        
        const tx = await contract.setOwner(newOwner.value);
        await tx.wait();
        
        // Обновляем информацию после успешной транзакции
        await fetchOwner();
        newOwner.value = ''; // Очищаем поле ввода
      } catch (error) {
        console.error('Ошибка при установке нового владельца:', error);
      }
    };

    // Обработчик подключения кошелька
    const handleConnect = async () => {
      try {
        await appKit.open();
      } catch (error) {
        console.error('Ошибка при подключении:', error);
      }
    };

    // Обновляем watch
    watch(() => isConnected, (newValue, oldValue) => {
      console.log('Состояние подключения изменилось:', { newValue, oldValue });
      if (newValue) {
        fetchOwner();
      } else {
        owner.value = '';
      }
    }, { immediate: true });

    onMounted(() => {
      // Проверяем состояние подключения при монтировании
      console.log('Компонент смонтирован, isConnected:', isConnected);
      fetchOwner();
    });

    return {
      owner,
      newOwner,
      isConnected,
      loading,
      handleConnect,
      walletProvider,
      setNewOwner,
      formatAddress,
      isValidAddress
    };
  }
};
</script>

<style scoped>
.contract-interaction {
  max-width: 600px;
  margin: 0 auto;
  padding: 20px;
}

.warning {
  color: #721c24;
  background-color: #f8d7da;
  border: 1px solid #f5c6cb;
  padding: 10px;
  border-radius: 4px;
  margin-bottom: 20px;
}

.owner-info {
  margin-bottom: 20px;
}

.owner-controls {
  display: flex;
  gap: 10px;
}

input {
  flex: 1;
  padding: 8px;
  border: 1px solid #ccc;
  border-radius: 4px;
}

button {
  padding: 8px 16px;
  background-color: #4CAF50;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
}

button:disabled {
  background-color: #cccccc;
  cursor: not-allowed;
}

button:hover:not(:disabled) {
  background-color: #45a049;
}

.connect-button {
  margin-top: 10px;
  background-color: #007bff;
}

.connect-button:hover:not(:disabled) {
  background-color: #0056b3;
}
</style> 