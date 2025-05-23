import { ref } from 'vue';

export function useNotifications() {
  const notifications = ref({
    successMessage: '',
    showSuccess: false,
    errorMessage: '',
    showError: false,
    // Можно добавить info/warning по аналогии
  });

  let successTimeout = null;
  let errorTimeout = null;

  const showSuccessMessage = (message, duration = 3000) => {
    clearTimeout(successTimeout);
    notifications.value.successMessage = message;
    notifications.value.showSuccess = true;
    successTimeout = setTimeout(() => {
      notifications.value.showSuccess = false;
    }, duration);
  };

  const showErrorMessage = (message, duration = 3000) => {
    clearTimeout(errorTimeout);
    notifications.value.errorMessage = message;
    notifications.value.showError = true;
    errorTimeout = setTimeout(() => {
      notifications.value.showError = false;
    }, duration);
  };

  const hideSuccessMessage = () => {
      clearTimeout(successTimeout);
      notifications.value.showSuccess = false;
  };

  const hideErrorMessage = () => {
      clearTimeout(errorTimeout);
      notifications.value.showError = false;
  };

  return {
    notifications,
    showSuccessMessage,
    showErrorMessage,
    hideSuccessMessage,
    hideErrorMessage
  };
} 