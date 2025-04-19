import { createRouter, createWebHistory } from 'vue-router';
import HomeView from '../views/HomeView.vue';
import axios from 'axios';

console.log('router/index.js: Script loaded');

const routes = [
  {
    path: '/',
    name: 'home',
    component: HomeView
  }
];

const router = createRouter({
  history: createWebHistory(),
  routes
});

console.log('router/index.js: Router created');

// Защита маршрутов
router.beforeEach(async (to, from, next) => {
  // Если пытаемся перейти на несуществующий маршрут, перенаправляем на главную
  if (!to.matched.length) {
    return next({ name: 'home' });
  }
  
  // Проверяем аутентификацию, если маршрут требует авторизации
  if (to.matched.some(record => record.meta.requiresAuth)) {
    try {
      const response = await axios.get('/api/auth/check');
      if (response.data.authenticated) {
        next();
      } else {
        next('/login');
      }
    } catch (error) {
      next('/login');
    }
  } else {
    next();
  }
});

export default router;
