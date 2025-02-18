<template>
  <div ref="walletButton"></div>
</template>

<script>
import { onMounted, ref } from 'vue';
import '@reown/appkit-wallet-button/react';

export default {
  name: 'WalletButtonWrapper',
  props: {
    wallet: {
      type: String,
      required: true
    }
  },
  setup(props) {
    const walletButton = ref(null);

    onMounted(() => {
      const button = document.createElement('appkit-wallet-button');
      button.setAttribute('wallet', props.wallet);
      walletButton.value.appendChild(button);
    });

    return {
      walletButton
    };
  }
};
</script> 