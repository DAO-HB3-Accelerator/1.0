import { defineStore } from 'pinia';
import axios from '../api/axios';

export const useAuthStore = defineStore('auth', {
  state: () => ({
    user: null,
    isAuthenticated: false,
    isAdmin: false,
    authType: null,
    identities: {},
    loading: false,
    error: null
  }),
  
  actions: {
    async connectWallet(address, signature, message) {
      this.loading = true;
      this.error = null;
      
      try {
        const response = await axios.post('/api/auth/verify', {
          address, 
          signature, 
          message
        });
        
        this.user = {
          id: response.data.userId,
          address
        };
        this.isAuthenticated = response.data.authenticated;
        this.isAdmin = response.data.isAdmin;
        this.authType = response.data.authType;
        this.identities = response.data.identities || {};
        
        return true;
      } catch (error) {
        this.error = error.response?.data?.error || 'Ошибка подключения кошелька';
        return false;
      } finally {
        this.loading = false;
      }
    },
    
    async connectTelegram(telegramData) {
      this.loading = true;
      this.error = null;
      
      try {
        const response = await axios.post('/api/auth/telegram', telegramData);
        
        this.user = {
          id: response.data.userId,
          telegramId: telegramData.telegramId
        };
        this.isAuthenticated = response.data.authenticated;
        this.isAdmin = response.data.isAdmin;
        this.authType = response.data.authType;
        this.identities = response.data.identities || {};
        
        return true;
      } catch (error) {
        this.error = error.response?.data?.error || 'Ошибка подключения Telegram';
        return false;
      } finally {
        this.loading = false;
      }
    },
    
    async connectEmail(email, verificationCode) {
      this.loading = true;
      this.error = null;
      
      try {
        const response = await axios.post('/api/auth/email', {
          email, verificationCode
        });
        
        this.user = {
          id: response.data.userId,
          email
        };
        this.isAuthenticated = response.data.authenticated;
        this.isAdmin = response.data.isAdmin;
        this.authType = response.data.authType;
        this.identities = response.data.identities || {};
        
        return true;
      } catch (error) {
        this.error = error.response?.data?.error || 'Ошибка подключения Email';
        return false;
      } finally {
        this.loading = false;
      }
    },
    
    async linkIdentity(identityType, identityValue) {
      this.loading = true;
      this.error = null;
      
      try {
        const response = await axios.post('/api/auth/link-identity', {
          identityType, identityValue
        });
        
        this.identities = response.data.identities;
        this.isAdmin = response.data.isAdmin;
        
        return true;
      } catch (error) {
        this.error = error.response?.data?.error || 'Ошибка связывания аккаунта';
        return false;
      } finally {
        this.loading = false;
      }
    },
    
    async logout() {
      try {
        await axios.post('/api/auth/logout');
      } catch (error) {
        console.error('Ошибка при выходе:', error);
      }
      
      this.user = null;
      this.isAuthenticated = false;
      this.isAdmin = false;
      this.authType = null;
      this.identities = {};
    },
    
    async checkAuth() {
      try {
        const response = await axios.get('/api/auth/check');
        
        if (response.data.authenticated) {
          this.user = {
            id: response.data.userId
          };
          this.isAuthenticated = true;
          this.isAdmin = response.data.isAdmin;
          this.authType = response.data.authType;
          this.identities = response.data.identities || {};
        } else {
          this.logout();
        }
      } catch (error) {
        console.error('Ошибка при проверке аутентификации:', error);
        this.logout();
      }
    }
  }
});
