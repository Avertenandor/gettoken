// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

error TransferToZeroAddress();
error InsufficientBalance(uint256 available, uint256 required);
error ExceedsAllowance(uint256 available, uint256 required);
error DecreasedAllowanceBelowZero(uint256 current, uint256 decrease);

contract ConfigERC20 {
    string private _name;
    string private _symbol;
    uint8  private immutable _decimals;

    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);

    constructor(string memory name_, string memory symbol_, uint8 decimals_, uint256 initialSupply_) {
        _name = name_;
        _symbol = symbol_;
        _decimals = decimals_;
        totalSupply = initialSupply_;
        balanceOf[msg.sender] = initialSupply_;
        emit Transfer(address(0), msg.sender, initialSupply_);
    }

    function name() public view returns (string memory) { return _name; }
    function symbol() public view returns (string memory) { return _symbol; }
    function decimals() public view returns (uint8) { return _decimals; }

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
