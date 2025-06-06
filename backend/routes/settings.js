const express = require('express');
const router = express.Router();
const { requireAdmin } = require('../middleware/auth');
const logger = require('../utils/logger');
const { ethers } = require('ethers');
const rpcProviderService = require('../services/rpcProviderService');
const authTokenService = require('../services/authTokenService');
const aiProviderSettingsService = require('../services/aiProviderSettingsService');
const aiAssistant = require('../services/ai-assistant');
const dns = require('node:dns').promises;
const aiAssistantSettingsService = require('../services/aiAssistantSettingsService');
const aiAssistantRulesService = require('../services/aiAssistantRulesService');

// Логируем версию ethers для отладки
logger.info(`Ethers version: ${ethers.version || 'unknown'}`);

// Получение RPC настроек
router.get('/rpc', requireAdmin, async (req, res, next) => {
  try {
    const rpcConfigs = await rpcProviderService.getAllRpcProviders();
    res.json({ success: true, data: rpcConfigs });
  } catch (error) {
    logger.error('Ошибка при получении RPC настроек:', error);
    next(error);
  }
});

// Добавление/обновление одного или нескольких RPC
router.post('/rpc', requireAdmin, async (req, res, next) => {
  try {
    // Если пришёл массив rpcConfigs — bulk-режим
    if (Array.isArray(req.body.rpcConfigs)) {
      const rpcConfigs = req.body.rpcConfigs;
      if (!rpcConfigs.length) {
        return res.status(400).json({ success: false, error: 'rpcConfigs не может быть пустым массивом' });
      }
      await rpcProviderService.saveAllRpcProviders(rpcConfigs);
      return res.json({ success: true, message: 'RPC провайдеры успешно сохранены (bulk)' });
    }
    // Иначе — одиночный режим (старый)
    const { networkId, rpcUrl, chainId } = req.body;
    if (!networkId || !rpcUrl) {
      return res.status(400).json({ success: false, error: 'networkId и rpcUrl обязательны' });
    }
    await rpcProviderService.upsertRpcProvider({ networkId, rpcUrl, chainId });
    res.json({ success: true, message: 'RPC провайдер сохранён' });
  } catch (error) {
    logger.error('Ошибка при сохранении RPC:', error);
    next(error);
  }
});

// Удаление одного RPC
router.delete('/rpc/:networkId', requireAdmin, async (req, res, next) => {
  try {
    const { networkId } = req.params;
    await rpcProviderService.deleteRpcProvider(networkId);
    res.json({ success: true, message: 'RPC провайдер удалён' });
  } catch (error) {
    logger.error('Ошибка при удалении RPC:', error);
    next(error);
  }
});

// Получение токенов для аутентификации
router.get('/auth-tokens', requireAdmin, async (req, res, next) => {
  try {
    const authTokens = await authTokenService.getAllAuthTokens();
    res.json({ success: true, data: authTokens });
  } catch (error) {
    logger.error('Ошибка при получении токенов аутентификации:', error);
    next(error);
  }
});

// Сохранение токенов для аутентификации
router.post('/auth-tokens', requireAdmin, async (req, res, next) => {
  try {
    const { authTokens } = req.body;
    if (!Array.isArray(authTokens)) {
      return res.status(400).json({ success: false, error: 'Неверный формат данных' });
    }
    await authTokenService.saveAllAuthTokens(authTokens);
    res.json({ success: true, message: 'Токены аутентификации успешно сохранены' });
  } catch (error) {
    logger.error('Ошибка при сохранении токенов аутентификации:', error);
    next(error);
  }
});

// Добавление/обновление одного токена
router.post('/auth-token', requireAdmin, async (req, res, next) => {
  try {
    const { name, address, network, minBalance } = req.body;
    if (!name || !address || !network) {
      return res.status(400).json({ success: false, error: 'name, address и network обязательны' });
    }
    await authTokenService.upsertAuthToken({ name, address, network, minBalance });
    res.json({ success: true, message: 'Токен аутентификации сохранён' });
  } catch (error) {
    logger.error('Ошибка при сохранении токена аутентификации:', error);
    next(error);
  }
});

// Удаление одного токена
router.delete('/auth-token/:address/:network', requireAdmin, async (req, res, next) => {
  try {
    const { address, network } = req.params;
    await authTokenService.deleteAuthToken(address, network);
    res.json({ success: true, message: 'Токен аутентификации удалён' });
  } catch (error) {
    logger.error('Ошибка при удалении токена аутентификации:', error);
    next(error);
  }
});

// Тестирование RPC соединения
router.post('/rpc-test', requireAdmin, async (req, res, next) => {
  try {
    const { rpcUrl, networkId } = req.body;
    
    if (!rpcUrl || !networkId) {
      return res.status(400).json({ success: false, error: 'Необходимо указать URL и ID сети' });
    }
    
    logger.info(`Тестирование RPC для ${networkId}: ${rpcUrl}`);
    
    try {
      // Пробуем создать провайдера и получить номер последнего блока (обновлено для ethers v6)
      let provider;
      if (rpcUrl.startsWith('ws://') || rpcUrl.startsWith('wss://')) {
        provider = new ethers.WebSocketProvider(rpcUrl);
      } else {
        provider = new ethers.JsonRpcProvider(rpcUrl);
      }
      
      // Устанавливаем таймаут для соединения
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Таймаут соединения')), 10000)
      );
      
      // Пробуем получить номер последнего блока с таймаутом
      const blockNumber = await Promise.race([
        provider.getBlockNumber(),
        timeoutPromise
      ]);
  
      logger.info(`Успешное тестирование RPC для ${networkId}: ${rpcUrl}, номер блока: ${blockNumber}`);
      
      res.json({ 
        success: true, 
        message: `Успешное соединение с ${networkId}`, 
        blockNumber 
      });
    } catch (providerError) {
      logger.error(`Ошибка провайдера при тестировании RPC для ${networkId}: ${providerError.message}`);
      res.status(500).json({ 
        success: false, 
        error: providerError.message || 'Не удалось подключиться к RPC провайдеру'
      });
    }
  } catch (error) {
    logger.error(`Неожиданная ошибка при тестировании RPC: ${error.message}`);
    res.status(500).json({ 
      success: false, 
      error: error.message || 'Неизвестная ошибка сервера'
    });
  }
});

// Получить настройки AI-провайдера
router.get('/ai-settings/:provider', requireAdmin, async (req, res, next) => {
  try {
    const { provider } = req.params;
    const settings = await aiProviderSettingsService.getProviderSettings(provider);
    res.json({ success: true, settings });
  } catch (error) {
    logger.error('Ошибка при получении AI-настроек:', error);
    next(error);
  }
});

// Сохранить/обновить настройки AI-провайдера
router.put('/ai-settings/:provider', requireAdmin, async (req, res, next) => {
  try {
    const { provider } = req.params;
    const { api_key, base_url, selected_model } = req.body;
    const updated = await aiProviderSettingsService.upsertProviderSettings({ provider, api_key, base_url, selected_model });
    res.json({ success: true, settings: updated });
  } catch (error) {
    logger.error('Ошибка при сохранении AI-настроек:', error);
    next(error);
  }
});

// Удалить настройки AI-провайдера
router.delete('/ai-settings/:provider', requireAdmin, async (req, res, next) => {
  try {
    const { provider } = req.params;
    await aiProviderSettingsService.deleteProviderSettings(provider);
    res.json({ success: true });
  } catch (error) {
    logger.error('Ошибка при удалении AI-настроек:', error);
    next(error);
  }
});

// Получить список моделей для провайдера
router.get('/ai-settings/:provider/models', requireAdmin, async (req, res, next) => {
  try {
    const { provider } = req.params;
    const settings = await aiProviderSettingsService.getProviderSettings(provider);
    let models = [];
    if (provider === 'ollama') {
      models = await aiAssistant.getAvailableModels();
    } else {
      models = await aiProviderSettingsService.getProviderModels(provider, settings || {});
    }
    res.json({ success: true, models });
  } catch (error) {
    logger.error('Ошибка при получении моделей AI:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Проверить валидность ключа (verify)
router.post('/ai-settings/:provider/verify', requireAdmin, async (req, res, next) => {
  try {
    const { provider } = req.params;
    const { api_key, base_url } = req.body;
    const result = await aiProviderSettingsService.verifyProviderKey(provider, { api_key, base_url });
    if (result.success) {
      res.json({ success: true });
    } else {
      res.status(400).json({ success: false, error: result.error });
    }
  } catch (error) {
    logger.error('Ошибка при проверке AI-ключа:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/ai-assistant', requireAdmin, async (req, res, next) => {
  try {
    const settings = await aiAssistantSettingsService.getSettings();
    res.json({ success: true, settings });
  } catch (error) {
    next(error);
  }
});

router.put('/ai-assistant', requireAdmin, async (req, res, next) => {
  try {
    const updated = await aiAssistantSettingsService.upsertSettings({ ...req.body, updated_by: req.session.userId || null });
    res.json({ success: true, settings: updated });
  } catch (error) {
    next(error);
  }
});

// Получить все наборы правил
router.get('/ai-assistant-rules', requireAdmin, async (req, res, next) => {
  try {
    const rules = await aiAssistantRulesService.getAllRules();
    res.json({ success: true, rules });
  } catch (error) {
    next(error);
  }
});

// Получить набор правил по id
router.get('/ai-assistant-rules/:id', requireAdmin, async (req, res, next) => {
  try {
    const rule = await aiAssistantRulesService.getRuleById(req.params.id);
    res.json({ success: true, rule });
  } catch (error) {
    next(error);
  }
});

// Создать набор правил
router.post('/ai-assistant-rules', requireAdmin, async (req, res, next) => {
  try {
    const created = await aiAssistantRulesService.createRule(req.body);
    res.json({ success: true, rule: created });
  } catch (error) {
    next(error);
  }
});

// Обновить набор правил
router.put('/ai-assistant-rules/:id', requireAdmin, async (req, res, next) => {
  try {
    const updated = await aiAssistantRulesService.updateRule(req.params.id, req.body);
    res.json({ success: true, rule: updated });
  } catch (error) {
    next(error);
  }
});

// Удалить набор правил
router.delete('/ai-assistant-rules/:id', requireAdmin, async (req, res, next) => {
  try {
    await aiAssistantRulesService.deleteRule(req.params.id);
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

// Получить все email_settings для выпадающего списка
router.get('/email-settings', requireAdmin, async (req, res, next) => {
  try {
    const { rows } = await require('../db').getQuery()('SELECT id, from_email FROM email_settings ORDER BY id');
    res.json({ success: true, items: rows });
  } catch (error) {
    next(error);
  }
});

// Получить все telegram_settings для выпадающего списка
router.get('/telegram-settings', requireAdmin, async (req, res, next) => {
  try {
    const { rows } = await require('../db').getQuery()('SELECT id, bot_username FROM telegram_settings ORDER BY id');
    res.json({ success: true, items: rows });
  } catch (error) {
    next(error);
  }
});

module.exports = router; 