import { ref } from 'vue';
import { ethers } from 'ethers';

export function useEthereum() {
  const address = ref('');
  const isConnected = ref(false);
  const provider = ref(null);
  const signer = ref(null);

  async function connect() {
    if (window.ethereum) {
      try {
        // Запрашиваем доступ к кошельку
        await window.ethereum.request({ method: 'eth_requestAccounts' });
        // Используем синтаксис ethers.js v6
        provider.value = new ethers.BrowserProvider(window.ethereum);
        signer.value = await provider.value.getSigner();
        address.value = await signer.value.getAddress();
        isConnected.value = true;
        
        console.log('Подключение успешно:', address.value);
        return { success: true, address: address.value };
      } catch (error) {
        console.error('Ошибка подключения к кошельку:', error);
        return { success: false, error: error.message };
      }
    } else {
      console.error('Ethereum wallet not found. Please install MetaMask.');
      return { success: false, error: 'Ethereum wallet not found. Please install MetaMask.' };
    }
  }

  async function getContract(contractAddress, contractABI) {
    if (!signer.value) {
      console.error('Подключите кошелек перед получением контракта.');
      return null;
    }

    try {
      // Используем синтаксис ethers.js v6
      const contract = new ethers.Contract(contractAddress, contractABI, signer.value);
      console.log('Контракт получен:', contract);
      return contract;
    } catch (error) {
      console.error('Ошибка получения контракта:', error);
      return null;
    }
  }

  return {
    address,
    isConnected,
    connect,
    getContract,
  };
}
