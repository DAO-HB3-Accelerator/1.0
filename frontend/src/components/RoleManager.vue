<template>
  <div class="role-manager">
    <h2>Управление ролями пользователей</h2>

    <div v-if="loading" class="loading">Загрузка...</div>

    <div v-else-if="error" class="error">
      {{ error }}
    </div>

    <div v-else>
      <div class="current-role">
        <h3>Ваша роль: {{ currentRole }}</h3>
        <button @click="checkRole" :disabled="checkingRole">
          {{ checkingRole ? 'Проверка...' : 'Обновить роль' }}
        </button>
      </div>

      <div v-if="isAdmin" class="admin-section">
        <h3>Пользователи системы</h3>
        <table class="users-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Имя пользователя</th>
              <th>Роль</th>
              <th>Язык</th>
              <th>Дата регистрации</th>
              <th>Последняя проверка токенов</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="user in users" :key="user.id">
              <td>{{ user.id }}</td>
              <td>{{ user.username || 'Не указано' }}</td>
              <td>{{ user.role || 'user' }}</td>
              <td>{{ user.preferred_language || 'ru' }}</td>
              <td>{{ formatDate(user.created_at) }}</td>
              <td>{{ user.last_token_check ? formatDate(user.last_token_check) : 'Не проверялся' }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>

<script>
import { ref, onMounted, computed } from 'vue';
import axios from 'axios';

export default {
  setup() {
    const loading = ref(false);
    const error = ref(null);
    const users = ref([]);
    const currentRole = ref('user');
    const isAdmin = ref(false);
    const checkingRole = ref(false);
    
    // Загрузка пользователей с ролями
    const loadUsers = async () => {
      try {
        loading.value = true;
        const response = await axios.get('/api/roles/users');
        users.value = response.data;
      } catch (err) {
        console.error('Error loading users:', err);
        error.value = 'Ошибка при загрузке пользователей';
      } finally {
        loading.value = false;
      }
    };
    
    // Проверка роли текущего пользователя
    const checkRole = async () => {
      try {
        checkingRole.value = true;
        const response = await axios.post('/api/roles/check-role');
        isAdmin.value = response.data.isAdmin;
        currentRole.value = isAdmin.value ? 'admin' : 'user';
        
        // Если пользователь стал администратором, загрузим список пользователей
        if (isAdmin.value) {
          await loadUsers();
        }
      } catch (err) {
        console.error('Error checking role:', err);
        error.value = 'Ошибка при проверке роли';
      } finally {
        checkingRole.value = false;
      }
    };
    
    // Форматирование даты
    const formatDate = (dateString) => {
      if (!dateString) return '';
      const date = new Date(dateString);
      return date.toLocaleString('ru-RU');
    };
    
    onMounted(async () => {
      // Проверяем роль при загрузке компонента
      await checkRole();
    });
    
    return {
      loading,
      error,
      users,
      currentRole,
      isAdmin,
      checkingRole,
      checkRole,
      formatDate
    };
  }
};
</script>

<style scoped>
.role-manager {
  padding: 20px;
}

.loading, .error {
  padding: 20px;
  text-align: center;
}

.error {
  color: red;
}

.current-role {
  margin-bottom: 20px;
  padding: 15px;
  background-color: #f5f5f5;
  border-radius: 5px;
}

.users-table {
  width: 100%;
  border-collapse: collapse;
  margin-top: 20px;
}

.users-table th, .users-table td {
  border: 1px solid #ddd;
  padding: 8px;
  text-align: left;
}

.users-table th {
  background-color: #f2f2f2;
}

.admin-section {
  margin-top: 30px;
}
</style>
