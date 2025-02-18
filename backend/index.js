require('dotenv').config();
const express = require('express');
const { ethers } = require('ethers');

const app = express();
const port = process.env.PORT || 3000;

app.get('/', (req, res) => {
  res.send('Добро пожаловать в DApp-for-Business API');
});

app.listen(port, () => {
  console.log(`Сервер запущен на http://localhost:${port}`);
}); 