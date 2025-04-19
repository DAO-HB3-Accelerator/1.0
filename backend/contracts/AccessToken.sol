// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Counters.sol";

contract AccessToken is ERC721, Ownable {
    using Counters for Counters.Counter;
    Counters.Counter private _tokenIds;

    // Роли для токенов
    enum Role { USER, ADMIN }
    
    // Маппинг токен ID => роль
    mapping(uint256 => Role) public tokenRoles;
    
    // Маппинг адрес => активный токен
    mapping(address => uint256) public activeTokens;

    constructor() ERC721("DApp Access Token", "DAT") Ownable() {
        // Инициализация владельца происходит в Ownable()
    }

    // Создание нового токена доступа
    function mintAccessToken(address to, Role role) public onlyOwner {
        require(role == Role.USER || role == Role.ADMIN, "Invalid role");
        
        _tokenIds.increment();
        uint256 newTokenId = _tokenIds.current();
        
        _safeMint(to, newTokenId);
        tokenRoles[newTokenId] = role;
        activeTokens[to] = newTokenId;
    }

    // Проверка роли по адресу
    function checkRole(address user) public view returns (Role) {
        uint256 tokenId = activeTokens[user];
        require(tokenId != 0, "No active token");
        require(ownerOf(tokenId) == user, "Token not owned");
        return tokenRoles[tokenId];
    }

    // Отзыв токена
    function revokeToken(uint256 tokenId) public onlyOwner {
        address tokenOwner = ownerOf(tokenId);
        activeTokens[tokenOwner] = 0;
        _burn(tokenId);
    }

    // Передача токена запрещена
    function _beforeTokenTransfer(
        address from,
        address to,
        uint256 tokenId
    ) internal override {
        require(from == address(0) || to == address(0), "Token transfer not allowed");
        super._beforeTokenTransfer(from, to, tokenId);
    }
} 