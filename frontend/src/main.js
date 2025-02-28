import { createApp } from 'vue'
import router from './router/index.js'
import App from './App.vue'

// Создаем и монтируем приложение Vue
const app = createApp(App)
app.use(router)
app.mount('#app') 