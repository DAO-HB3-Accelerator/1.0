const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("MyContract", function () {
  let myContract;
  let owner;
  let addr1;
  let addr2;

  beforeEach(async function () {
    // Получаем аккаунты из Hardhat
    [owner, addr1, addr2] = await ethers.getSigners();

    // Деплоим контракт
    const MyContract = await ethers.getContractFactory("MyContract");
    myContract = await MyContract.deploy();
    await myContract.deployed();
  });

  describe("Deployment", function () {
    it("Should set the right owner", async function () {
      expect(await myContract.owner()).to.equal(owner.address);
    });
  });

  describe("Transactions", function () {
    it("Should allow owner to set new owner", async function () {
      await myContract.setOwner(addr1.address);
      expect(await myContract.owner()).to.equal(addr1.address);
    });

    it("Should fail if non-owner tries to set new owner", async function () {
      // Подключаемся к контракту от имени addr1
      const contractConnectedToAddr1 = myContract.connect(addr1);
      
      // Ожидаем, что транзакция будет отменена
      await expect(
        contractConnectedToAddr1.setOwner(addr2.address)
      ).to.be.revertedWith("Only owner can call this function");
    });
  });
}); 