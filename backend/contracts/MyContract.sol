// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

contract MyContract is Ownable, ReentrancyGuard {
    // Явно объявляем функцию owner
    function owner() public view override returns (address) {
        return super.owner();
    }

    uint256 public price;
    
    event Purchase(address buyer, uint256 amount);

    constructor() {
        price = 0.01 ether; // Начальная цена 0.01 ETH
    }

    function setPrice(uint256 newPrice) public onlyOwner {
        price = newPrice;
    }

    function getPrice() public view returns (uint256) {
        return price;
    }

    function purchase(uint256 amount) public payable nonReentrant {
        require(msg.value == price * amount, "Incorrect payment amount");
        emit Purchase(msg.sender, amount);
    }

    function withdraw() public onlyOwner nonReentrant {
        (bool success, ) = owner().call{value: address(this).balance}("");
        require(success, "Transfer failed");
    }
} 