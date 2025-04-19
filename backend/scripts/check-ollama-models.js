const axios = require('axios');

async function checkOllamaModels() {
  try {
    console.log('Проверка доступных моделей Ollama...');

    const baseUrl = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
    const response = await axios.get(`${baseUrl}/api/tags`, {
      timeout: 5000, // 5 секунд таймаут
    });

    if (response.status === 200 && response.data && response.data.models) {
      console.log('\nДоступные модели Ollama:');
      console.log('------------------------');

      response.data.models.forEach((model) => {
        console.log(`- ${model.name}`);
      });

      console.log('\nДля использования конкретной модели, укажите ее в .env файле:');
      console.log('OLLAMA_EMBEDDINGS_MODEL=mistral');
      console.log('OLLAMA_MODEL=mistral');
    } else {
      console.log('Не удалось получить список моделей');
    }
  } catch (error) {
    console.error('Ошибка при проверке моделей Ollama:', error.message);
    console.log('\nУбедитесь, что Ollama запущен. Вы можете запустить его командой:');
    console.log('ollama serve');
  }
}

// Запускаем проверку
checkOllamaModels();
