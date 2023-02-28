// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "@openzeppelin/contracts/utils/Address.sol";

/**
 * @title QuasiEscrow
 */
contract QuasiEscrow is ReentrancyGuard, Ownable {
  using Address for address payable;
  using SafeMath for uint256;

  mapping(address => Deposit) private _deposits;

  // packed struct for storage optimization
  struct Deposit {
    address payee; // 160/256 bits
    uint96 timePeriod; // 256/256 bits - in seconds
    uint256 date; // timestamp
    uint256 periodAmount; // in wei per period elapsed
    uint256 totalAmount; // in wei
    uint256 withdrawnAmount; // The total amount withdrawn so far
  }

  event Deposited(address indexed payee, uint256 amount);
  event Withdrawn(address indexed payee, uint256 amount);

  /**
   * @dev Returns the details regarding the deposit, restricted to owner only
   * @param payee The destination address of the funds.
   */
  function depositOf(
    address payee
  ) public view onlyOwner returns (Deposit memory) {
    return _deposits[payee];
  }

  /**
   * @dev Stores the details regarding the deposit
   * @param payee The destination address of the funds.
   * @param timePeriod The timePeriod in seconds for a single withdraw to be allowed
   * @param periodAmount The amount of coins that can be withdran per period
   *
   * Emits a {Deposited} event.
   */
  function deposit(
    address payee,
    uint96 timePeriod,
    uint256 periodAmount
  ) public payable {
    uint256 amount = msg.value;

    require(amount > 0, "Amount should be greater than zero");

    require(
      _deposits[payee].totalAmount == 0,
      "There are already funds deposited for this payee"
    );

    _deposits[payee] = Deposit(
      payee,
      timePeriod,
      block.timestamp,
      periodAmount,
      amount,
      0
    );

    emit Deposited(payee, amount);
  }

  /**
   * @dev Withdraw accumulated balance for a payee, forwarding all gas to the
   * recipient.
   *
   * @param amount The amount to be withdrawn.
   *
   * Emits a {Withdrawn} event.
   */
  function withdraw(uint256 amount) public nonReentrant {
    Deposit storage payeeDeposit = _deposits[msg.sender];

    require(
      payeeDeposit.totalAmount > 0,
      "No funds deposited for this address"
    );

    require(amount > 0, "Amount should be greater than zero");

    // SafeMath is good, but increases gas cost, it's a tradeoff to discuss if needed
    uint256 amountAvailable = block
      .timestamp
      .sub(payeeDeposit.date)
      .div(payeeDeposit.timePeriod)
      .mul(payeeDeposit.periodAmount)
      .sub(payeeDeposit.withdrawnAmount);

    require(amountAvailable > 0, "No funds available for withdrawal");
    require(amountAvailable >= amount, "Amount is greater than available");

    payeeDeposit.withdrawnAmount += amount;

    payable(msg.sender).sendValue(amount);

    if (payeeDeposit.withdrawnAmount == payeeDeposit.totalAmount) {
      delete _deposits[payeeDeposit.payee];
    }

    emit Withdrawn(payeeDeposit.payee, amount);
  }
}
