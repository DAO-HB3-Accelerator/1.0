import axios from '../api/axios';
import { ethers } from 'ethers';
import { SiweMessage } from 'siwe';

export const connectWallet = async () => {
  try {
    console.log('Starting wallet connection...');
    
    // Проверяем наличие MetaMask или другого Ethereum провайдера
    if (!window.ethereum) {
      console.error('No Ethereum provider (like MetaMask) detected!');
      return { 
        success: false, 
        error: 'Не найден кошелек MetaMask или другой Ethereum провайдер. Пожалуйста, установите расширение MetaMask.' 
      };
    }
    
    console.log('MetaMask detected, requesting accounts...');
    
    // Запрашиваем доступ к аккаунтам
    const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
    console.log('Got accounts:', accounts);
    
    if (!accounts || accounts.length === 0) {
      return { 
        success: false, 
        error: 'Не удалось получить доступ к аккаунтам. Пожалуйста, разрешите доступ в MetaMask.' 
      };
    }
    
    // Берем первый аккаунт в списке
    const address = accounts[0];
    // Нормализуем адрес (приводим к нижнему регистру для последующих сравнений)
    const normalizedAddress = ethers.utils.getAddress(address);
    console.log('Normalized address:', normalizedAddress);
    
    // Запрашиваем nonce с сервера
    console.log('Requesting nonce...');
    const nonceResponse = await axios.get(`/api/auth/nonce?address=${normalizedAddress}`);
    const nonce = nonceResponse.data.nonce;
    console.log('Got nonce:', nonce);
    
    if (!nonce) {
      return { 
        success: false, 
        error: 'Не удалось получить nonce от сервера.' 
      };
    }
    
    // Создаем провайдер Ethers
    const provider = new ethers.providers.Web3Provider(window.ethereum);
    const signer = provider.getSigner();
    
    // Создаем сообщение для подписи
    const domain = window.location.host;
    const origin = window.location.origin;
    
    // Создаем SIWE сообщение
    const message = new SiweMessage({
      domain,
      address: normalizedAddress,
      statement: 'Sign in with Ethereum to the app.',
      uri: origin,
      version: '1',
      chainId: 1, // Ethereum mainnet
      nonce: nonce,
      issuedAt: new Date().toISOString(),
      resources: [`${origin}/api/auth/verify`]
    });
    
    // Получаем строку сообщения для подписи
    const messageToSign = message.prepareMessage();
    console.log('SIWE message:', messageToSign);
    
    // Запрашиваем подпись
    console.log('Requesting signature...');
    const signature = await signer.signMessage(messageToSign);
    
    if (!signature) {
      return { 
        success: false, 
        error: 'Подпись не была получена. Пожалуйста, подпишите сообщение в MetaMask.' 
      };
    }
    
    console.log('Got signature:', signature);
    
    // Отправляем верификацию на сервер
    console.log('Sending verification request...');
    const verifyResponse = await axios.post('/api/auth/verify', {
      address: normalizedAddress,
      signature,
      nonce
    });
    
    // Обновляем интерфейс для отображения подключенного состояния
    document.body.classList.add('wallet-connected');
    
    // Обновляем отображение адреса кошелька в UI
    const authDisplayEl = document.getElementById('auth-display');
    if (authDisplayEl) {
      const shortAddress = `${normalizedAddress.substring(0, 6)}...${normalizedAddress.substring(normalizedAddress.length - 4)}`;
      authDisplayEl.innerHTML = `Кошелек: <strong>${shortAddress}</strong>`;
      authDisplayEl.style.display = 'inline-block';
    }
    
    // Скрываем кнопки авторизации и показываем кнопку выхода
    const authButtonsEl = document.getElementById('auth-buttons');
    const logoutButtonEl = document.getElementById('logout-button');
    
    if (authButtonsEl) authButtonsEl.style.display = 'none';
    if (logoutButtonEl) logoutButtonEl.style.display = 'inline-block';
    
    console.log('Verification response:', verifyResponse.data);
    
    if (verifyResponse.data.success) {
      return { 
        success: true, 
        address: normalizedAddress,
        userId: verifyResponse.data.userId,
        isAdmin: verifyResponse.data.isAdmin
      };
    } else {
      return { 
        success: false, 
        error: verifyResponse.data.error || 'Ошибка верификации на сервере.' 
      };
    }
  } catch (error) {
    console.error('Error connecting wallet:', error);
    
    // Формируем понятное сообщение об ошибке
    let errorMessage = 'Произошла ошибка при подключении кошелька.';
    
    if (error.code === 4001) {
      errorMessage = 'Вы отклонили запрос на подпись в MetaMask.';
    } else if (error.response && error.response.data && error.response.data.error) {
      errorMessage = error.response.data.error;
    } else if (error.message) {
      errorMessage = error.message;
    }
    
    return { 
      success: false, 
      error: errorMessage
    };
  }
}; 