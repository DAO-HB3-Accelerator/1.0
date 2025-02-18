<template>
  <div id="app">
    <h1>Добро пожаловать в DApp-for-Business</h1>
    <appkit-button 
      balance="show"
      size="md"
      label="Подключить кошелек"
      loadingLabel="Подключение..."
    />
    <ContractInteraction />
  </div>
</template>

<script>
import ContractInteraction from './components/ContractInteraction.vue'

export default {
  name: "App",
  components: {
    ContractInteraction
  }
};
</script>

<style>
/* Добавьте ваши стили здесь */
</style> 