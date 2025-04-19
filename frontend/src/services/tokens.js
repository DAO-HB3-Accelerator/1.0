import api from '../api/axios';

// Адреса смарт-контрактов токенов HB3A
export const TOKEN_CONTRACTS = {
  eth: {
    address: "0xd95a45fc46a7300e6022885afec3d618d7d3f27c",
    symbol: "HB3A",
    network: "Ethereum"
  },
  bsc: {
    address: "0x1d47f12ffA279BFE59Ab16d56fBb10d89AECdD5D",
    symbol: "HB3A",
    network: "BSC"
  },
  arbitrum: {
    address: "0xdce769b847a0a697239777d0b1c7dd33b6012ba0",
    symbol: "HB3A",
    network: "Arbitrum"
  },
  polygon: {
    address: "0x351f59de4fedbdf7601f5592b93db3b9330c1c1d",
    symbol: "HB3A",
    network: "Polygon"
  }
};

// Получение балансов токенов
export const fetchTokenBalances = async () => {
  try {
    const response = await api.get('/api/tokens/balances');
    return response.data;
  } catch (error) {
    console.error('Error fetching token balances:', error);
    return {
      eth: '0',
      bsc: '0',
      arbitrum: '0',
      polygon: '0'
    };
  }
}; 