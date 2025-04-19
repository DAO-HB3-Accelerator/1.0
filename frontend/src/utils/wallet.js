import axios from 'axios';

async function connectWallet() {
  if (typeof window.ethereum !== 'undefined') {
    try {
      const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
      const address = accounts[0];

      // Получаем nonce
      const nonceResponse = await axios.get(`/api/auth/nonce?address=${address}`, {
        withCredentials: true // Важно для сохранения сессии
      });
      const nonce = nonceResponse.data.nonce;

      // Подписываем сообщение
      const message = `Sign this message to authenticate with our app: ${nonce}`;
      const signature = await window.ethereum.request({
        method: 'personal_sign',
        params: [message, address]
      });

      // Отправляем запрос на проверку
      const verifyResponse = await axios.post('/api/auth/verify', {
        address,
        signature,
        message
      }, {
        withCredentials: true // Важно для сохранения сессии
      });
      
      console.log('Успешно подключен:', verifyResponse.data);
      
      // Возвращаем результат подключения
      return {
        success: true,
        authenticated: verifyResponse.data.authenticated,
        address: address,
        isAdmin: verifyResponse.data.isAdmin,
        authType: 'wallet'
      };
    } catch (error) {
      console.error('Ошибка при подключении кошелька:', error);
      return { success: false, error: error.message };
    }
  } else {
    console.error('MetaMask не установлен');
    return { success: false, error: 'MetaMask не установлен' };
  }
}

async function disconnectWallet() {
  try {
    // Отправляем запрос на выход
    await axios.post(
      '/api/auth/logout',
      {},
      {
        withCredentials: true,
      }
    );

    return { success: true };
  } catch (error) {
    console.error('Ошибка при отключении кошелька:', error);
    throw error;
  }
}

export { connectWallet, disconnectWallet };
