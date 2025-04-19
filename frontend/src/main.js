import { Buffer } from 'buffer';
globalThis.Buffer = Buffer;

import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import router from './router';
import axios from 'axios';

// Настройка axios
axios.defaults.baseURL = ''; // Пустой baseURL, так как мы используем прокси
axios.defaults.withCredentials = true; // Важно для работы с сессиями

// Создаем и монтируем приложение Vue
const app = createApp(App);
const pinia = createPinia();

app.use(pinia);
app.use(router);

// Не используем заглушки, так как сервер работает
// if (import.meta.env.DEV) {
//   Promise.all([
//     import('./mocks/chatApi.js'),
//     import('./mocks/authApi.js'),
//     import('./mocks/kanbanApi.js'),
//     import('./mocks/contractApi.js')
//   ]).catch(err => console.error('Failed to load API mocks:', err));
// }

console.log('API URL:', import.meta.env.VITE_API_URL);

app.mount('#app');
