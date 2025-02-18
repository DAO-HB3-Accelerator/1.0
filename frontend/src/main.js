import { createApp } from 'vue';
import App from './App.vue';
import { createAppKit } from '@reown/appkit/vue';
import { EthersAdapter } from '@reown/appkit-adapter-ethers';
import { sepolia } from '@reown/appkit/networks';
import { createSIWEConfig, formatMessage } from '@reown/appkit-siwe';

// Определяем базовый URL для API
const BASE_URL = 'http://localhost:3000';

// 1. Get projectId
const projectId = '9a6515f7259ebccd149fd53341e01e6b';

// 2. Create SIWE config
const siweConfig = createSIWEConfig({
  getMessageParams: async () => ({
    domain: window.location.host,
    uri: window.location.origin,
    chains: [11155111], // Sepolia chainId
    statement: 'Подпишите это сообщение для входа в DApp for Business. Это безопасно и не требует оплаты.',
  }),
  createMessage: ({ address, ...args }) => formatMessage(args, address),
  getNonce: async () => {
    try {
      const res = await fetch(`${BASE_URL}/nonce`, {
        method: 'GET',
        credentials: 'include',
        headers: {
          'Accept': 'text/plain'
        }
      });
      if (!res.ok) throw new Error('Failed to get nonce');
      return await res.text();
    } catch (error) {
      console.error('Ошибка получения nonce:', error);
      throw error;
    }
  },
  getSession: async () => {
    try {
      const res = await fetch(`${BASE_URL}/session`, {
        method: 'GET',
        credentials: 'include',
        headers: {
          'Accept': 'application/json'
        }
      });
      if (!res.ok) return null;
      return await res.json();
    } catch (error) {
      console.error('Ошибка получения сессии:', error);
      return null;
    }
  },
  verifyMessage: async ({ message, signature }) => {
    try {
      const res = await fetch(`${BASE_URL}/verify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({ message, signature }),
        credentials: 'include'
      });
      return res.ok;
    } catch (error) {
      console.error('Ошибка верификации:', error);
      return false;
    }
  },
  signOut: async () => {
    try {
      await fetch(`${BASE_URL}/signout`, {
        method: 'GET',
        credentials: 'include'
      });
    } catch (error) {
      console.error('Ошибка выхода:', error);
    }
  }
});

// 3. Create AppKit instance
createAppKit({
  adapters: [new EthersAdapter()],
  networks: [sepolia],
  projectId,
  metadata: {
    name: 'DApp for Business',
    description: 'Smart Contract Management DApp',
    url: window.location.origin,
    icons: ['https://avatars.githubusercontent.com/u/37784886']
  },
  defaultNetwork: sepolia,
  features: {
    analytics: true,
    connectMethodsOrder: ['wallet', 'email', 'social'],
    autoConnect: false
  },
  siweConfig
});

const app = createApp(App);
app.mount('#app'); 