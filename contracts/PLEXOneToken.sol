// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

error TransferToZeroAddress();
error InsufficientBalance(uint256 available, uint256 required);
error ExceedsAllowance(uint256 available, uint256 required);
error DecreasedAllowanceBelowZero(uint256 current, uint256 decrease);

contract PLEXOneToken {
    // === Параметры токена (приватные константы) ===
    string private constant _NAME = "PLEX ONE";
    string private constant _SYMBOL = "PLEX";
    uint8  private constant _DECIMALS = 9;  // Изменено на 9, как в оригинальном токене
    uint256 private constant _TOTAL_SUPPLY = 12_600_000 * 10**uint256(_DECIMALS);

    // Общий запас токенов
    uint256 public totalSupply;

    // Балансы и аппрувы
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    // События ERC-20
    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);

    /// @notice Выдача всей эмиссии на адрес деплоя
    constructor() {
        totalSupply = _TOTAL_SUPPLY;
        balanceOf[msg.sender] = _TOTAL_SUPPLY;
        emit Transfer(address(0), msg.sender, _TOTAL_SUPPLY);
    }

    // === Функции для чтения метаданных токена (ERC-20 стандарт) ===
    function name() public pure returns (string memory) { return _NAME; }
    function symbol() public pure returns (string memory) { return _SYMBOL; }
    function decimals() public pure returns (uint8) { return _DECIMALS; }

    // === Основные функции ERC-20 ===
    function transfer(address to, uint256 value) external returns (bool) {
        if (to == address(0)) revert TransferToZeroAddress();
        uint256 senderBalance = balanceOf[msg.sender];
        if (senderBalance < value) revert InsufficientBalance(senderBalance, value);
        unchecked { balanceOf[msg.sender] = senderBalance - value; balanceOf[to] += value; }
        emit Transfer(msg.sender, to, value);
        return true;
    }

    function approve(address spender, uint256 value) external returns (bool) {
        allowance[msg.sender][spender] = value;
        emit Approval(msg.sender, spender, value);
        return true;
    }

    function transferFrom(address from, address to, uint256 value) external returns (bool) {
        if (to == address(0)) revert TransferToZeroAddress();
        uint256 fromBalance = balanceOf[from];
        if (fromBalance < value) revert InsufficientBalance(fromBalance, value);
        uint256 currentAllowance = allowance[from][msg.sender];
        if (currentAllowance < value) revert ExceedsAllowance(currentAllowance, value);
        unchecked {
            balanceOf[from] = fromBalance - value;
            allowance[from][msg.sender] = currentAllowance - value;
            balanceOf[to] += value;
        }
        emit Transfer(from, to, value);
        emit Approval(from, msg.sender, allowance[from][msg.sender]);
        return true;
    }

    function increaseAllowance(address spender, uint256 addedValue) external returns (bool) {
        allowance[msg.sender][spender] += addedValue;
        emit Approval(msg.sender, spender, allowance[msg.sender][spender]);
        return true;
    }

    function decreaseAllowance(address spender, uint256 subtractedValue) external returns (bool) {
        uint256 current = allowance[msg.sender][spender];
        if (current < subtractedValue) revert DecreasedAllowanceBelowZero(current, subtractedValue);
        unchecked { allowance[msg.sender][spender] = current - subtractedValue; }
        emit Approval(msg.sender, spender, allowance[msg.sender][spender]);
        return true;
    }
}
