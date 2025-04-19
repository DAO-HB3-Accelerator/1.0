const { ChatOllama } = require('@langchain/ollama');
const { HNSWLib } = require('@langchain/community/vectorstores/hnswlib');
const { OpenAIEmbeddings } = require('@langchain/openai');
const logger = require('../utils/logger');
const fetch = require('node-fetch');

class AIAssistant {
  constructor() {
    this.baseUrl = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
    this.defaultModel = process.env.OLLAMA_MODEL || 'qwen2.5';
  }

  // Создание экземпляра ChatOllama с нужными параметрами
  createChat(language = 'ru') {
    const systemPrompt = language === 'ru' 
      ? 'Вы - полезный ассистент. Отвечайте на русском языке.'
      : 'You are a helpful assistant. Respond in English.';

    return new ChatOllama({
      baseUrl: this.baseUrl,
      model: this.defaultModel,
      system: systemPrompt,
      temperature: 0.7,
      maxTokens: 1000,
      timeout: 30000 // 30 секунд таймаут
    });
  }

  // Определение языка сообщения
  detectLanguage(message) {
    const cyrillicPattern = /[а-яА-ЯёЁ]/;
    return cyrillicPattern.test(message) ? 'ru' : 'en';
  }

  // Основной метод для получения ответа
  async getResponse(message, language = 'auto') {
    try {
      console.log('getResponse called with:', { message, language });
      
      // Определяем язык, если не указан явно
      const detectedLanguage = language === 'auto' 
        ? this.detectLanguage(message) 
        : language;

      console.log('Detected language:', detectedLanguage);
      
      // Сначала пробуем прямой API запрос
      try {
        console.log('Trying direct API request...');
        const response = await this.fallbackRequest(message, detectedLanguage);
        console.log('Direct API response received:', response);
        return response;
      } catch (error) {
        console.error('Error in direct API request:', error);
      }

      // Если прямой запрос не удался, пробуем через ChatOllama
      const chat = this.createChat(detectedLanguage);
      try {
        console.log('Sending request to ChatOllama...');
        const response = await chat.invoke(message);
        console.log('ChatOllama response:', response);
        return response.content;
      } catch (error) {
        console.error('Error using ChatOllama:', error);
        throw error;
      }
    } catch (error) {
      console.error('Error in getResponse:', error);
      return "Извините, я не смог обработать ваш запрос. Пожалуйста, попробуйте позже.";
    }
  }

  // Альтернативный метод запроса через прямой API
  async fallbackRequest(message, language) {
    try {
      console.log('Using fallback request method with:', { message, language });
      
      const systemPrompt = language === 'ru'
        ? 'Вы - полезный ассистент. Отвечайте на русском языке.'
        : 'You are a helpful assistant. Respond in English.';

      console.log('Sending request to Ollama API...');
      const response = await fetch(`${this.baseUrl}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.defaultModel,
          prompt: message,
          system: systemPrompt,
          stream: false,
          options: {
            temperature: 0.7,
            num_predict: 1000
          }
        }),
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      console.log('Ollama API response:', data);
      return data.response;
    } catch (error) {
      console.error('Error in fallback request:', error);
      throw error;
    }
  }

  // Получение списка доступных моделей
  async getAvailableModels() {
    try {
      const response = await fetch(`${this.baseUrl}/api/tags`);
      const data = await response.json();
      return data.models || [];
    } catch (error) {
      logger.error('Error getting available models:', error);
      return [];
    }
  }

  // Добавляем методы из vectorStore.js
  async initVectorStore() {
    // ... код инициализации ...
  }

  async findSimilarDocuments(query, k = 3) {
    // ... код поиска документов ...
  }
}

// Создаем и экспортируем единственный экземпляр
const aiAssistant = new AIAssistant();
module.exports = aiAssistant;
