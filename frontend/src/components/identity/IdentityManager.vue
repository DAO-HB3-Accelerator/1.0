<script setup>
import { ref, onMounted } from 'vue';
import { useAuthStore } from '../../stores/auth';

const authStore = useAuthStore();
const identities = ref({});
const newIdentity = ref({ type: 'email', value: '' });
const loading = ref(false);
const error = ref(null);

onMounted(async () => {
  try {
    loading.value = true;
    const response = await fetch('/api/access/tokens', {
      credentials: 'include'
    });
    const data = await response.json();
    identities.value = data.identities || {};
  } catch (err) {
    error.value = 'Ошибка при загрузке идентификаторов';
    console.error(err);
  } finally {
    loading.value = false;
  }
});

async function addIdentity() {
  try {
    loading.value = true;
    error.value = null;
    
    const success = await authStore.linkIdentity(
      newIdentity.value.type,
      newIdentity.value.value
    );
    
    if (success) {
      identities.value = authStore.identities;
      newIdentity.value.value = '';
    }
  } catch (err) {
    error.value = 'Ошибка при добавлении идентификатора';
    console.error(err);
  } finally {
    loading.value = false;
  }
}
</script>
