import axios from 'axios';

// Создаем экземпляр axios с базовым URL
const api = axios.create({
  baseURL: 'http://localhost:8000',
  withCredentials: true, // Важно для передачи куков между запросами
  headers: {
    'Content-Type': 'application/json',
  },
});

// Удаляем перехватчик, который добавлял заголовок Authorization из localStorage
// api.interceptors.request.use(
//   (config) => {
//     const address = localStorage.getItem('walletAddress');
//     if (address) {
//       config.headers.Authorization = `Bearer ${address}`;
//     }
//     return config;
//   },
//   (error) => {
//     return Promise.reject(error);
//   }
// );

export default api;