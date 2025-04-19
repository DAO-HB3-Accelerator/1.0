import { createRouter, createWebHistory } from 'vue-router';
import { useAuthStore } from '../stores/auth';
import HomeView from '../views/HomeView.vue';
import ChatView from '../views/ChatView.vue';

const routes = [
  {
    path: '/',
    name: 'home',
    component: HomeView,
    meta: { requiresAuth: false },
  },
  {
    path: '/chat',
    name: 'chat',
    component: ChatView,
    meta: { requiresAuth: true }
  }
];

const router = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior(to, from, savedPosition) {
    return savedPosition || { top: 0 };
  },
});

// Навигационный хук для проверки аутентификации
router.beforeEach(async (to, from, next) => {
  const authStore = useAuthStore();
  
  // Проверяем аутентификацию, если она еще не проверена
  if (!authStore.isAuthenticated) {
    try {
      await authStore.checkAuth();
    } catch (error) {
      console.error('Error checking auth:', error);
    }
  }
  
  // Проверка прав доступа
  if (to.meta.requiresAuth && !authStore.isAuthenticated) {
    next({ name: 'home' });
  } else {
    next();
  }
});

export default router;
