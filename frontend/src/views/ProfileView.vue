<template>
  <div class="profile">
    <h1>Профиль пользователя</h1>
    
    <div class="profile-info">
      <div class="profile-section">
        <h2>Основная информация</h2>
        <div v-if="loading">Загрузка...</div>
        <div v-else-if="error">{{ error }}</div>
        <div v-else>
          <p><strong>ID:</strong> {{ profile.id }}</p>
          <p><strong>Имя пользователя:</strong> {{ profile.username || 'Не указано' }}</p>
          <p><strong>Роль:</strong> {{ profile.role === 'admin' ? 'Администратор' : 'Пользователь' }}</p>
          <p><strong>Язык интерфейса:</strong> 
            <select v-model="selectedLanguage" @change="updateLanguage">
              <option value="ru">Русский</option>
              <option value="en">English</option>
            </select>
          </p>
        </div>
      </div>
      
      <div class="profile-section">
        <h2>Связанные аккаунты</h2>
        <LinkedAccounts />
      </div>
      
      <div class="profile-section" v-if="isAdmin">
        <h2>Управление ролями</h2>
        <RoleManager />
      </div>
    </div>
  </div>
</template>

<script>
import { ref, onMounted, computed } from 'vue';
import axios from 'axios';
import LinkedAccounts from '../components/LinkedAccounts.vue';
import RoleManager from '../components/RoleManager.vue';

export default {
  components: {
    LinkedAccounts,
    RoleManager
  },
  
  setup() {
    const profile = ref({});
    const loading = ref(true);
    const error = ref(null);
    const selectedLanguage = ref('ru');
    const isAdmin = ref(false);
    
    // Загрузка профиля пользователя
    const loadProfile = async () => {
      try {
        loading.value = true;
        const response = await axios.get('/api/users/profile', {
          withCredentials: true
        });
        profile.value = response.data;
        selectedLanguage.value = response.data.preferred_language || 'ru';
        isAdmin.value = response.data.role === 'admin';
      } catch (err) {
        console.error('Error loading profile:', err);
        error.value = 'Ошибка при загрузке профиля';
      } finally {
        loading.value = false;
      }
    };
    
    // Обновление языка пользователя
    const updateLanguage = async () => {
      try {
        await axios.post('/api/users/update-language', {
          language: selectedLanguage.value
        }, {
          withCredentials: true
        });
        // Обновляем язык в профиле
        profile.value.preferred_language = selectedLanguage.value;
      } catch (err) {
        console.error('Error updating language:', err);
        error.value = 'Ошибка при обновлении языка';
      }
    };
    
    onMounted(async () => {
      await loadProfile();
    });
    
    return {
      profile,
      loading,
      error,
      selectedLanguage,
      isAdmin,
      updateLanguage
    };
  }
};
</script>

<style scoped>
.profile {
  padding: 20px;
}

.profile-info {
  display: grid;
  grid-template-columns: 1fr;
  gap: 20px;
}

@media (min-width: 768px) {
  .profile-info {
    grid-template-columns: repeat(2, 1fr);
  }
}

.profile-section {
  background-color: #f5f5f5;
  padding: 20px;
  border-radius: 5px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

h1, h2 {
  margin-top: 0;
}

select {
  padding: 5px;
  border-radius: 3px;
  border: 1px solid #ccc;
}
</style>
